import { describe, expect, it } from 'vitest';
import { createBoard, lockCells } from '../src/game/board';
import { ALL_PIECES } from '../src/game/constants';
import { createState, reduce } from '../src/game/game';
import { PIECE_CODE, kicksFor, shapeOf } from '../src/game/tetromino';
import type { Board, GameState, PieceId, Rotation } from '../src/game/types';

function withPiece(
  id: PieceId,
  rotation: Rotation,
  x: number,
  y: number,
  board: Board = createBoard(),
): GameState {
  return {
    ...createState(12345),
    phase: 'playing',
    board,
    active: { id, rotation, x, y },
  };
}

/** 当前方块占用的绝对格子，排序后便于断言 */
function absCells(state: GameState): string[] {
  const piece = state.active;
  if (piece === null) return [];
  return shapeOf(piece.id, piece.rotation)
    .map(([dx, dy]) => `${piece.x + dx},${piece.y + dy}`)
    .sort();
}

const ALL_ROTATIONS: Rotation[] = [0, 1, 2, 3];

describe('方块形状（SRS 旋转由公式推导）', () => {
  it('每种方块每个旋转态都恰好 4 格', () => {
    for (const id of ALL_PIECES) {
      for (const rotation of ALL_ROTATIONS) {
        expect(shapeOf(id, rotation)).toHaveLength(4);
      }
    }
  });

  it('I 的 1 态是 4×4 包围盒里的第 2 列竖条', () => {
    expect(shapeOf('I', 1)).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
  });

  it('I 的 0 态是第 1 行横条', () => {
    expect(shapeOf('I', 0)).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
  });

  it('T 的 1 态朝右、2 态朝下、3 态朝左', () => {
    expect(shapeOf('T', 1)).toEqual([
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ]);
    expect(shapeOf('T', 2)).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ]);
    expect(shapeOf('T', 3)).toEqual([
      [1, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ]);
  });

  it('O 的 4 个旋转态完全相同', () => {
    const base = shapeOf('O', 0);
    for (const rotation of ALL_ROTATIONS) {
      expect(shapeOf('O', rotation)).toEqual(base);
    }
  });

  it('旋转 4 次回到出生态', () => {
    for (const id of ALL_PIECES) {
      expect(shapeOf(id, 0)).toEqual(shapeOf(id, 0));
      // 用 reduce 连转 4 次验证闭环
      let state = withPiece(id, 0, 3, 5);
      for (let i = 0; i < 4; i++) state = reduce(state, { type: 'RotateCW' });
      expect(state.active?.rotation).toBe(0);
      expect(absCells(state)).toEqual(absCells(withPiece(id, 0, 3, 5)));
    }
  });
});

describe('SRS 踢墙表', () => {
  it('JLSTZ 的 0→1 与官方表一致（y 向上为正）', () => {
    expect(kicksFor('T', 0, 1)).toEqual([
      [0, 0],
      [-1, 0],
      [-1, 1],
      [0, -2],
      [-1, -2],
    ]);
  });

  it('I 的 0→1 偏移更大', () => {
    expect(kicksFor('I', 0, 1)).toEqual([
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, -1],
      [1, 2],
    ]);
  });

  it('O 不做踢墙，原地旋转永远是唯一候选', () => {
    expect(kicksFor('O', 0, 1)).toEqual([[0, 0]]);
    expect(kicksFor('O', 2, 3)).toEqual([[0, 0]]);
  });

  it('8 个旋转方向都有 5 个候选偏移', () => {
    const pairs: Array<[Rotation, Rotation]> = [
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
      [2, 3],
      [3, 2],
      [3, 0],
      [0, 3],
    ];
    for (const id of ['T', 'S', 'Z', 'J', 'L', 'I'] as PieceId[]) {
      for (const [from, to] of pairs) {
        expect(kicksFor(id, from, to)).toHaveLength(5);
      }
    }
  });
});

describe('旋转与踢墙的实际落点', () => {
  it('空旷处顺时针旋转不产生位移', () => {
    const before = withPiece('T', 0, 3, 5);
    const after = reduce(before, { type: 'RotateCW' });
    expect(after.active).toEqual({ id: 'T', rotation: 1, x: 3, y: 5 });
    expect(absCells(after)).toEqual(['4,5', '4,6', '4,7', '5,6']);
  });

  it('右侧被挡住时走第 2 个候选偏移 (-1, 0)', () => {
    // 在 (4,7) 放一块，让 T 无法原样转到 1 态
    const board = lockCells(createBoard(), [[0, 0]], 4, 7, PIECE_CODE.J);
    const after = reduce(withPiece('T', 0, 3, 5, board), { type: 'RotateCW' });
    expect(after.active).toEqual({ id: 'T', rotation: 1, x: 2, y: 5 });
  });

  it('贴地旋转会向上踢一格（验证 y 轴取反）', () => {
    // T 的 0 态在 y=20 时占第 20、21 行，转 1 态会伸到第 22 行（越界），
    // 必须命中 (-1, +1)：屏幕坐标 y 减小 → 从 20 抬到 19
    const after = reduce(withPiece('T', 0, 3, 20), { type: 'RotateCW' });
    expect(after.active).toEqual({ id: 'T', rotation: 1, x: 2, y: 19 });
  });

  it('I 贴左墙逆时针旋转会向右踢两格', () => {
    // 1 态的竖条落在地板列 0（x = -2 时包围盒第 2 列正好是 0）
    const before = withPiece('I', 1, -2, 5);
    expect(absCells(before)).toEqual(['0,5', '0,6', '0,7', '0,8']);

    const after = reduce(before, { type: 'RotateCCW' });
    // (0,0) 越左墙 → 命中 (2, 0)
    expect(after.active).toEqual({ id: 'I', rotation: 0, x: 0, y: 5 });
    expect(absCells(after)).toEqual(['0,6', '1,6', '2,6', '3,6']);
  });

  it('四面楚歌时旋转失败，状态原样返回', () => {
    // 把 T 四周全封死：中心在 (4,6) 附近，四角都占上
    let board = createBoard();
    for (const [x, y] of [
      [3, 5],
      [5, 5],
      [3, 7],
      [5, 7],
      [4, 5],
      [4, 7],
      [3, 6],
      [5, 6],
      [4, 4],
      [4, 8],
      [2, 6],
      [6, 6],
    ]) {
      board = lockCells(board, [[0, 0]], x, y, PIECE_CODE.J);
    }
    const before = withPiece('T', 0, 3, 5, board);
    const after = reduce(before, { type: 'RotateCW' });
    expect(after).toBe(before);
  });
});
