import { describe, expect, it } from 'vitest';
import { ensureQueue, shuffleBag } from '../src/game/bag';
import { ALL_PIECES, QUEUE_MIN } from '../src/game/constants';
import type { PieceId } from '../src/game/types';

describe('7-bag 随机器', () => {
  it('每一袋都恰好包含 7 种方块各一次', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { bag } = shuffleBag(seed);
      expect([...bag].sort()).toEqual([...ALL_PIECES].sort());
    }
  });

  it('同一种子产生完全一致的序列与状态', () => {
    const a = ensureQueue([], 42);
    const b = ensureQueue([], 42);
    expect(a.queue).toEqual(b.queue);
    expect(a.rngState).toBe(b.rngState);
  });

  it('不同种子产生不同序列', () => {
    const a = ensureQueue([], 1).queue.slice(0, 14).join('');
    const b = ensureQueue([], 2).queue.slice(0, 14).join('');
    expect(a).not.toBe(b);
  });

  it('队列长度始终补足到 QUEUE_MIN', () => {
    expect(ensureQueue([], 7).queue).toHaveLength(QUEUE_MIN);

    const kept = ensureQueue(['I', 'O'], 7);
    expect(kept.queue.length).toBeGreaterThanOrEqual(QUEUE_MIN);
    // 补袋只往队尾追加，不改动已有队首
    expect(kept.queue.slice(0, 2)).toEqual(['I', 'O']);
    // 追加的必须是整数袋
    expect((kept.queue.length - 2) % 7).toBe(0);
  });

  it('连续三袋中，每个 7 格窗口都无重复', () => {
    let rng = 99;
    const all: PieceId[] = [];
    for (let i = 0; i < 3; i++) {
      const result = shuffleBag(rng);
      rng = result.rngState;
      all.push(...result.bag);
    }
    expect(all).toHaveLength(21);
    for (let start = 0; start + 7 <= all.length; start += 7) {
      expect(new Set(all.slice(start, start + 7)).size).toBe(7);
    }
  });

  it('任意连续 7 个（不按袋边界切）最多出现 2 次同种方块', () => {
    let rng = 2024;
    const all: PieceId[] = [];
    for (let i = 0; i < 4; i++) {
      const result = shuffleBag(rng);
      rng = result.rngState;
      all.push(...result.bag);
    }
    for (let start = 0; start + 7 <= all.length; start++) {
      const window = all.slice(start, start + 7);
      const counts = new Map<PieceId, number>();
      for (const id of window) counts.set(id, (counts.get(id) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
  });
});
