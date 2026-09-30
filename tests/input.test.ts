import { describe, expect, it } from 'vitest';
import { ARR_MS, DAS_MS } from '../src/game/constants';
import { InputController } from '../src/input/controller';
import { DEFAULT_KEYMAP } from '../src/input/keymap';
import type { Action } from '../src/game/types';

function makeController(): InputController {
  return new InputController(DEFAULT_KEYMAP, () => 12345);
}

function countMoves(actions: Action[], type: 'MoveLeft' | 'MoveRight'): number {
  return actions.filter((a) => a.type === type).length;
}

describe('DAS / ARR 自动重复', () => {
  it('按下立即移动一格', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    expect(c.drain()).toEqual([{ type: 'MoveLeft' }]);
  });

  it('DAS 未到时不会重复', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    c.drain();

    c.update(DAS_MS - 1);
    expect(c.drain()).toEqual([]);
  });

  it('DAS 到点触发第一次重复，之后每 ARR 一次', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    c.drain();

    c.update(DAS_MS);
    expect(countMoves(c.drain(), 'MoveLeft')).toBe(1);

    c.update(DAS_MS + ARR_MS);
    expect(countMoves(c.drain(), 'MoveLeft')).toBe(1);

    c.update(DAS_MS + ARR_MS * 2);
    expect(countMoves(c.drain(), 'MoveLeft')).toBe(1);
  });

  it('一帧跨越多个 ARR 周期会补齐相应次数', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    c.drain();

    // 重复落在 133 / 166 / 199 / 232 四个时刻，共 4 次
    c.update(DAS_MS + ARR_MS * 3);
    expect(countMoves(c.drain(), 'MoveLeft')).toBe(4);
  });

  it('系统的自动重复被忽略，避免两套重复叠加', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    c.handleKeyDown('ArrowLeft', 10);
    c.handleKeyDown('ArrowLeft', 20);
    expect(c.drain()).toHaveLength(1);
  });

  it('松开按键后不再重复', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    c.handleKeyUp('ArrowLeft');
    c.drain();

    c.update(DAS_MS + ARR_MS * 10);
    expect(c.drain()).toEqual([]);
  });

  it('左右方向互不干扰', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    c.handleKeyDown('ArrowRight', 0);
    expect(c.drain()).toEqual([{ type: 'MoveLeft' }, { type: 'MoveRight' }]);

    c.update(DAS_MS);
    const actions = c.drain();
    expect(countMoves(actions, 'MoveLeft')).toBe(1);
    expect(countMoves(actions, 'MoveRight')).toBe(1);

    c.handleKeyUp('ArrowLeft');
    c.drain();
    c.update(DAS_MS + ARR_MS);
    expect(countMoves(c.drain(), 'MoveLeft')).toBe(0);
  });

  it('重复次数有上限，防止一次补发过多', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    c.drain();

    c.update(10_000_000);
    expect(countMoves(c.drain(), 'MoveLeft')).toBeLessThanOrEqual(12);
  });
});

describe('其他按键', () => {
  it('软降按下/松开产生成对动作', () => {
    const c = makeController();
    c.handleKeyDown('ArrowDown', 0);
    expect(c.drain()).toEqual([{ type: 'SoftDropStart' }]);
    c.handleKeyUp('ArrowDown');
    expect(c.drain()).toEqual([{ type: 'SoftDropEnd' }]);
  });

  it('空格硬降、C 暂存、P 暂停', () => {
    const c = makeController();
    c.handleKeyDown('Space', 0);
    c.handleKeyDown('KeyC', 0);
    c.handleKeyDown('KeyP', 0);
    expect(c.drain()).toEqual([{ type: 'HardDrop' }, { type: 'Hold' }, { type: 'TogglePause' }]);
  });

  it('旋转键位齐全', () => {
    const c = makeController();
    c.handleKeyDown('ArrowUp', 0);
    c.handleKeyDown('KeyZ', 0);
    c.handleKeyDown('KeyA', 0);
    expect(c.drain()).toEqual([
      { type: 'RotateCW' },
      { type: 'RotateCCW' },
      { type: 'Rotate180' },
    ]);
  });

  it('R 用工厂生成的种子重开', () => {
    const c = makeController();
    c.handleKeyDown('KeyR', 0);
    expect(c.drain()).toEqual([{ type: 'Restart', seed: 12345 }]);
  });

  it('失焦后松开所有键，方向不会粘住，软降也会正确结束', () => {
    const c = makeController();
    c.handleKeyDown('ArrowLeft', 0);
    c.handleKeyDown('ArrowDown', 0);
    c.releaseAll();

    // releaseAll 先清空待派发队列，再补上软降结束动作
    const actions = c.drain();
    expect(actions).toEqual([{ type: 'SoftDropEnd' }]);

    c.update(DAS_MS + ARR_MS * 5);
    expect(c.drain()).toEqual([]);
  });

  it('未绑定的按键被忽略', () => {
    const c = makeController();
    expect(c.isBound('KeyQ')).toBe(false);
    expect(c.isBound('ArrowLeft')).toBe(true);
  });
});
