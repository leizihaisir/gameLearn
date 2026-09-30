import { playEvents, unlockAudio } from './audio/sfx';
import { BOARD_H, BOARD_W, NEXT_SLOTS } from './game/constants';
import { clearEvents, createState, reduce } from './game/game';
import type { Action, GameState } from './game/types';
import { InputController } from './input/controller';
import { fitCanvas } from './render/canvas';
import { drawBoard, drawHold, drawNextQueue } from './render/draw';
import { loadBest, saveBest } from './storage';
import { updateHud, type HudElements } from './ui/hud';
import { updateOverlay } from './ui/overlay';

/** 主场地格子边长（CSS 像素） */
const CELL = 30;
const PREVIEW_CELL = 20;
const PANEL_W = 120;
const NEXT_SLOT_H = 66;
const HOLD_H = 66;
/** 单帧最大推进时间，防止切回标签页时一次掉很多行 */
const MAX_FRAME_MS = 100;

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (el === null) throw new Error(`找不到元素：${selector}`);
  return el;
}

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

const app = must<HTMLDivElement>('#app');
const stage = must<HTMLElement>('#stage');
const overlayEl = must<HTMLDivElement>('#overlay');

const boardCtx = fitCanvas(must<HTMLCanvasElement>('#board'), BOARD_W * CELL, BOARD_H * CELL);
const nextCtx = fitCanvas(must<HTMLCanvasElement>('#next'), PANEL_W, NEXT_SLOTS * NEXT_SLOT_H);
const holdCtx = fitCanvas(must<HTMLCanvasElement>('#hold'), PANEL_W, HOLD_H);

const hud: HudElements = {
  score: must<HTMLElement>('#score'),
  level: must<HTMLElement>('#level'),
  lines: must<HTMLElement>('#lines'),
  best: must<HTMLElement>('#best'),
};

let best = loadBest();
let state: GameState = createState(randomSeed());

const controller = new InputController(undefined, randomSeed);

/**
 * Start 在不同阶段的含义不同：ready 时开局，gameOver 时重开。
 * 种子由外壳生成，reducer 本身保持纯函数。
 */
function dispatch(current: GameState, action: Action): GameState {
  if (action.type === 'Start') {
    if (current.phase === 'ready') return reduce(current, action);
    if (current.phase === 'gameOver') {
      return reduce(current, { type: 'Restart', seed: randomSeed() });
    }
    return current;
  }
  return reduce(current, action);
}

function startOrRestart(): void {
  if (state.phase === 'ready') state = dispatch(state, { type: 'Start' });
  else if (state.phase === 'gameOver') {
    state = reduce(state, { type: 'Restart', seed: randomSeed() });
  }
}

function draw(): void {
  drawBoard(boardCtx, state, { cell: CELL, cols: BOARD_W, rows: BOARD_H });
  drawNextQueue(nextCtx, state.queue, PANEL_W, NEXT_SLOT_H, NEXT_SLOTS, PREVIEW_CELL);
  drawHold(holdCtx, state.hold, PANEL_W, HOLD_H, PREVIEW_CELL);
}

const NATURAL_H = BOARD_H * CELL + 32;

function fitViewport(): void {
  const scale = Math.min(1, (window.innerHeight - 24) / NATURAL_H);
  app.style.transform = `scale(${scale.toFixed(3)})`;
}

// ─────────────────────────── 输入 ───────────────────────────

window.addEventListener('keydown', (event) => {
  if (!controller.isBound(event.code)) return;
  // 阻止方向键滚动页面、空格滚动页面
  event.preventDefault();
  unlockAudio();
  controller.handleKeyDown(event.code, performance.now());
});

window.addEventListener('keyup', (event) => {
  if (!controller.isBound(event.code)) return;
  event.preventDefault();
  controller.handleKeyUp(event.code);
});

window.addEventListener('blur', () => controller.releaseAll());

stage.addEventListener('pointerdown', () => {
  unlockAudio();
  if (state.phase === 'playing') state = reduce(state, { type: 'TogglePause' });
  else if (state.phase === 'paused') state = reduce(state, { type: 'TogglePause' });
  else startOrRestart();
});

// ─────────────────────────── 主循环 ───────────────────────────

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(now - last, MAX_FRAME_MS);
  last = now;

  // 1. 输入：移动/旋转当帧生效，绝不攒到下一帧
  controller.update(now);
  for (const action of controller.drain()) state = dispatch(state, action);

  // 2. 时间推进：重力与锁定延迟
  state = reduce(state, { type: 'Tick', dt });

  // 3. 渲染 + 音效，然后清空本帧事件
  draw();
  updateHud(hud, state, best);
  updateOverlay(overlayEl, state, best);
  playEvents(state.events);
  state = clearEvents(state);

  if (state.phase === 'gameOver' && state.score > best) {
    best = state.score;
    saveBest(best);
  }

  requestAnimationFrame(frame);
}

window.addEventListener('resize', fitViewport);

fitViewport();
updateHud(hud, state, best);
updateOverlay(overlayEl, state, best);
requestAnimationFrame(frame);
