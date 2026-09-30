const BEST_KEY = 'gamelearn.tetris.best';

/** localStorage 在隐私模式下可能直接抛异常，所以全部包起来 */
export function loadBest(): number {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (raw === null) return 0;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveBest(value: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // 存不了就算了，不影响游戏
  }
}
