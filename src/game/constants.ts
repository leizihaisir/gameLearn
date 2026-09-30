import type { PieceId, TSpinKind } from './types';

/** 场地可见宽度 */
export const BOARD_W = 10;
/** 场地可见高度 */
export const BOARD_H = 20;
/** 顶部隐藏缓冲行：方块在此生成，玩家看不到 */
export const BUFFER_H = 2;
/** 内部总行数 */
export const INTERNAL_H = BOARD_H + BUFFER_H;

/** 队列最少保持的长度 */
export const QUEUE_MIN = 7;
/** 右侧 Next 预览的格子数 */
export const NEXT_SLOTS = 5;

/** 落地后允许微调的时长（毫秒） */
export const LOCK_DELAY_MS = 500;
/** 锁定计时器最多被重置多少次（防止无限拖延） */
export const MAX_LOCK_RESETS = 15;
/** 软降把重力乘以此倍率 */
export const SOFT_DROP_FACTOR = 20;

/** DAS：按住方向键后，首次自动重复前的延迟 */
export const DAS_MS = 133;
/** ARR：自动重复的间隔 */
export const ARR_MS = 33;

export const LINES_PER_LEVEL = 10;

/**
 * 等级上限。
 * 官方公式在 15 级时已是每格约 7ms，再快就失去可玩性。
 */
export const MAX_LEVEL = 15;

export const ALL_PIECES: readonly PieceId[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** 普通消行基础分，下标为消行数 */
export const LINE_SCORES: readonly number[] = [0, 100, 300, 500, 800];

/** T-Spin 基础分，下标为消行数 */
export const TSPIN_SCORES: Record<TSpinKind, readonly number[]> = {
  none: LINE_SCORES,
  mini: [100, 200, 400, 400, 400],
  full: [400, 800, 1200, 1600, 1600],
};

/** 完美消除额外分，下标为消行数 */
export const PERFECT_CLEAR_BONUS: readonly number[] = [0, 800, 1200, 1800, 2000];

export const BACK_TO_BACK_MULTIPLIER = 1.5;
export const COMBO_SCORE = 50;
export const SOFT_DROP_POINT_PER_CELL = 1;
export const HARD_DROP_POINT_PER_CELL = 2;
