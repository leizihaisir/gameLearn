import { BOARD_W, INTERNAL_H } from './constants';
import type { Offset } from './tetromino';
import type { Board, Cell } from './types';

export function createBoard(): Board {
  return { grid: new Uint8Array(BOARD_W * INTERNAL_H) };
}

export function cloneBoard(board: Board): Board {
  return { grid: new Uint8Array(board.grid) };
}

export function cellAt(board: Board, x: number, y: number): Cell {
  if (x < 0 || x >= BOARD_W || y < 0 || y >= INTERNAL_H) return 0;
  return board.grid[y * BOARD_W + x] as Cell;
}

/**
 * 该位置是否视为「已占据」。
 * 左右墙、地板、已固定方块都算；场地之上（y < 0）算空气，
 * 因为踢墙可以把方块短暂推到场地外面。
 */
export function isOccupied(board: Board, x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_W) return true;
  if (y >= INTERNAL_H) return true;
  if (y < 0) return false;
  return board.grid[y * BOARD_W + x] !== 0;
}

export function collides(
  board: Board,
  cells: readonly Offset[],
  x: number,
  y: number,
): boolean {
  for (const [dx, dy] of cells) {
    if (isOccupied(board, x + dx, y + dy)) return true;
  }
  return false;
}

export function lockCells(
  board: Board,
  cells: readonly Offset[],
  x: number,
  y: number,
  code: Cell,
): Board {
  const next = cloneBoard(board);
  for (const [dx, dy] of cells) {
    const cx = x + dx;
    const cy = y + dy;
    if (cx < 0 || cx >= BOARD_W || cy < 0 || cy >= INTERNAL_H) continue;
    next.grid[cy * BOARD_W + cx] = code;
  }
  return next;
}

export function isRowFull(board: Board, y: number): boolean {
  const base = y * BOARD_W;
  for (let x = 0; x < BOARD_W; x++) {
    if (board.grid[base + x] === 0) return false;
  }
  return true;
}

/**
 * 消除所有满行，并让上方的行整体下移。
 * 返回新场地与被消除的行号（内部坐标系，可能包含隐藏缓冲行）。
 */
export function clearLines(board: Board): { board: Board; rows: number[] } {
  const rows: number[] = [];
  for (let y = 0; y < INTERNAL_H; y++) {
    if (isRowFull(board, y)) rows.push(y);
  }
  if (rows.length === 0) return { board, rows };

  const cleared = new Set(rows);
  const next = new Uint8Array(board.grid.length);
  let write = INTERNAL_H - 1;
  for (let y = INTERNAL_H - 1; y >= 0; y--) {
    if (cleared.has(y)) continue;
    next.set(board.grid.subarray(y * BOARD_W, (y + 1) * BOARD_W), write * BOARD_W);
    write--;
  }
  return { board: { grid: next }, rows };
}

/** 方块从当前位置能再下落多少格 */
export function dropDistance(
  board: Board,
  cells: readonly Offset[],
  x: number,
  y: number,
): number {
  let d = 0;
  // 地板一定碰撞，所以循环必然终止
  while (!collides(board, cells, x, y + d + 1)) d++;
  return d;
}

export function isBoardEmpty(board: Board): boolean {
  for (let i = 0; i < board.grid.length; i++) {
    if (board.grid[i] !== 0) return false;
  }
  return true;
}
