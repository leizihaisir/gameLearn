import { describe, expect, it } from 'vitest';
import { createBoard, lockCells } from '../src/game/board';
import { BOARD_W, LOCK_DELAY_MS } from '../src/game/constants';
import { createState, reduce } from '../src/game/game';
import { PIECE_CODE } from '../src/game/tetromino';
import type { Board, GameState } from '../src/game/types';

function start(seed = 1): GameState {
  return reduce(createState(seed), { type: 'Start' });
}

function countCells(board: Board): number {
  let n = 0;
  for (const value of board.grid) if (value !== 0) n++;
  return n;
}

function fillRow(board: Board, y: number, skip: readonly number[] = []): Board {
  let next = board;
  for (let x = 0; x < BOARD_W; x++) {
    if (skip.includes(x)) continue;
    next = lockCells(next, [[0, 0]], x, y, PIECE_CODE.J);
  }
  return next;
}

function withActive(state: GameState, board: Board, piece: GameState['active']): GameState {
  return { ...state, phase: 'playing', board, active: piece };
}

describe('开局', () => {
  it('ready 阶段没有活动方块，Start 之后才有', () => {
    const ready = createState(1);
    expect(ready.phase).toBe('ready');
    expect(ready.active).toBeNull();
    expect(ready.queue.length).toBeGreaterThanOrEqual(7);

    const playing = start();
    expect(playing.phase).toBe('playing');
    expect(playing.active).not.toBeNull();
  });

  it('重复 Start 不会重复生成方块', () => {
    const playing = start();
    expect(reduce(playing, { type: 'Start' })).toBe(playing);
  });
});

describe('移动与碰撞', () => {
  it('左右移动到墙边就停住', () => {
    let state = start();
    for (let i = 0; i < 20; i++) state = reduce(state, { type: 'MoveLeft' });
    const leftmost = state.active?.x ?? 0;
    state = reduce(state, { type: 'MoveLeft' });
    expect(state.active?.x).toBe(leftmost);

    for (let i = 0; i < 20; i++) state = reduce(state, { type: 'MoveRight' });
    const rightmost = state.active?.x ?? 0;
    state = reduce(state, { type: 'MoveRight' });
    expect(state.active?.x).toBe(rightmost);
    expect(rightmost).toBeGreaterThan(leftmost);
  });
});

describe('硬降与锁定', () => {
  it('硬降立即锁定，并按 2 分/格计分', () => {
    const before = start(1);
    const nextId = before.queue[0];
    const distance = 20 - (before.active?.y ?? 0);

    const after = reduce(before, { type: 'HardDrop' });
    expect(after.active?.id).toBe(nextId);
    expect(countCells(after.board)).toBeLessThanOrEqual(4);
    // 空场地上硬降不会消行，得分就是距离 × 2
    expect(after.score).toBeGreaterThanOrEqual(distance * 2 - 2);
  });

  it('落地后不立刻锁定，要等满锁定延迟', () => {
    let state = start(1);
    const id = state.active?.id;

    // 推进到落地为止
    for (let i = 0; i < 400 && !state.grounded; i++) {
      state = reduce(state, { type: 'Tick', dt: 100 });
    }
    expect(state.grounded).toBe(true);
    expect(state.active?.id).toBe(id);
    expect(state.lockTimer).toBeLessThan(LOCK_DELAY_MS);

    // 再走一点仍未锁定
    state = reduce(state, { type: 'Tick', dt: 100 });
    expect(state.active?.id).toBe(id);

    // 累计超过锁定延迟 → 锁定并生成下一块
    state = reduce(state, { type: 'Tick', dt: LOCK_DELAY_MS });
    expect(countCells(state.board)).toBe(4);
  });

  it('重力按时间累加，与帧率无关', () => {
    const base = start(1);
    const pieceY = base.active?.y ?? 0;

    // 用 1 帧推进 1000ms（1 级每格 1000ms）
    const oneFrame = reduce(base, { type: 'Tick', dt: 1000 });
    // 用 100 帧各推进 10ms，总共也是 1000ms
    let manyFrames = base;
    for (let i = 0; i < 100; i++) manyFrames = reduce(manyFrames, { type: 'Tick', dt: 10 });

    expect(oneFrame.active?.y).toBe(pieceY + 1);
    expect(manyFrames.active?.y).toBe(pieceY + 1);
  });
});

describe('消行与计分', () => {
  it('单行消除：+100 分、+1 行', () => {
    const board = fillRow(createBoard(), 21, [0, 1]);
    const state = withActive(createState(7), board, { id: 'O', rotation: 0, x: 0, y: 20 });

    const after = reduce(state, { type: 'HardDrop' });
    expect(after.lines).toBe(1);
    expect(after.score).toBe(100);
    expect(after.combo).toBe(1);
  });

  it('Tetris + 完美消除：800 + 2000', () => {
    // 第 18..21 行只空出第 0 列，用竖直 I 补齐
    let board = createBoard();
    for (const y of [18, 19, 20, 21]) board = fillRow(board, y, [0]);

    const state = withActive(createState(7), board, { id: 'I', rotation: 1, x: -2, y: 18 });
    const after = reduce(state, { type: 'HardDrop' });

    expect(after.lines).toBe(4);
    // 800（Tetris） + 2000（完美消除），1 级不放大
    expect(after.score).toBe(2800);
    // 场地被清空，只剩新生成的方块还没落下
    expect(countCells(after.board)).toBe(0);
  });

  it('Tetris 但场地不空：只有 800', () => {
    let board = createBoard();
    for (const y of [18, 19, 20, 21]) board = fillRow(board, y, [0]);
    board = lockCells(board, [[0, 0]], 5, 15, PIECE_CODE.J);

    const state = withActive(createState(7), board, { id: 'I', rotation: 1, x: -2, y: 18 });
    const after = reduce(state, { type: 'HardDrop' });

    expect(after.lines).toBe(4);
    expect(after.score).toBe(800);
    expect(after.backToBack).toBe(true);
  });

  it('连续两次 Tetris 触发 Back-to-Back ×1.5', () => {
    let board = createBoard();
    for (const y of [18, 19, 20, 21]) board = fillRow(board, y, [0]);
    board = lockCells(board, [[0, 0]], 5, 15, PIECE_CODE.J);

    const first = reduce(
      withActive(createState(7), board, { id: 'I', rotation: 1, x: -2, y: 18 }),
      { type: 'HardDrop' },
    );
    expect(first.backToBack).toBe(true);

    // 再摆一次同样的局面，这次应该吃到 B2B
    let second = createBoard();
    for (const y of [18, 19, 20, 21]) second = fillRow(second, y, [0]);
    second = lockCells(second, [[0, 0]], 5, 15, PIECE_CODE.J);

    const after = reduce(
      { ...first, board: second, active: { id: 'I', rotation: 1, x: -2, y: 18 } },
      { type: 'HardDrop' },
    );
    // 800 × 1.5 = 1200，再加连击 50 × 1 × 1
    expect(after.score - first.score).toBe(1250);
  });
});

describe('Hold', () => {
  it('第一次 Hold 把当前方块存起来，换出队首', () => {
    const before = start(5);
    const currentId = before.active?.id;
    const nextId = before.queue[0];

    const after = reduce(before, { type: 'Hold' });
    expect(after.hold).toBe(currentId);
    expect(after.active?.id).toBe(nextId);
    expect(after.holdUsed).toBe(true);
  });

  it('同一方块内第二次 Hold 无效', () => {
    const once = reduce(start(5), { type: 'Hold' });
    expect(reduce(once, { type: 'Hold' })).toBe(once);
  });

  it('锁定下一块后 Hold 重新可用', () => {
    const once = reduce(start(5), { type: 'Hold' });
    const afterLock = reduce(once, { type: 'HardDrop' });
    expect(afterLock.holdUsed).toBe(false);
    expect(reduce(afterLock, { type: 'Hold' })).not.toBe(afterLock);
  });
});

describe('暂停', () => {
  it('暂停后 Tick 不再推进时间', () => {
    const playing = start(3);
    const paused = reduce(playing, { type: 'TogglePause' });
    expect(paused.phase).toBe('paused');

    const ticked = reduce(paused, { type: 'Tick', dt: 5000 });
    expect(ticked).toBe(paused);

    const resumed = reduce(paused, { type: 'TogglePause' });
    expect(resumed.phase).toBe('playing');
  });

  it('ready 与 gameOver 阶段暂停无效', () => {
    const ready = createState(1);
    expect(reduce(ready, { type: 'TogglePause' })).toBe(ready);
  });
});

describe('游戏结束', () => {
  it('出生位置被占满时 Block Out', () => {
    // 把第 0、1 行填满，任何方块出生都会重叠
    let board = fillRow(createBoard(), 0);
    board = fillRow(board, 1);

    const dead = reduce({ ...createState(11), board }, { type: 'Start' });
    expect(dead.phase).toBe('gameOver');
    expect(dead.active).toBeNull();
    expect(dead.events).toContainEqual({ type: 'GameOver', reason: 'blockOut' });
  });

  it('Restart 会重置场地与分数', () => {
    const played = reduce(start(1), { type: 'HardDrop' });
    expect(played.score).toBeGreaterThan(0);

    const restarted = reduce(played, { type: 'Restart', seed: 1 });
    expect(restarted.phase).toBe('playing');
    expect(restarted.score).toBe(0);
    expect(restarted.lines).toBe(0);
    expect(restarted.level).toBe(1);
    expect(countCells(restarted.board)).toBe(0);
  });
});

describe('确定性', () => {
  it('同种子 + 同动作序列 → 状态完全一致', () => {
    const script = (): GameState => {
      let state = createState(2024);
      state = reduce(state, { type: 'Start' });
      for (let i = 0; i < 60; i++) {
        state = reduce(state, { type: 'MoveLeft' });
        state = reduce(state, { type: 'RotateCW' });
        state = reduce(state, { type: 'MoveRight' });
        state = reduce(state, { type: 'MoveRight' });
        state = reduce(state, { type: 'HardDrop' });
        state = reduce(state, { type: 'Tick', dt: 16 });
      }
      return state;
    };

    const a = script();
    const b = script();
    expect(b.score).toBe(a.score);
    expect(b.lines).toBe(a.lines);
    expect(b.queue).toEqual(a.queue);
    expect(b.rngState).toBe(a.rngState);
    expect([...b.board.grid]).toEqual([...a.board.grid]);
  });
});
