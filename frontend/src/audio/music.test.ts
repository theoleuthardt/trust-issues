import { describe, expect, it } from 'vitest';
import { MusicScheduler, TRACKS, midiToHz, musicGain } from './music';
import type { TrackName } from './music';

const NAMES: TrackName[] = ['menu', 'game'];

describe('midiToHz', () => {
  it('maps concert A to 440 Hz and doubles per octave', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 5);
    expect(midiToHz(81)).toBeCloseTo(880, 5);
    expect(midiToHz(57)).toBeCloseTo(220, 5);
  });
});

describe('TRACKS', () => {
  it.each(NAMES)('%s is a loop of notes inside its length', (name) => {
    const track = TRACKS[name];

    expect(track.beats).toBeGreaterThan(0);
    expect(track.beatSeconds).toBeGreaterThan(0.2);
    expect(track.notes.length).toBeGreaterThan(0);
    for (const note of track.notes) {
      expect(note.at).toBeGreaterThanOrEqual(0);
      expect(note.at + note.length).toBeLessThanOrEqual(track.beats);
      expect(note.length).toBeGreaterThan(0);
      expect(note.gain).toBeGreaterThan(0);
      expect(note.gain).toBeLessThanOrEqual(1);
      expect(midiToHz(note.midi)).toBeGreaterThan(40);
      expect(midiToHz(note.midi)).toBeLessThan(2000);
    }
  });

  it('keeps every track quiet enough to stay in the background', () => {
    for (const name of NAMES) {
      const loudest = Math.max(...TRACKS[name].notes.map((note) => note.gain));
      expect(loudest).toBeLessThanOrEqual(0.6);
    }
  });

  it('has a menu track that is slower than the game track', () => {
    expect(TRACKS.menu.beatSeconds).toBeGreaterThan(TRACKS.game.beatSeconds);
  });
});

describe('MusicScheduler', () => {
  const track = {
    beats: 4,
    beatSeconds: 0.5,
    type: 'sine' as const,
    notes: [
      { at: 0, length: 1, midi: 60, gain: 0.5 },
      { at: 2, length: 1, midi: 64, gain: 0.5 },
    ],
  };

  it('hands out the notes that start before the given time, in order, with absolute times', () => {
    const scheduler = new MusicScheduler(track, 10);

    const first = scheduler.drain(11.2);

    expect(first.map((entry) => [entry.time, entry.note.midi])).toEqual([
      [10, 60],
      [11, 64],
    ]);
  });

  it('never hands out a note twice', () => {
    const scheduler = new MusicScheduler(track, 0);
    scheduler.drain(5);

    expect(scheduler.drain(5)).toEqual([]);
  });

  it('loops without a gap: the first note of the next round starts one loop later', () => {
    const scheduler = new MusicScheduler(track, 0);

    const notes = scheduler.drain(4.1);

    expect(notes.map((entry) => entry.time)).toEqual([0, 1, 2, 3, 4]);
  });

  it('continues where it stopped across calls', () => {
    const together = new MusicScheduler(track, 0).drain(8);
    const scheduler = new MusicScheduler(track, 0);
    const apart = [...scheduler.drain(3), ...scheduler.drain(5), ...scheduler.drain(8)];

    expect(apart).toEqual(together);
  });
});

describe('MusicScheduler.skipUntil', () => {
  const track = {
    beats: 4,
    beatSeconds: 0.5,
    type: 'sine' as const,
    notes: [
      { at: 0, length: 1, midi: 60, gain: 0.5 },
      { at: 2, length: 1, midi: 64, gain: 0.5 },
    ],
  };

  it('jumps over notes that are in the past without handing them out', () => {
    const scheduler = new MusicScheduler(track, 0);

    scheduler.skipUntil(1000.5);

    expect(scheduler.drain(1002.1).map((entry) => entry.time)).toEqual([1001, 1002]);
  });

  it('keeps the notes at or after the time', () => {
    const scheduler = new MusicScheduler(track, 0);

    scheduler.skipUntil(1);

    expect(scheduler.drain(2).map((entry) => entry.time)).toEqual([1]);
  });

  it('does nothing when the time is before the next note', () => {
    const scheduler = new MusicScheduler(track, 10);

    scheduler.skipUntil(5);

    expect(scheduler.drain(10.1).map((entry) => entry.time)).toEqual([10]);
  });

  it('gives the same notes after a skip as walking through them would', () => {
    const walked = new MusicScheduler(track, 3);
    walked.drain(40);
    const skipped = new MusicScheduler(track, 3);
    skipped.skipUntil(40);

    expect(skipped.drain(45)).toEqual(walked.drain(45));
  });
});

describe('musicGain', () => {
  it('is silent when muted, music is off or the volume is 0', () => {
    expect(musicGain({ muted: true, volume: 80, music: true })).toBe(0);
    expect(musicGain({ muted: false, volume: 80, music: false })).toBe(0);
    expect(musicGain({ muted: false, volume: 0, music: true })).toBe(0);
  });

  it('is well below the level of the effects at the same volume', () => {
    const music = musicGain({ muted: false, volume: 100, music: true });

    expect(music).toBeGreaterThan(0);
    expect(music).toBeLessThanOrEqual(0.3);
  });
});
