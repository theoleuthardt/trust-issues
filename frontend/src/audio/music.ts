import { outputGain } from './effects';
import type { SoundSettings } from './effects';

export type TrackName = 'menu' | 'game';

/** A note of a loop: where it starts and how long it lasts in beats, and its pitch as a MIDI number. */
export interface Note {
  at: number;
  length: number;
  midi: number;
  gain: number;
}

export interface Track {
  beats: number;
  beatSeconds: number;
  type: 'sine' | 'square' | 'triangle' | 'sawtooth';
  notes: readonly Note[];
}

const note = (at: number, length: number, midi: number, gain: number): Note => ({
  at,
  length,
  midi,
  gain,
});

/**
 * Two short loops written as note lists and played by oscillators, so the game ships no music
 * files: a slow minor arpeggio for the menus and a lower, tenser pulse while playing.
 */
export const TRACKS: Readonly<Record<TrackName, Track>> = {
  menu: {
    beats: 16,
    beatSeconds: 0.5,
    type: 'triangle',
    notes: [
      note(0, 2, 57, 0.4),
      note(2, 2, 60, 0.35),
      note(4, 2, 64, 0.35),
      note(6, 2, 60, 0.3),
      note(8, 2, 55, 0.4),
      note(10, 2, 59, 0.35),
      note(12, 2, 62, 0.35),
      note(14, 2, 59, 0.3),
    ],
  },
  game: {
    beats: 16,
    beatSeconds: 0.25,
    type: 'square',
    notes: [
      note(0, 1, 45, 0.3),
      note(2, 1, 45, 0.2),
      note(4, 1, 48, 0.3),
      note(6, 1, 45, 0.2),
      note(8, 1, 43, 0.3),
      note(10, 1, 43, 0.2),
      note(12, 1, 47, 0.3),
      note(14, 1, 50, 0.25),
      note(7, 0.5, 69, 0.15),
      note(15, 0.5, 67, 0.15),
    ],
  },
};

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Hands out the notes of a looping track in time order, with absolute start times. */
export class MusicScheduler {
  private loop = 0;
  private sorted: readonly Note[];
  private index = 0;

  constructor(
    private readonly track: Track,
    private readonly origin: number,
  ) {
    this.sorted = [...track.notes].sort((a, b) => a.at - b.at);
  }

  /** Forgets the notes that start before `time` without handing them out. */
  skipUntil(time: number): void {
    const loopSeconds = this.track.beats * this.track.beatSeconds;
    const loop = Math.floor((time - this.origin) / loopSeconds);
    if (loop > this.loop) {
      this.loop = loop;
      this.index = 0;
    }
    while (this.index < this.sorted.length) {
      const next = this.sorted[this.index];
      if (!next) break;
      const at = this.origin + (this.loop * this.track.beats + next.at) * this.track.beatSeconds;
      if (at >= time) return;
      this.index += 1;
    }
    this.index = 0;
    this.loop += 1;
  }

  /** Every note not handed out yet that starts before `until`. */
  drain(until: number): { time: number; note: Note }[] {
    const out: { time: number; note: Note }[] = [];
    for (;;) {
      const next = this.sorted[this.index];
      if (!next) return out;
      const time = this.origin + (this.loop * this.track.beats + next.at) * this.track.beatSeconds;
      if (time >= until) return out;
      out.push({ time, note: next });
      this.index += 1;
      if (this.index >= this.sorted.length) {
        this.index = 0;
        this.loop += 1;
      }
    }
  }
}

export interface MusicSettings extends SoundSettings {
  music: boolean;
}

const MUSIC_LEVEL = 0.25;

/** Master gain of the music: the effects' curve, scaled down, and silent when music is off. */
export function musicGain(settings: MusicSettings): number {
  return settings.music ? outputGain(settings) * MUSIC_LEVEL : 0;
}
