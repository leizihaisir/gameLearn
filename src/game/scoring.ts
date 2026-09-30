import {
  BACK_TO_BACK_MULTIPLIER,
  COMBO_SCORE,
  PERFECT_CLEAR_BONUS,
  TSPIN_SCORES,
} from './constants';
import type { TSpinKind } from './types';

function pick(table: readonly number[], index: number): number {
  return table[Math.min(Math.max(index, 0), table.length - 1)];
}

/** 基础消行分（未乘等级、未算连击与 B2B） */
export function clearScore(count: number, tspin: TSpinKind): number {
  return pick(TSPIN_SCORES[tspin], count);
}

/** 是否属于「高难消行」—— 只有它会触发 Back-to-Back */
export function isDifficultClear(count: number, tspin: TSpinKind): boolean {
  return count === 4 || (tspin !== 'none' && count > 0);
}

export function applyBackToBack(score: number, active: boolean): number {
  return active ? Math.floor(score * BACK_TO_BACK_MULTIPLIER) : score;
}

/** combo 为本次消行之前已连续消行的次数（首次消行为 0，不给奖励） */
export function comboBonus(combo: number, level: number): number {
  return COMBO_SCORE * combo * level;
}

export function perfectClearBonus(count: number): number {
  return pick(PERFECT_CLEAR_BONUS, count);
}

export function levelForLines(lines: number, maxLevel: number, linesPerLevel: number): number {
  return Math.min(maxLevel, 1 + Math.floor(lines / linesPerLevel));
}
