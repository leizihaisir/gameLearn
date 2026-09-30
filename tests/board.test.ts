import { describe, expect, it } from 'vitest';
import {
  clearLines,
  collides,
  createBoard,
  dropDistance,
  isBoardEmpty,
  isRowFull,
  lockCells,
} from '../src/game/board';
import { BOARD_W, INTERNAL_H } from '../src/game/constants';
import { shapeOf, PIECE_CODE } from '../src/game/tetromino';
import type { Board } from '../src/game/types';

function fillRow(board: Board, y: number, skip: readonly number[] = []): Board {
  let next = board;
  for (let x = 0; x < BOARD_W; x++) {
    if (skip.includes(x)) continue;
    next = lockCells(next, [[0, 0]], x, y, PIECE_CODE.J);
  }
  return next;
}

function countRow(board: Board, y: number): number {
  let n = 0;
  for (let x = 0; x < BOARD_W; x++) n += board.grid[y * BOARD_W + x] === 0 ? 0 : 1;
  return n;
}

describe('碰撞检测', () => {
  it('左右墙与地板都算碰撞，场地之上算空气', () => {
    const board = createBoard();
    const o = shapeOf('O', 0); // 2×2
    expect(collides(board, o, 0, 5)).toBe(false);
    expect(collides(board, o, -1, 5)).toBe(true);
    expect(collides(board, o, BOARD_W - 1, 5)).toBe(true);
    expect(collides(board, o, 0, INTERNAL_H - 2)).toBe(false);
    expect(collides(board, o, 0, INTERNAL_H - 1)).toBe(true);
    // y 为负表示在场地之上，视为空
    expect(collides(board, o, 0, -5)).toBe(false);
  });

  it('已固定方块会挡住', () => {
    const board = lockCells(createBoard(), [[0, 0]], 4, 10, PIECE_CODE.T);
    const o = shapeOf('O', 0); // 2×2
    // 第 9 行时底边压到第 10 行的方块
    expect(collides(board, o, 4, 9)).toBe(true);
    // 第 8 行时整块都在方块上方
    expect(collides(board, o, 4, 8)).toBe(false);
    // 左移一列仍然压到同一格
    expect(collides(board, o, 3, 9)).toBe(true);
    // 右移一列就完全错开了
    expect(collides(board, o, 5, 9)).toBe(false);
  });
});

describe('消行', () => {
  it('没有满行时原样返回同一个对象', () => {
    const board = fillRow(createBoard(), 21, [0]);
    const result = clearLines(board);
    expect(result.rows).toEqual([]);
    expect(result.board).toBe(board);
  });

  it('单行消除后上方整体下移', () => {
    let board = fillRow(createBoard(), 21);
    board = lockCells(board, [[0, 0]], 3, 20, PIECE_CODE.T);

    const result = clearLines(board);
    expect(result.rows).toEqual([21]);
    expect(isBoardEmpty(result.board)).toBe(false);
    // 原来第 20 行的那一格应落到第 21 行
    expect(result.board.grid[21 * BOARD_W + 3]).toBe(PIECE_CODE.T);
    expect(result.board.grid[20 * BOARD_W + 3]).toBe(0);
    expect(countRow(result.board, 21)).toBe(1);
  });

  it('连续两行同时消除，位移量为 2', () => {
    let board = fillRow(createBoard(), 21);
    board = fillRow(board, 20);
    board = lockCells(board, [[0, 0]], 7, 19, PIECE_CODE.I);

    const result = clearLines(board);
    expect(result.rows).toEqual([20, 21]);
    expect(result.board.grid[21 * BOARD_W + 7]).toBe(PIECE_CODE.I);
    expect(isBoardEmpty({ grid: result.board.grid.slice(0, 20 * BOARD_W) })).toBe(true);
  });

  it('四行同时消除后场地为空', () => {
    let board = createBoard();
    for (const y of [18, 19, 20, 21]) board = fillRow(board, y);
    const result = clearLines(board);
    expect(result.rows).toEqual([18, 19, 20, 21]);
    expect(isBoardEmpty(result.board)).toBe(true);
  });

  it('isRowFull 对不完整的行返回 false', () => {
    const board = fillRow(createBoard(), 5, [4]);
    expect(isRowFull(board, 5)).toBe(false);
    expect(isRowFull(fillRow(createBoard(), 5), 5)).toBe(true);
  });
});

describe('下落距离', () => {
  it('空场地上 O 从缓冲行落到地板', () => {
    const board = createBoard();
    const distance = dropDistance(board, shapeOf('O', 0), 4, 0);
    // 2 行高的方块，顶部落在内部第 20 行
    expect(distance).toBe(INTERNAL_H - 2);
  });

  it('已有堆叠时会提前停住', () => {
    const board = lockCells(createBoard(), [[0, 0]], 4, 15, PIECE_CODE.J);
    const distance = dropDistance(board, shapeOf('O', 0), 4, 0);
    // 底部停在第 14 行，顶部 y = 13
    expect(distance).toBe(13);
  });
});
