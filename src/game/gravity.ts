import { MAX_LEVEL } from './constants';

/**
 * 官方下落速度公式：每格秒数 = (0.8 - (level - 1) × 0.007) ^ (level - 1)
 *
 * 1 级 1000ms/格，5 级约 355ms，10 级约 64ms，15 级约 7ms。
 */
export function gravityMsPerCell(level: number): number {
  const l = Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
}
