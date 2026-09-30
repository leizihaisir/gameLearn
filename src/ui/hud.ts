import type { GameState } from '../game/types';

export interface HudElements {
  readonly score: HTMLElement;
  readonly level: HTMLElement;
  readonly lines: HTMLElement;
  readonly best: HTMLElement;
}

function setText(el: HTMLElement, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

export function updateHud(els: HudElements, state: GameState, best: number): void {
  setText(els.score, state.score.toLocaleString('en-US'));
  setText(els.level, String(state.level));
  setText(els.lines, String(state.lines));
  setText(els.best, best.toLocaleString('en-US'));
}
