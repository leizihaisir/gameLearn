import { describe, expect, it } from 'vitest';
import { createBoard, lockCells } from '../src/game/board';
import { createState } from '../src/game/game';
import { PIECE_CODE } from '../src/game/tetromino';
import type { GameState } from '../src/game/types';
import { drawBoard, drawHold, drawNextQueue } from '../src/render/draw';

/**
 * 记录调用的假 2D 上下文。渲染层不碰 DOM，只调用 ctx 的方法，
 * 所以用这个桩就能在 node 里验证绘制路径不炸、并且画了该画的东西。
 */
class FakeContext {
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 1;
  globalAlpha = 1;

  readonly fillRects: Array<readonly [number, number, number, number]> = [];
  readonly strokeRects: Array<readonly [number, number, number, number]> = [];
  clearCount = 0;
  pathCommands = 0;

  clearRect(): void {
    this.clearCount++;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.fillRects.push([x, y, w, h]);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.strokeRects.push([x, y, w, h]);
  }

  setTransform(): void {}

  beginPath(): void {
    this.pathCommands = 0;
  }

  moveTo(): void {
    this.pathCommands++;
  }

  lineTo(): void {
    this.pathCommands++;
  }

  stroke(): void {}
}

function asCtx(fake: FakeContext): CanvasRenderingContext2D {
  return fake as unknown as CanvasRenderingContext2D;
}

const LAYOUT = { cell: 30, cols: 10, rows: 20 };

/** 每格方块画 3 个矩形：主体 + 顶部高光 + 底部阴影 */
const RECTS_PER_CELL = 3;

describe('场地渲染', () => {
  it('ready 阶段只有背景，没有幽灵描边', () => {
    const fake = new FakeContext();
    drawBoard(asCtx(fake), createState(1), LAYOUT);

    expect(fake.clearCount).toBe(1);
    expect(fake.fillRects).toHaveLength(1);
    expect(fake.strokeRects).toHaveLength(0);
    expect(fake.pathCommands).toBeGreaterThan(0); // 网格线
  });

  it('已固定方块、幽灵、当前方块都画到位', () => {
    const board = lockCells(createBoard(), [[0, 0]], 0, 15, PIECE_CODE.T);
    const state: GameState = {
      ...createState(1),
      phase: 'playing',
      board,
      active: { id: 'O', rotation: 0, x: 3, y: 18 },
    };

    const fake = new FakeContext();
    drawBoard(asCtx(fake), state, LAYOUT);

    // 背景 1 + 已固定 1 格 × 3 + 幽灵 4 + 当前 4 格 × 3 = 20
    expect(fake.fillRects).toHaveLength(1 + RECTS_PER_CELL + 4 + 4 * RECTS_PER_CELL);
    // 幽灵是 4 个描边
    expect(fake.strokeRects).toHaveLength(4);
  });

  it('落在隐藏缓冲行里的方块不绘制', () => {
    const board = lockCells(createBoard(), [[0, 0]], 3, 0, PIECE_CODE.T);
    const state: GameState = { ...createState(1), phase: 'playing', board };

    const fake = new FakeContext();
    drawBoard(asCtx(fake), state, LAYOUT);

    // 第 0 行属于隐藏缓冲行，只剩背景
    expect(fake.fillRects).toHaveLength(1);
  });
});

describe('预览面板', () => {
  it('Hold 为空时什么都不画', () => {
    const fake = new FakeContext();
    drawHold(asCtx(fake), null, 120, 66, 20);

    expect(fake.clearCount).toBe(1);
    expect(fake.fillRects).toHaveLength(0);
  });

  it('Hold 有方块时画满 4 格', () => {
    const fake = new FakeContext();
    drawHold(asCtx(fake), 'T', 120, 66, 20);

    expect(fake.fillRects).toHaveLength(4 * RECTS_PER_CELL);
  });

  it('Next 队列按槽位画满 5 个', () => {
    const fake = new FakeContext();
    drawNextQueue(asCtx(fake), createState(1).queue, 120, 66, 5, 20);

    expect(fake.fillRects).toHaveLength(5 * 4 * RECTS_PER_CELL);
  });

  it('队列不足时只画实际数量', () => {
    const fake = new FakeContext();
    drawNextQueue(asCtx(fake), ['I', 'O'], 120, 66, 5, 20);

    expect(fake.fillRects).toHaveLength(2 * 4 * RECTS_PER_CELL);
  });

  it('预览按包围盒居中，不依赖旋转态', () => {
    const fake = new FakeContext();
    // I 的出生态是 4×1 横条，居中后左右两格应留空
    drawNextQueue(asCtx(fake), ['I'], 120, 66, 1, 20);

    const xs = fake.fillRects.map((rect) => rect[0]);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(120);
  });
});
