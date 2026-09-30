import { ARR_MS, DAS_MS } from '../game/constants';
import type { Action } from '../game/types';
import { DEFAULT_KEYMAP, isBoundKey, type Keymap } from './keymap';

/** 一次 update 里最多补发的重复移动次数，防止切回标签页时卡死 */
const MAX_REPEAT_PER_FRAME = 12;

/**
 * 把键盘事件翻译成语义动作，并实现 DAS / ARR。
 *
 * 这两件事必须在输入层做，不能进游戏逻辑层：
 * 逻辑层收到的是离散的「向左一格」，「按住多久触发第几格」是设备层的重复策略。
 * 分开之后键盘、触屏、AI 都能复用同一套核心。
 */
export class InputController {
  private readonly keymap: Keymap;
  private readonly seedFactory: () => number;
  private readonly down = new Set<string>();
  private readonly pending: Action[] = [];

  private leftSince: number | null = null;
  private leftRepeatAt = 0;
  private rightSince: number | null = null;
  private rightRepeatAt = 0;

  constructor(keymap: Keymap = DEFAULT_KEYMAP, seedFactory: () => number = () => Date.now() >>> 0) {
    this.keymap = keymap;
    this.seedFactory = seedFactory;
  }

  isBound(code: string): boolean {
    return isBoundKey(this.keymap, code);
  }

  handleKeyDown(code: string, now: number): void {
    // 系统自动重复一律忽略，由 DAS/ARR 接管，否则手感会变成两套重复叠加
    if (this.down.has(code)) return;
    this.down.add(code);

    const k = this.keymap;
    if (k.moveLeft.includes(code)) {
      this.pending.push({ type: 'MoveLeft' });
      this.leftSince = now;
      this.leftRepeatAt = now + DAS_MS;
    } else if (k.moveRight.includes(code)) {
      this.pending.push({ type: 'MoveRight' });
      this.rightSince = now;
      this.rightRepeatAt = now + DAS_MS;
    } else if (k.softDrop.includes(code)) {
      this.pending.push({ type: 'SoftDropStart' });
    } else if (k.hardDrop.includes(code)) {
      this.pending.push({ type: 'HardDrop' });
    } else if (k.rotateCW.includes(code)) {
      this.pending.push({ type: 'RotateCW' });
    } else if (k.rotateCCW.includes(code)) {
      this.pending.push({ type: 'RotateCCW' });
    } else if (k.rotate180.includes(code)) {
      this.pending.push({ type: 'Rotate180' });
    } else if (k.hold.includes(code)) {
      this.pending.push({ type: 'Hold' });
    } else if (k.pause.includes(code)) {
      this.pending.push({ type: 'TogglePause' });
    } else if (k.start.includes(code)) {
      this.pending.push({ type: 'Start' });
    } else if (k.restart.includes(code)) {
      this.pending.push({ type: 'Restart', seed: this.seedFactory() });
    }
  }

  handleKeyUp(code: string): void {
    if (!this.down.delete(code)) return;
    const k = this.keymap;
    if (k.moveLeft.includes(code)) {
      this.leftSince = null;
    } else if (k.moveRight.includes(code)) {
      this.rightSince = null;
    } else if (k.softDrop.includes(code)) {
      this.pending.push({ type: 'SoftDropEnd' });
    }
  }

  /** 每帧调用，推进 DAS/ARR 并把该补的移动补上 */
  update(now: number): void {
    if (this.leftSince !== null && now >= this.leftRepeatAt) {
      let guard = 0;
      while (now >= this.leftRepeatAt && guard++ < MAX_REPEAT_PER_FRAME) {
        this.pending.push({ type: 'MoveLeft' });
        this.leftRepeatAt += ARR_MS;
      }
    }
    if (this.rightSince !== null && now >= this.rightRepeatAt) {
      let guard = 0;
      while (now >= this.rightRepeatAt && guard++ < MAX_REPEAT_PER_FRAME) {
        this.pending.push({ type: 'MoveRight' });
        this.rightRepeatAt += ARR_MS;
      }
    }
  }

  /** 取走并清空待派发的动作 */
  drain(): Action[] {
    if (this.pending.length === 0) return [];
    const out = this.pending.slice();
    this.pending.length = 0;
    return out;
  }

  /** 失焦时调用：松开所有键，避免回来后方向键「粘住」 */
  releaseAll(): void {
    // 先丢弃待派发队列，再逐个松键 —— 顺序反了会把 SoftDropEnd 一起清掉，
    // 那样软降会永久卡在开启状态，下一个方块直接 20 倍速下落。
    this.pending.length = 0;
    for (const code of [...this.down]) this.handleKeyUp(code);
    this.down.clear();
    this.leftSince = null;
    this.rightSince = null;
  }
}
