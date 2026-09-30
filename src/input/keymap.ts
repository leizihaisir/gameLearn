/**
 * 键位映射。值是 KeyboardEvent.code，与物理按键位置无关，
 * 所以 AZERTY / Dvorak 键盘也能用。
 */
export interface Keymap {
  readonly moveLeft: readonly string[];
  readonly moveRight: readonly string[];
  readonly softDrop: readonly string[];
  readonly hardDrop: readonly string[];
  readonly rotateCW: readonly string[];
  readonly rotateCCW: readonly string[];
  readonly rotate180: readonly string[];
  readonly hold: readonly string[];
  readonly pause: readonly string[];
  readonly start: readonly string[];
  readonly restart: readonly string[];
}

export const DEFAULT_KEYMAP: Keymap = {
  moveLeft: ['ArrowLeft'],
  moveRight: ['ArrowRight'],
  softDrop: ['ArrowDown'],
  hardDrop: ['Space'],
  rotateCW: ['ArrowUp', 'KeyX'],
  rotateCCW: ['KeyZ', 'ControlLeft', 'ControlRight'],
  rotate180: ['KeyA'],
  hold: ['KeyC', 'ShiftLeft', 'ShiftRight'],
  pause: ['KeyP', 'Escape'],
  start: ['Enter'],
  restart: ['KeyR'],
};

export function isBoundKey(keymap: Keymap, code: string): boolean {
  return (
    keymap.moveLeft.includes(code) ||
    keymap.moveRight.includes(code) ||
    keymap.softDrop.includes(code) ||
    keymap.hardDrop.includes(code) ||
    keymap.rotateCW.includes(code) ||
    keymap.rotateCCW.includes(code) ||
    keymap.rotate180.includes(code) ||
    keymap.hold.includes(code) ||
    keymap.pause.includes(code) ||
    keymap.start.includes(code) ||
    keymap.restart.includes(code)
  );
}
