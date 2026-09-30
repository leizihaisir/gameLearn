import { ensureQueue, takeFromQueue } from './bag';
import {
  clearLines,
  collides,
  createBoard,
  dropDistance,
  isBoardEmpty,
  isOccupied,
  lockCells,
} from './board';
import {
  BOARD_W,
  BUFFER_H,
  HARD_DROP_POINT_PER_CELL,
  INTERNAL_H,
  LINES_PER_LEVEL,
  LOCK_DELAY_MS,
  MAX_LEVEL,
  MAX_LOCK_RESETS,
  SOFT_DROP_FACTOR,
  SOFT_DROP_POINT_PER_CELL,
} from './constants';
import { gravityMsPerCell } from './gravity';
import {
  applyBackToBack,
  clearScore,
  comboBonus,
  isDifficultClear,
  levelForLines,
  perfectClearBonus,
} from './scoring';
import { PIECE_CODE, SPAWN_X, SPAWN_Y, kicksFor, shapeOf } from './tetromino';
import type {
  Action,
  ActivePiece,
  GameEvent,
  GameState,
  PieceId,
  Rotation,
  TSpinKind,
} from './types';

/** 方块当前的绝对格子坐标（内部坐标系） */
export function absoluteCells(piece: ActivePiece): Array<readonly [number, number]> {
  return shapeOf(piece.id, piece.rotation).map(
    ([dx, dy]) => [piece.x + dx, piece.y + dy] as const,
  );
}

export function createState(seed = 1): GameState {
  const rngState = seed >>> 0;
  const ensured = ensureQueue([], rngState);
  return {
    phase: 'ready',
    board: createBoard(),
    active: null,
    queue: ensured.queue,
    hold: null,
    holdUsed: false,
    rngState: ensured.rngState,

    score: 0,
    lines: 0,
    level: 1,
    combo: 0,
    backToBack: false,

    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    grounded: false,

    lastActionWasRotation: false,
    lastKickIndex: -1,

    softDropping: false,
    events: [],
  };
}

// ─────────────────────────── 内部工具 ───────────────────────────

/** T 方块中心四个角中，朝向前方的两个（下标对应 0=左上 1=右上 2=左下 3=右下） */
const FRONT_CORNERS: Record<Rotation, readonly [number, number]> = {
  0: [0, 1],
  1: [1, 3],
  2: [2, 3],
  3: [0, 2],
};

/**
 * T-Spin 三角法则：落定的是 T、上一次操作是旋转，且 T 中心四角中
 * 至少 3 个被墙或已固定方块占据。
 * 若朝向的前方两角未同时占据，则降级为 Mini。
 */
function detectTSpin(state: GameState): TSpinKind {
  const active = state.active;
  if (active === null || active.id !== 'T' || !state.lastActionWasRotation) return 'none';

  const corners: Array<readonly [number, number]> = [
    [active.x, active.y],
    [active.x + 2, active.y],
    [active.x, active.y + 2],
    [active.x + 2, active.y + 2],
  ];

  let filled = 0;
  const flags: boolean[] = [];
  for (const [x, y] of corners) {
    const occupied = isOccupied(state.board, x, y);
    flags.push(occupied);
    if (occupied) filled++;
  }
  if (filled < 3) return 'none';

  const [frontA, frontB] = FRONT_CORNERS[active.rotation];
  if (flags[frontA] && flags[frontB]) return 'full';
  // 官方特例：命中最后一个踢墙偏移时始终算完整 T-Spin
  if (state.lastKickIndex === 4) return 'full';
  return 'mini';
}

/** 重新计算「是否贴地」。落地状态会随移动/旋转改变，不能只在重力里更新。 */
function refreshGround(state: GameState): GameState {
  const active = state.active;
  if (active === null) return state;
  const grounded = collides(
    state.board,
    shapeOf(active.id, active.rotation),
    active.x,
    active.y + 1,
  );
  if (grounded === state.grounded) return state;
  return { ...state, grounded, lockTimer: grounded ? state.lockTimer : 0 };
}

/** 落地后成功操作时重置锁定计时器，但次数有上限 */
function resetLock(state: GameState): GameState {
  if (!state.grounded || state.lockResets >= MAX_LOCK_RESETS) return state;
  return { ...state, lockTimer: 0, lockResets: state.lockResets + 1 };
}

function freshPiece(id: PieceId): ActivePiece {
  return { id, rotation: 0, x: SPAWN_X[id], y: SPAWN_Y };
}

// ─────────────────────────── 各种动作 ───────────────────────────

function spawnNext(state: GameState): GameState {
  const taken = takeFromQueue(state.queue, state.rngState);
  const active = freshPiece(taken.id);
  const base: GameState = { ...state, queue: taken.queue, rngState: taken.rngState };

  if (collides(state.board, shapeOf(active.id, 0), active.x, active.y)) {
    // Block Out：出生位置被占满
    return {
      ...base,
      phase: 'gameOver',
      active: null,
      events: [...state.events, { type: 'GameOver', reason: 'blockOut' }],
    };
  }

  return {
    ...base,
    active,
    holdUsed: false,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    grounded: false,
    lastActionWasRotation: false,
    lastKickIndex: -1,
  };
}

function lockPiece(state: GameState): GameState {
  const active = state.active;
  if (active === null) return state;

  const cells = shapeOf(active.id, active.rotation);
  const tspin = detectTSpin(state);
  const locked = lockCells(state.board, cells, active.x, active.y, PIECE_CODE[active.id]);

  // Lock Out：整块都落在隐藏缓冲行内
  const allHidden = cells.every(([, dy]) => active.y + dy < BUFFER_H);
  if (allHidden) {
    return {
      ...state,
      board: locked,
      active: null,
      phase: 'gameOver',
      events: [...state.events, { type: 'PieceLocked' }, { type: 'GameOver', reason: 'lockOut' }],
    };
  }

  const cleared = clearLines(locked);
  const count = cleared.rows.length;

  const difficult = isDifficultClear(count, tspin);
  const b2bApplied = difficult && state.backToBack;

  let gained = applyBackToBack(clearScore(count, tspin), b2bApplied) * state.level;

  let combo = state.combo;
  if (count > 0) {
    gained += comboBonus(combo, state.level);
    combo += 1;
  } else {
    combo = 0;
  }

  const perfectClear = count > 0 && isBoardEmpty(cleared.board);
  if (perfectClear) gained += perfectClearBonus(count) * state.level;

  const lines = state.lines + count;
  const level = levelForLines(lines, MAX_LEVEL, LINES_PER_LEVEL);

  let events: GameEvent[] = [...state.events, { type: 'PieceLocked' }];
  if (count > 0) {
    events = [
      ...events,
      {
        type: 'LinesCleared',
        count,
        rows: cleared.rows,
        tspin,
        perfectClear,
        backToBack: b2bApplied,
      },
    ];
  }
  if (level > state.level) events = [...events, { type: 'LevelUp', level }];

  const next: GameState = {
    ...state,
    board: cleared.board,
    active: null,
    score: state.score + gained,
    lines,
    level,
    combo,
    // 高难消行续上 B2B；普通消行打断；没消行则原样保留
    backToBack: difficult ? true : count > 0 ? false : state.backToBack,
    events,
  };

  return spawnNext(next);
}

function applyMove(state: GameState, dx: number): GameState {
  const active = state.active;
  if (state.phase !== 'playing' || active === null) return state;

  const cells = shapeOf(active.id, active.rotation);
  if (collides(state.board, cells, active.x + dx, active.y)) return state;

  const moved: GameState = {
    ...state,
    active: { ...active, x: active.x + dx },
    lastActionWasRotation: false,
    events: [...state.events, { type: 'PieceMoved' }],
  };
  return resetLock(refreshGround(moved));
}

function applyRotate(state: GameState, dir: 'cw' | 'ccw' | '180'): GameState {
  const active = state.active;
  if (state.phase !== 'playing' || active === null) return state;

  const delta = dir === 'cw' ? 1 : dir === 'ccw' ? 3 : 2;
  const to = ((active.rotation + delta) % 4) as Rotation;
  const rotatedCells = shapeOf(active.id, to);
  const kicks = kicksFor(active.id, active.rotation, to);

  for (let i = 0; i < kicks.length; i++) {
    const [kdx, kdyUp] = kicks[i];
    // 踢墙表 y 向上为正，屏幕 y 向下为正 —— 这里取反
    const nx = active.x + kdx;
    const ny = active.y - kdyUp;
    if (collides(state.board, rotatedCells, nx, ny)) continue;

    const rotated: GameState = {
      ...state,
      active: { ...active, rotation: to, x: nx, y: ny },
      lastActionWasRotation: true,
      lastKickIndex: i,
      events: [...state.events, { type: 'PieceRotated' }],
    };
    return resetLock(refreshGround(rotated));
  }
  return state;
}

function applyHardDrop(state: GameState): GameState {
  const active = state.active;
  if (state.phase !== 'playing' || active === null) return state;

  const cells = shapeOf(active.id, active.rotation);
  const distance = dropDistance(state.board, cells, active.x, active.y);

  const dropped: GameState = {
    ...state,
    active: { ...active, y: active.y + distance },
    score: state.score + distance * HARD_DROP_POINT_PER_CELL,
    grounded: true,
    // 硬降落地超过 0 格就不算「以旋转落定」，否则空转也能骗 T-Spin
    lastActionWasRotation: distance === 0 ? state.lastActionWasRotation : false,
    events: [...state.events, { type: 'HardDrop', distance }],
  };
  return lockPiece(dropped);
}

function applyHold(state: GameState): GameState {
  const active = state.active;
  if (state.phase !== 'playing' || active === null || state.holdUsed) return state;

  const current = active.id;
  let queue = [...state.queue];
  let rngState = state.rngState;
  let incoming: PieceId;

  if (state.hold === null) {
    const taken = takeFromQueue(queue, rngState);
    incoming = taken.id;
    queue = taken.queue;
    rngState = taken.rngState;
  } else {
    incoming = state.hold;
  }

  const next = freshPiece(incoming);
  if (collides(state.board, shapeOf(incoming, 0), next.x, next.y)) {
    return {
      ...state,
      phase: 'gameOver',
      active: null,
      events: [...state.events, { type: 'GameOver', reason: 'blockOut' }],
    };
  }

  return {
    ...state,
    active: next,
    queue,
    rngState,
    hold: current,
    holdUsed: true,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    grounded: false,
    lastActionWasRotation: false,
    lastKickIndex: -1,
    events: [...state.events, { type: 'Hold' }],
  };
}

/**
 * 时间推进：重力 + 锁定延迟。
 *
 * 重力用「时间累加器」而不是「每帧一格」—— 后者会让下落速度随帧率变化，
 * 在 120Hz 屏幕上直接快一倍。
 */
function tick(state: GameState, dt: number): GameState {
  const active0 = state.active;
  if (state.phase !== 'playing' || active0 === null || dt <= 0) return state;

  let active = active0;
  let score = state.score;
  let gravityAcc = state.gravityAcc + dt;
  let lastActionWasRotation = state.lastActionWasRotation;

  const msPerCell =
    gravityMsPerCell(state.level) / (state.softDropping ? SOFT_DROP_FACTOR : 1);

  while (gravityAcc >= msPerCell) {
    if (collides(state.board, shapeOf(active.id, active.rotation), active.x, active.y + 1)) break;
    gravityAcc -= msPerCell;
    active = { ...active, y: active.y + 1 };
    // 方块真的被重力挪动了，之前那次旋转就不能再算 T-Spin
    lastActionWasRotation = false;
    if (state.softDropping) score += SOFT_DROP_POINT_PER_CELL;
  }

  const grounded = collides(
    state.board,
    shapeOf(active.id, active.rotation),
    active.x,
    active.y + 1,
  );

  let lockTimer = state.lockTimer;
  if (grounded) {
    // 落地后不再积攒重力预算，否则离地瞬间会一次性暴冲
    gravityAcc = 0;
    lockTimer += dt;
  } else {
    lockTimer = 0;
  }

  const next: GameState = {
    ...state,
    active,
    score,
    gravityAcc,
    lockTimer,
    grounded,
    lastActionWasRotation,
  };

  if (grounded && lockTimer >= LOCK_DELAY_MS) return lockPiece(next);
  return next;
}

// ─────────────────────────── 唯一入口 ───────────────────────────

/**
 * 唯一的状态变更入口。纯函数：不读时钟、不碰 DOM、无副作用。
 * 随机性来自 state.rngState，所以 (初始状态 + 动作序列) 完全决定结果。
 */
export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'Start':
      if (state.phase !== 'ready') return state;
      return spawnNext({ ...state, phase: 'playing' });

    case 'TogglePause':
      if (state.phase === 'playing') return { ...state, phase: 'paused' };
      if (state.phase === 'paused') return { ...state, phase: 'playing' };
      return state;

    case 'Restart':
      return reduce(createState(action.seed), { type: 'Start' });

    case 'MoveLeft':
      return applyMove(state, -1);
    case 'MoveRight':
      return applyMove(state, 1);
    case 'RotateCW':
      return applyRotate(state, 'cw');
    case 'RotateCCW':
      return applyRotate(state, 'ccw');
    case 'Rotate180':
      return applyRotate(state, '180');

    case 'SoftDropStart':
      return state.phase === 'playing' ? { ...state, softDropping: true } : state;
    case 'SoftDropEnd':
      return state.softDropping ? { ...state, softDropping: false } : state;

    case 'HardDrop':
      return applyHardDrop(state);
    case 'Hold':
      return applyHold(state);
    case 'Tick':
      return tick(state, action.dt);

    default:
      return state;
  }
}

/** 清空本帧事件（外壳消费完之后调用） */
export function clearEvents(state: GameState): GameState {
  return state.events.length === 0 ? state : { ...state, events: [] };
}

/** 便于调试：把场地渲染成字符画 */
export function boardToString(state: GameState): string {
  const lines: string[] = [];
  for (let y = 0; y < INTERNAL_H; y++) {
    let row = '';
    for (let x = 0; x < BOARD_W; x++) {
      row += state.board.grid[y * BOARD_W + x] === 0 ? '.' : '#';
    }
    lines.push(row);
  }
  return lines.join('\n');
}
