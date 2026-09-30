import { ALL_PIECES, QUEUE_MIN } from './constants';
import type { PieceId } from './types';

/**
 * mulberry32 的**纯函数**版本：给定状态，返回下一个 uint32 与新状态。
 *
 * 之所以不用闭包式 RNG，是因为 RNG 状态必须能放进 GameState ——
 * 这样任何一局都能凭种子完整复现，测试和 bug 复现都靠它。
 */
export function nextUint32(rngState: number): { rngState: number; value: number } {
  const a = (rngState + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { rngState: a, value: (t ^ (t >>> 14)) >>> 0 };
}

/**
 * 生成一袋打乱的 7 种方块（Fisher-Yates）。
 * 保证连续 7 个方块中每种恰好出现一次，从根本上消除长串同形状。
 */
export function shuffleBag(rngState: number): { rngState: number; bag: PieceId[] } {
  const bag = [...ALL_PIECES];
  let rng = rngState;
  for (let i = bag.length - 1; i > 0; i--) {
    const r = nextUint32(rng);
    rng = r.rngState;
    const j = r.value % (i + 1);
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  return { rngState: rng, bag };
}

/** 不断补袋，直到队列长度达到 QUEUE_MIN */
export function ensureQueue(
  queue: readonly PieceId[],
  rngState: number,
): { queue: PieceId[]; rngState: number } {
  let q = [...queue];
  let rng = rngState;
  while (q.length < QUEUE_MIN) {
    const res = shuffleBag(rng);
    rng = res.rngState;
    q = q.concat(res.bag);
  }
  return { queue: q, rngState: rng };
}

/** 从队首取一个方块，并把队列补满 */
export function takeFromQueue(
  queue: readonly PieceId[],
  rngState: number,
): { id: PieceId; queue: PieceId[]; rngState: number } {
  const [id, ...rest] = queue;
  const ensured = ensureQueue(rest, rngState);
  return { id, queue: ensured.queue, rngState: ensured.rngState };
}
