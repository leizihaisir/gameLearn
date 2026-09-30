import { describe, expect, it } from 'vitest';

/**
 * 启动冒烟测试：在最小 DOM 桩上真正 import 一次 main.ts。
 *
 * 其它测试覆盖的是「逻辑对不对」，这个文件覆盖的是「应用能不能起来」——
 * 类型检查和打包都不会发现 querySelector 选错元素、元素缺失之类的运行时问题。
 */

class FakeContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  globalAlpha = 1;

  clearRect(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  setTransform(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
}

type Handler = (event: unknown) => void;

class FakeElement {
  readonly tagName: string;
  readonly style: Record<string, string> = {};
  readonly classes = new Set<string>();
  readonly listeners = new Map<string, Handler[]>();

  textContent: string | null = null;
  innerHTML = '';

  private readonly ctx: FakeContext | null;

  constructor(tagName: string, withContext = false) {
    this.tagName = tagName;
    this.ctx = withContext ? new FakeContext() : null;
  }

  get classList() {
    const classes = this.classes;
    return {
      add: (name: string): void => void classes.add(name),
      remove: (name: string): void => void classes.delete(name),
      contains: (name: string): boolean => classes.has(name),
    };
  }

  getContext(kind: string): FakeContext | null {
    return kind === '2d' ? this.ctx : null;
  }

  addEventListener(type: string, handler: Handler): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatch(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ code: '', preventDefault: (): void => {} });
    }
  }
}

const SELECTORS = [
  '#app',
  '#stage',
  '#overlay',
  '#board',
  '#next',
  '#hold',
  '#score',
  '#level',
  '#lines',
  '#best',
] as const;

const CANVASES = new Set(['#board', '#next', '#hold']);

const elements = new Map<string, FakeElement>();
for (const selector of SELECTORS) {
  elements.set(selector, new FakeElement('div', CANVASES.has(selector)));
}

const frames: Array<(time: number) => void> = [];
const storage = new Map<string, string>();
const windowListeners = new Map<string, Handler[]>();

const globals = globalThis as unknown as Record<string, unknown>;

globals.document = {
  querySelector: (selector: string): FakeElement | null => elements.get(selector) ?? null,
};

globals.window = {
  devicePixelRatio: 2,
  innerHeight: 800,
  // 故意不提供 AudioContext：unlockAudio 必须能优雅跳过
  addEventListener: (type: string, handler: Handler): void => {
    const list = windowListeners.get(type) ?? [];
    list.push(handler);
    windowListeners.set(type, list);
  },
  localStorage: {
    getItem: (key: string): string | null => storage.get(key) ?? null,
    setItem: (key: string, value: string): void => void storage.set(key, value),
  },
};

globals.requestAnimationFrame = (callback: (time: number) => void): number => {
  frames.push(callback);
  return frames.length;
};

describe('应用启动', () => {
  it('在最小 DOM 环境下完成装配，并渲染出第一帧', async () => {
    await import('../src/main');

    // 三块画布都按 devicePixelRatio=2 配置过
    const board = elements.get('#board');
    expect(board).toBeDefined();

    // HUD 初始值
    expect(elements.get('#score')?.textContent).toBe('0');
    expect(elements.get('#level')?.textContent).toBe('1');
    expect(elements.get('#lines')?.textContent).toBe('0');
    expect(elements.get('#best')?.textContent).toBe('0');

    // ready 阶段显示开始遮罩
    expect(elements.get('#overlay')?.classes.has('visible')).toBe(true);
    expect(elements.get('#overlay')?.innerHTML).toContain('俄罗斯方块');

    // 主循环已经排上队
    expect(frames).toHaveLength(1);
  });

  it('跑一帧不抛异常，并继续排下一帧', () => {
    const frame = frames.shift();
    expect(frame).toBeTypeOf('function');

    expect(() => frame?.(performance.now())).not.toThrow();
    expect(frames).toHaveLength(1);
  });

  it('Enter 能开局，遮罩随之隐藏', () => {
    const keydown = windowListeners.get('keydown') ?? [];
    expect(keydown.length).toBeGreaterThan(0);

    for (const handler of keydown) {
      handler({ code: 'Enter', preventDefault: (): void => {} });
    }

    const frame = frames.shift();
    frame?.(performance.now());

    expect(elements.get('#overlay')?.classes.has('visible')).toBe(false);
  });

  it('本地存储不可用时也能读取与保存最高分', async () => {
    const { loadBest, saveBest } = await import('../src/storage');
    expect(loadBest()).toBe(0);
    saveBest(4321);
    expect(loadBest()).toBe(4321);
  });
});
