import { describe, expect, it } from 'vitest';
import {
  applyBackToBack,
  clearScore,
  comboBonus,
  isDifficultClear,
  levelForLines,
  perfectClearBonus,
} from '../src/game/scoring';
import { gravityMsPerCell } from '../src/game/gravity';
import { LINES_PER_LEVEL, MAX_LEVEL } from '../src/game/constants';

describe('计分表', () => {
  it('普通消行', () => {
    expect(clearScore(0, 'none')).toBe(0);
    expect(clearScore(1, 'none')).toBe(100);
    expect(clearScore(2, 'none')).toBe(300);
    expect(clearScore(3, 'none')).toBe(500);
    expect(clearScore(4, 'none')).toBe(800);
  });

  it('完整 T-Spin', () => {
    expect(clearScore(0, 'full')).toBe(400);
    expect(clearScore(1, 'full')).toBe(800);
    expect(clearScore(2, 'full')).toBe(1200);
    expect(clearScore(3, 'full')).toBe(1600);
  });

  it('Mini T-Spin', () => {
    expect(clearScore(0, 'mini')).toBe(100);
    expect(clearScore(1, 'mini')).toBe(200);
    expect(clearScore(2, 'mini')).toBe(400);
  });

  it('越界索引被夹到表尾，不会返回 undefined', () => {
    expect(clearScore(9, 'none')).toBe(800);
  });
});

describe('Back-to-Back', () => {
  it('只有 Tetris 与 T-Spin 消行算高难消行', () => {
    expect(isDifficultClear(4, 'none')).toBe(true);
    expect(isDifficultClear(1, 'none')).toBe(false);
    expect(isDifficultClear(3, 'none')).toBe(false);
    expect(isDifficultClear(2, 'full')).toBe(true);
    expect(isDifficultClear(1, 'mini')).toBe(true);
    expect(isDifficultClear(0, 'full')).toBe(false);
  });

  it('×1.5 并向下取整', () => {
    expect(applyBackToBack(800, true)).toBe(1200);
    expect(applyBackToBack(1200, true)).toBe(1800);
    expect(applyBackToBack(800, false)).toBe(800);
    expect(applyBackToBack(100, true)).toBe(150);
  });
});

describe('连击与完美消除', () => {
  it('首次消行不给连击奖励', () => {
    expect(comboBonus(0, 1)).toBe(0);
    expect(comboBonus(1, 1)).toBe(50);
    expect(comboBonus(3, 5)).toBe(750);
  });

  it('完美消除按消行数给分', () => {
    expect(perfectClearBonus(0)).toBe(0);
    expect(perfectClearBonus(1)).toBe(800);
    expect(perfectClearBonus(4)).toBe(2000);
  });
});

describe('等级', () => {
  it('每 10 行升一级，并封顶', () => {
    expect(levelForLines(0, MAX_LEVEL, LINES_PER_LEVEL)).toBe(1);
    expect(levelForLines(9, MAX_LEVEL, LINES_PER_LEVEL)).toBe(1);
    expect(levelForLines(10, MAX_LEVEL, LINES_PER_LEVEL)).toBe(2);
    expect(levelForLines(99, MAX_LEVEL, LINES_PER_LEVEL)).toBe(10);
    expect(levelForLines(100000, MAX_LEVEL, LINES_PER_LEVEL)).toBe(MAX_LEVEL);
  });
});

describe('重力速度', () => {
  it('1 级正好 1000ms 每格', () => {
    expect(gravityMsPerCell(1)).toBe(1000);
  });

  it('与官方公式一致的关键档位', () => {
    expect(gravityMsPerCell(2)).toBeCloseTo(793, 0);
    expect(gravityMsPerCell(5)).toBeCloseTo(355.2, 0);
    expect(gravityMsPerCell(10)).toBeCloseTo(64.1, 0);
    expect(gravityMsPerCell(15)).toBeCloseTo(7.06, 0);
  });

  it('随等级单调变快，且不会为 0 或负数', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let level = 1; level <= 30; level++) {
      const ms = gravityMsPerCell(level);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(previous);
      previous = ms;
    }
  });

  it('超出上限的等级被夹到 15 级', () => {
    expect(gravityMsPerCell(99)).toBe(gravityMsPerCell(15));
  });
});
