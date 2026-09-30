import type { GameState } from '../game/types';

function overlayHtml(state: GameState, best: number): string | null {
  switch (state.phase) {
    case 'ready':
      return [
        '<h1>俄罗斯方块</h1>',
        '<p class="hint">按 Enter 开始</p>',
        '<p>← → 移动 · ↑ / X 顺时针旋转 · Z 逆时针</p>',
        '<p>Space 硬降 · ↓ 软降 · C 暂存</p>',
      ].join('');
    case 'paused':
      return ['<h1>已暂停</h1>', '<p class="hint">按 P 或 Esc 继续</p>'].join('');
    case 'gameOver':
      return [
        '<h1>游戏结束</h1>',
        `<p class="big">${state.score.toLocaleString('en-US')}</p>`,
        `<p>最高分 ${best.toLocaleString('en-US')} · 消行 ${state.lines} · 等级 ${state.level}</p>`,
        '<p class="hint">按 Enter 或 R 重新开始</p>',
      ].join('');
    case 'playing':
      return null;
    default:
      return null;
  }
}

export function updateOverlay(el: HTMLElement, state: GameState, best: number): void {
  const html = overlayHtml(state, best);
  if (html === null) {
    if (el.classList.contains('visible')) {
      el.classList.remove('visible');
      el.innerHTML = '';
    }
    return;
  }

  el.classList.add('visible');
  if (el.innerHTML !== html) el.innerHTML = html;
}
