import { ALL_PIECES } from './constants';
import type { Cell, PieceId, Rotation } from './types';

/** 形状内的一格，相对包围盒左上角 */
export type Offset = readonly [number, number];

/**
 * SRS 出生态矩阵，'X' 为实心。
 * 每个方块的包围盒都是正方形（I 用 4×4，O 用 2×2，其余 3×3）。
 */
const SPAWN_MATRICES: Record<PieceId, readonly string[]> = {
  I: ['....', 'XXXX', '....', '....'],
  O: ['XX', 'XX'],
  T: ['.X.', 'XXX', '...'],
  S: ['.XX', 'XX.', '...'],
  Z: ['XX.', '.XX', '...'],
  J: ['X..', 'XXX', '...'],
  L: ['..X', 'XXX', '...'],
};

/** 方块 id → 场地存储编码（0 保留给「空」） */
export const PIECE_CODE: Record<PieceId, Cell> = {
  I: 1,
  O: 2,
  T: 3,
  S: 4,
  Z: 5,
  J: 6,
  L: 7,
};

/** 场地存储编码 → 方块 id，下标 0 为 null */
export const CODE_PIECE: readonly (PieceId | null)[] = (() => {
  const arr: (PieceId | null)[] = new Array<PieceId | null>(8).fill(null);
  for (const id of ALL_PIECES) arr[PIECE_CODE[id]] = id;
  return arr;
})();

function byRowThenColumn(a: Offset, b: Offset): number {
  return a[1] - b[1] || a[0] - b[0];
}

function parseMatrix(matrix: readonly string[]): Offset[] {
  const cells: Offset[] = [];
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'X') cells.push([x, y]);
    }
  }
  return cells.sort(byRowThenColumn);
}

/**
 * 每种方块 4 个旋转态的格子偏移，SHAPES[id][rotation]。
 *
 * 关键：SRS 官方定义的各旋转态**恰好等于**出生态在包围盒内顺时针旋转的结果，
 * 所以这里不手抄 28 个矩阵，而是用旋转公式推导：
 *
 *   n×n 包围盒顺时针：(x, y) → (n - 1 - y, x)
 *
 * 已逐块核对：T 的 1 态得到 (1,0)(1,1)(2,1)(1,2)（朝右），
 * I 的 1 态得到第 2 列竖条，均与 SRS 官方表一致。
 */
const SHAPES: Record<PieceId, readonly (readonly Offset[])[]> = (() => {
  const out = {} as Record<PieceId, readonly (readonly Offset[])[]>;
  for (const id of ALL_PIECES) {
    const matrix = SPAWN_MATRICES[id];
    const n = matrix.length;
    let current = parseMatrix(matrix);
    const rotations: Offset[][] = [];
    for (let r = 0; r < 4; r++) {
      rotations.push(current);
      current = current
        .map(([x, y]) => [n - 1 - y, x] as Offset)
        .sort(byRowThenColumn);
    }
    out[id] = rotations;
  }
  return out;
})();

export function shapeOf(id: PieceId, rotation: Rotation): readonly Offset[] {
  return SHAPES[id][rotation];
}

type Kick = readonly [number, number];
type KickTable = Record<string, readonly Kick[]>;

/**
 * SRS 踢墙表。**y 轴向上为正**（沿用官方约定），
 * 而屏幕坐标 y 向下为正，所以使用时必须取反：ny = y - kick.y。
 */
const JLSTZ_KICKS: KickTable = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

/** I 方块的踢墙偏移更大 */
const I_KICKS: KickTable = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const NO_KICK: readonly Kick[] = [[0, 0]];

/**
 * 返回 from → to 的候选踢墙偏移，已按优先级排序。
 * y 分量仍然遵循「向上为正」，调用方负责取反。
 * O 方块 4 态同形，不做踢墙。
 */
export function kicksFor(id: PieceId, from: Rotation, to: Rotation): readonly Kick[] {
  if (id === 'O' || from === to) return NO_KICK;
  const table = id === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}${to}`] ?? NO_KICK;
}

/** 各方块出生时的包围盒左上角列（SRS 标准：I 在 3，O 在 4） */
export const SPAWN_X: Record<PieceId, number> = {
  I: 3,
  O: 4,
  T: 3,
  S: 3,
  Z: 3,
  J: 3,
  L: 3,
};

/** 出生行：包围盒顶贴内部第 0 行，实心格落在隐藏缓冲行里 */
export const SPAWN_Y = 0;
