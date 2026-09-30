/** 七种方块 */
export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** SRS 的 4 个旋转态：0=出生，1=顺时针一次，2=180°，3=逆时针一次 */
export type Rotation = 0 | 1 | 2 | 3;

/** 场地格子编码：0 = 空，1..7 = 对应的方块（见 tetromino.PIECE_CODE） */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Phase = 'ready' | 'playing' | 'paused' | 'gameOver';

export type TSpinKind = 'none' | 'mini' | 'full';

/**
 * 当前活动方块。
 * x / y 是**包围盒左上角**在内部坐标系中的位置；y 向下为正，
 * 且 y 可以为负（方块被踢到场地之上，那里视为空气）。
 */
export interface ActivePiece {
  readonly id: PieceId;
  readonly rotation: Rotation;
  readonly x: number;
  readonly y: number;
}

/**
 * 场地。grid 长度 = INTERNAL_H * BOARD_W，行优先。
 * 第 0..BUFFER_H-1 行是顶部隐藏缓冲行，渲染时跳过。
 */
export interface Board {
  readonly grid: Uint8Array;
}

export type GameEvent =
  | { readonly type: 'PieceMoved' }
  | { readonly type: 'PieceRotated' }
  | { readonly type: 'PieceLocked' }
  | {
      readonly type: 'LinesCleared';
      readonly count: number;
      readonly rows: readonly number[];
      readonly tspin: TSpinKind;
      readonly perfectClear: boolean;
      readonly backToBack: boolean;
    }
  | { readonly type: 'LevelUp'; readonly level: number }
  | { readonly type: 'Hold' }
  | { readonly type: 'HardDrop'; readonly distance: number }
  | { readonly type: 'GameOver'; readonly reason: 'blockOut' | 'lockOut' };

export interface GameState {
  readonly phase: Phase;
  readonly board: Board;
  readonly active: ActivePiece | null;
  /** 待出场队列，长度恒 >= QUEUE_MIN */
  readonly queue: readonly PieceId[];
  readonly hold: PieceId | null;
  /** 当前方块是否已经用过 Hold（每个方块限一次） */
  readonly holdUsed: boolean;
  /** 纯函数 PRNG 状态（mulberry32），放进状态才能整局复现 */
  readonly rngState: number;

  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly combo: number;
  readonly backToBack: boolean;

  /** 重力时间累加器（毫秒） */
  readonly gravityAcc: number;
  /** 已在地面上停留的时间（毫秒） */
  readonly lockTimer: number;
  /** 本次落地已经重置过几次锁定计时器 */
  readonly lockResets: number;
  readonly grounded: boolean;

  /** 上一次成功操作是否为旋转 —— T-Spin 判定的前提 */
  readonly lastActionWasRotation: boolean;
  /** 上一次旋转命中的踢墙偏移序号，4 表示最后一个（T-Spin 特例） */
  readonly lastKickIndex: number;

  readonly softDropping: boolean;

  /** 本帧产生的事件，由外壳消费后清空 */
  readonly events: readonly GameEvent[];
}

export type Action =
  | { readonly type: 'Start' }
  | { readonly type: 'TogglePause' }
  | { readonly type: 'Restart'; readonly seed: number }
  | { readonly type: 'MoveLeft' }
  | { readonly type: 'MoveRight' }
  | { readonly type: 'RotateCW' }
  | { readonly type: 'RotateCCW' }
  | { readonly type: 'Rotate180' }
  | { readonly type: 'SoftDropStart' }
  | { readonly type: 'SoftDropEnd' }
  | { readonly type: 'HardDrop' }
  | { readonly type: 'Hold' }
  | { readonly type: 'Tick'; readonly dt: number };
