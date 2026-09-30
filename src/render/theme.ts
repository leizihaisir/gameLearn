import type { PieceId } from '../game/types';

/** 七种方块的主题色 */
export const COLORS: Record<PieceId, string> = {
  I: '#31c7ef',
  O: '#f7d308',
  T: '#ad4d9c',
  S: '#42b642',
  Z: '#ef2029',
  J: '#5a65ad',
  L: '#ef7921',
};

export const THEME = {
  background: '#0a0d14',
  grid: 'rgba(255, 255, 255, 0.045)',
  ghostFill: 'rgba(255, 255, 255, 0.07)',
  ghostStroke: 'rgba(255, 255, 255, 0.22)',
  panel: 'rgba(255, 255, 255, 0.02)',
} as const;
