import { SOUNDS, outputGain } from './effects';
import type { SoundName, SoundSettings } from './effects';

/** The part of the Web Audio context the board uses, so tests can stand in for it. */
export interface AudioLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  createGain(): {
    gain: {
      value: number;
      cancelScheduledValues(at: number): void;
      setValueAtTime(value: number, at: number): void;
      linearRampToValueAtTime(value: number, at: number): void;
      exponentialRampToValueAtTime(value: number, at: number): void;
    };
    connect(destination: unknown): void;
  };
  createOscillator(): {
    type: string;
    frequency: {
      value: number;
      setValueAtTime(value: number, at: number): void;
      exponentialRampToValueAtTime(value: number, at: number): void;
    };
    connect(destination: unknown): void;
    start(at: number): void;
    stop(at: number): void;
  };
}

const FADE_OUT = 0.02;

/**
 * Plays the generated effects. The audio context is created on `unlock`, which has to be
 * called from a user gesture (browsers keep audio suspended until then, notably on iOS).
 */
export class SoundBoard {
  private context: AudioLike | undefined;

  constructor(
    private readonly createContext: () => AudioLike | undefined,
    private readonly settings: () => SoundSettings,
  ) {}

  /** Creates and resumes the audio context; resolves to whether sound can play now. */
  async unlock(): Promise<boolean> {
    this.context ??= this.createContext();
    if (!this.context) return false;
    if (this.context.state !== 'running') {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }
    return this.context.state === 'running';
  }

  /** The audio context once it runs, for other players such as the music. */
  runningContext(): AudioLike | undefined {
    return this.context?.state === 'running' ? this.context : undefined;
  }

  play(name: SoundName): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const master = outputGain(this.settings());
    if (master <= 0) return;

    const now = context.currentTime;
    for (const tone of SOUNDS[name]) {
      const begin = now + tone.start;
      const end = begin + tone.duration;
      const volume = context.createGain();
      volume.gain.setValueAtTime(tone.gain * master, begin);
      volume.gain.linearRampToValueAtTime(0.0001, end + FADE_OUT);
      volume.connect(context.destination);

      const oscillator = context.createOscillator();
      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(tone.from, begin);
      if (tone.to !== tone.from) oscillator.frequency.exponentialRampToValueAtTime(tone.to, end);
      oscillator.connect(volume);
      oscillator.start(begin);
      oscillator.stop(end + FADE_OUT);
    }
  }
}
