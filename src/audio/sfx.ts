import type { GameEvent } from '../game/types';

let audio: AudioContext | null = null;

/** 浏览器要求音频必须由用户手势开启，第一次按键/点击时调用 */
export function unlockAudio(): void {
  if (audio === null) {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor !== undefined) audio = new Ctor();
  }
  if (audio !== null && audio.state === 'suspended') void audio.resume();
}

/** 用振荡器合成一声短音，不需要任何音频素材文件 */
function beep(freq: number, duration: number, type: OscillatorType, volume: number): void {
  if (audio === null) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export function playEvents(events: readonly GameEvent[]): void {
  if (audio === null) return;

  for (const event of events) {
    switch (event.type) {
      case 'PieceRotated':
        beep(330, 0.03, 'square', 0.035);
        break;
      case 'HardDrop':
        beep(150, 0.07, 'sawtooth', 0.06);
        break;
      case 'Hold':
        beep(520, 0.06, 'triangle', 0.05);
        break;
      case 'PieceLocked':
        beep(210, 0.05, 'square', 0.04);
        break;
      case 'LinesCleared':
        if (event.count >= 4) {
          beep(880, 0.16, 'triangle', 0.09);
          beep(1320, 0.18, 'triangle', 0.05);
        } else {
          beep(520 + event.count * 130, 0.1, 'triangle', 0.07);
        }
        break;
      case 'LevelUp':
        beep(990, 0.2, 'triangle', 0.08);
        break;
      case 'GameOver':
        beep(120, 0.5, 'sawtooth', 0.09);
        break;
      case 'PieceMoved':
        break;
      default:
        break;
    }
  }
}
