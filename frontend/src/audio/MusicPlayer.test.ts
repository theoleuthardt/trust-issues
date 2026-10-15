import { describe, expect, it } from 'vitest';
import { MusicPlayer } from './MusicPlayer';
import type { AudioLike } from './SoundBoard';

interface Started {
  at: number;
  hz: number;
}

function fakeContext() {
  const now = { value: 10 };
  const started: Started[] = [];
  const busLevels: number[] = [];
  const masterLevels: number[] = [];
  let created = 0;
  const context: AudioLike = {
    state: 'running',
    resume: () => Promise.resolve(),
    get currentTime() {
      return now.value;
    },
    destination: {},
    createGain() {
      const index = created++;
      return {
        gain: {
          value: 0,
          cancelScheduledValues: () => undefined,
          setValueAtTime(value: number) {
            (index === 0 ? masterLevels : busLevels).push(value);
          },
          linearRampToValueAtTime(value: number) {
            (index === 0 ? masterLevels : busLevels).push(value);
          },
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      };
    },
    createOscillator() {
      const entry: Started = { at: 0, hz: 0 };
      return {
        type: 'sine',
        frequency: {
          value: 0,
          setValueAtTime(value: number) {
            entry.hz = value;
          },
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
        start(at: number) {
          entry.at = at;
          started.push(entry);
        },
        stop: () => undefined,
      };
    },
  };
  return { context, now, started, busLevels, masterLevels };
}

const on = { muted: false, volume: 80, music: true };

describe('MusicPlayer', () => {
  it('plays nothing before a track is chosen', () => {
    const { context, started } = fakeContext();
    const player = new MusicPlayer(
      () => context,
      () => on,
    );

    player.tick();

    expect(started).toHaveLength(0);
  });

  it('schedules the notes of the chosen track a little ahead of time', () => {
    const { context, started } = fakeContext();
    const player = new MusicPlayer(
      () => context,
      () => on,
    );

    player.setTrack('menu');
    player.tick();

    expect(started.length).toBeGreaterThan(0);
    for (const entry of started) expect(entry.at).toBeLessThan(10 + 1.5);
  });

  it('schedules each note once, however often it ticks', () => {
    const { context, started } = fakeContext();
    const player = new MusicPlayer(
      () => context,
      () => on,
    );
    player.setTrack('menu');
    player.tick();
    const first = started.length;

    player.tick();
    player.tick();

    expect(started).toHaveLength(first);
  });

  it('keeps scheduling as the clock moves on', () => {
    const { context, now, started } = fakeContext();
    const player = new MusicPlayer(
      () => context,
      () => on,
    );
    player.setTrack('menu');
    player.tick();
    const first = started.length;

    now.value += 5;
    player.tick();

    expect(started.length).toBeGreaterThan(first);
  });

  it('schedules nothing while music is off or muted', () => {
    const { context, started } = fakeContext();
    const off = new MusicPlayer(
      () => context,
      () => ({ ...on, music: false }),
    );
    const muted = new MusicPlayer(
      () => context,
      () => ({ ...on, muted: true }),
    );
    off.setTrack('menu');
    muted.setTrack('menu');

    off.tick();
    muted.tick();

    expect(started).toHaveLength(0);
  });

  it('plays the pitches of the track that was chosen last', () => {
    const { context, started, now } = fakeContext();
    const player = new MusicPlayer(
      () => context,
      () => on,
    );
    player.setTrack('menu');
    player.tick();
    const menuCount = started.length;

    now.value += 20;
    player.setTrack('game');
    player.tick();

    expect(started.length).toBeGreaterThan(menuCount);
    const gamePitches = started.slice(menuCount).map((entry) => Math.round(entry.hz));
    const menuPitches = started.slice(0, menuCount).map((entry) => Math.round(entry.hz));
    expect(gamePitches).not.toEqual(menuPitches);
  });

  it('crossfades by moving the level of the buses', () => {
    const { context, busLevels } = fakeContext();
    const player = new MusicPlayer(
      () => context,
      () => on,
    );
    player.setTrack('menu');
    const before = busLevels.length;

    player.setTrack('game');

    expect(busLevels.length).toBeGreaterThan(before);
    expect(busLevels.some((level) => level === 1)).toBe(true);
    expect(busLevels.some((level) => level === 0)).toBe(true);
  });

  it('dips the master level when ducked and restores it', () => {
    const { context, masterLevels } = fakeContext();
    const player = new MusicPlayer(
      () => context,
      () => on,
    );
    player.setTrack('game');
    player.tick();
    const full = Math.max(...masterLevels);

    player.duck();

    const ducked = masterLevels[masterLevels.length - 2] ?? full;
    expect(ducked).toBeLessThan(full);
    expect(masterLevels[masterLevels.length - 1]).toBeCloseTo(full, 5);
  });

  it('does nothing without an audio context', () => {
    const player = new MusicPlayer(
      () => undefined,
      () => on,
    );

    expect(() => {
      player.setTrack('game');
      player.tick();
      player.duck();
    }).not.toThrow();
  });
});
