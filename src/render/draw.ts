import { dropDistance } from '../game/board';
import { BOARD_W, BUFFER_H, INTERNAL_H } from '../game/constants';
import { CODE_PIECE, shapeOf } from '../game/tetromino';
import type { GameState, PieceId } from '../game/types';
import { COLORS, THEME } from './theme';

export interface BoardLayout {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
}

/** 画一格方块：主体 + 顶部高光 + 底部阴影，形成立体感 */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  color: string,
  alpha = 1,
): void {
  const inset = Math.max(1, Math.round(size * 0.05));
  const gloss = Math.max(2, Math.round(size * 0.16));
  const left = px + inset;
  const top = py + inset;
  const inner = size - inset * 2;

  ctx.globalAlpha = alpha;

  ctx.fillStyle = color;
  ctx.fillRect(left, top, inner, inner);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
  ctx.fillRect(left, top, inner, gloss);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.fillRect(left, top + inner - gloss, inner, gloss);

  ctx.globalAlpha = 1;
}

function drawGhost(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = THEME.ghostFill;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.strokeStyle = THEME.ghostStroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: BoardLayout,
): void {
  const { cell, cols, rows } = layout;
  const width = cols * cell;
  const height = rows * cell;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = THEME.background;
  ctx.fillRect(0, 0, width, height);

  // 网格
  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < cols; x++) {
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, height);
  }
  for (let y = 1; y < rows; y++) {
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(width, y * cell + 0.5);
  }
  ctx.stroke();

  // 已固定方块：跳过顶部隐藏缓冲行
  for (let y = BUFFER_H; y < INTERNAL_H; y++) {
    const py = (y - BUFFER_H) * cell;
    for (let x = 0; x < BOARD_W; x++) {
      const code = state.board.grid[y * BOARD_W + x];
      if (code === 0) continue;
      const id = CODE_PIECE[code];
      if (id === null) continue;
      drawCell(ctx, x * cell, py, cell, COLORS[id]);
    }
  }

  const active = state.active;
  if (active === null) return;

  const cells = shapeOf(active.id, active.rotation);

  // 幽灵：画在实体方块之前，重合处自然被盖住
  const ghostY = active.y + dropDistance(state.board, cells, active.x, active.y);
  for (const [dx, dy] of cells) {
    const py = ghostY + dy - BUFFER_H;
    if (py < 0) continue;
    drawGhost(ctx, (active.x + dx) * cell, py * cell, cell);
  }

  for (const [dx, dy] of cells) {
    const py = active.y + dy - BUFFER_H;
    if (py < 0) continue;
    drawCell(ctx, (active.x + dx) * cell, py * cell, cell, COLORS[active.id]);
  }
}

/** 把方块居中画进给定矩形，用于 Next / Hold 预览 */
export function drawPiecePreview(
  ctx: CanvasRenderingContext2D,
  id: PieceId,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  cell: number,
): void {
  const cells = shapeOf(id, 0);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of cells) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const w = (maxX - minX + 1) * cell;
  const h = (maxY - minY + 1) * cell;
  const originX = boxX + (boxW - w) / 2 - minX * cell;
  const originY = boxY + (boxH - h) / 2 - minY * cell;

  for (const [dx, dy] of cells) {
    drawCell(ctx, originX + dx * cell, originY + dy * cell, cell, COLORS[id]);
  }
}

export function drawNextQueue(
  ctx: CanvasRenderingContext2D,
  queue: readonly PieceId[],
  width: number,
  slotHeight: number,
  slots: number,
  cell: number,
): void {
  ctx.clearRect(0, 0, width, slotHeight * slots);
  for (let i = 0; i < slots; i++) {
    if (i >= queue.length) break;
    drawPiecePreview(ctx, queue[i], 0, i * slotHeight, width, slotHeight, cell);
  }
}

export function drawHold(
  ctx: CanvasRenderingContext2D,
  hold: PieceId | null,
  width: number,
  height: number,
  cell: number,
): void {
  ctx.clearRect(0, 0, width, height);
  if (hold === null) return;
  drawPiecePreview(ctx, hold, 0, 0, width, height, cell);
}
