export type SoundName = 'jump' | 'death' | 'trap' | 'exit';

/** One synthesised note: a pitch that glides from `from` to `to` Hz, starting `start` seconds in. */
export interface Tone {
  type: 'sine' | 'square' | 'triangle' | 'sawtooth';
  from: number;
  to: number;
  start: number;
  duration: number;
  gain: number;
}

/**
 * The four effects are generated from oscillators at play time, so there are no audio files
 * and no licenses to track.
 */
export const SOUNDS: Readonly<Record<SoundName, readonly Tone[]>> = {
  jump: [{ type: 'square', from: 260, to: 520, start: 0, duration: 0.12, gain: 0.35 }],
  death: [
    { type: 'sawtooth', from: 330, to: 70, start: 0, duration: 0.35, gain: 0.45 },
    { type: 'square', from: 110, to: 50, start: 0.05, duration: 0.3, gain: 0.3 },
  ],
  trap: [
    { type: 'triangle', from: 900, to: 300, start: 0, duration: 0.09, gain: 0.4 },
    { type: 'square', from: 180, to: 180, start: 0.06, duration: 0.08, gain: 0.25 },
  ],
  exit: [
    { type: 'triangle', from: 392, to: 392, start: 0, duration: 0.1, gain: 0.4 },
    { type: 'triangle', from: 523, to: 523, start: 0.1, duration: 0.1, gain: 0.4 },
    { type: 'triangle', from: 784, to: 784, start: 0.2, duration: 0.2, gain: 0.4 },
  ],
};

export interface SoundSettings {
  muted: boolean;
  /** 0 to 100. */
  volume: number;
}

/** The end of the last tone, in seconds. */
export function totalDuration(tones: readonly Tone[]): number {
  return tones.reduce((end, tone) => Math.max(end, tone.start + tone.duration), 0);
}

/** Master gain from the settings: silent when muted, quadratic in the volume so it feels even. */
export function outputGain(settings: SoundSettings): number {
  if (settings.muted) return 0;
  const volume = Math.min(100, Math.max(0, settings.volume)) / 100;
  return volume * volume;
}
