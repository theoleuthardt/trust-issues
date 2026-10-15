import { describe, expect, it, vi } from 'vitest';
import { SoundBoard } from './SoundBoard';
import type { AudioLike } from './SoundBoard';
import { SOUNDS } from './effects';

function fakeAudio() {
  const started: { type: string; from: number; to: number; at: number; stop: number }[] = [];
  const gains: number[] = [];
  const state = { current: 'suspended' as 'suspended' | 'running' };
  const resume = vi.fn(() => {
    state.current = 'running';
    return Promise.resolve();
  });
  const context: AudioLike = {
    get state() {
      return state.current;
    },
    currentTime: 10,
    destination: {},
    resume,
    createGain() {
      const node = {
        gain: {
          value: 0,
          setValueAtTime(value: number) {
            gains.push(value);
          },
          linearRampToValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      };
      return node;
    },
    createOscillator() {
      const entry = { type: '', from: 0, to: 0, at: 0, stop: 0 };
      return {
        set type(value: string) {
          entry.type = value;
        },
        frequency: {
          setValueAtTime(value: number) {
            entry.from = value;
          },
          exponentialRampToValueAtTime(value: number) {
            entry.to = value;
          },
        },
        connect: () => undefined,
        start(at: number) {
          entry.at = at;
          started.push(entry);
        },
        stop(at: number) {
          entry.stop = at;
        },
      };
    },
  };
  return { context, started, gains, resume, state };
}

const settings = { muted: false, volume: 80 };

describe('SoundBoard', () => {
  it('plays every tone of a sound, starting at the current time of the context', async () => {
    const { context, started } = fakeAudio();
    const board = new SoundBoard(
      () => context,
      () => settings,
    );
    await board.unlock();

    board.play('exit');

    expect(started).toHaveLength(SOUNDS.exit.length);
    expect(started[0]?.at).toBeGreaterThanOrEqual(10);
  });

  it('plays nothing when muted or at volume 0', async () => {
    const { context, started } = fakeAudio();
    const muted = new SoundBoard(
      () => context,
      () => ({ muted: true, volume: 80 }),
    );
    const silent = new SoundBoard(
      () => context,
      () => ({ muted: false, volume: 0 }),
    );

    await muted.unlock();
    await silent.unlock();
    muted.play('jump');
    silent.play('jump');

    expect(started).toHaveLength(0);
  });

  it('does not create the audio context before the first gesture unlocks it', () => {
    const factory = vi.fn(() => fakeAudio().context);
    const board = new SoundBoard(factory, () => settings);

    board.play('jump');

    expect(factory).not.toHaveBeenCalled();
  });

  it('creates the context and resumes it when unlocked', async () => {
    const { context, resume } = fakeAudio();
    const factory = vi.fn(() => context);
    const board = new SoundBoard(factory, () => settings);

    await board.unlock();
    await board.unlock();

    expect(factory).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalled();
  });

  it('plays after it was unlocked', async () => {
    const { context, started } = fakeAudio();
    const board = new SoundBoard(
      () => context,
      () => settings,
    );
    await board.unlock();

    board.play('death');

    expect(started).toHaveLength(SOUNDS.death.length);
  });

  it('keeps working without Web Audio', async () => {
    const board = new SoundBoard(
      () => undefined,
      () => settings,
    );

    await board.unlock();

    expect(() => board.play('jump')).not.toThrow();
  });

  it('does not play while the context is still suspended', async () => {
    const { context, started, state } = fakeAudio();
    const board = new SoundBoard(
      () => context,
      () => settings,
    );
    await board.unlock();
    state.current = 'suspended';

    board.play('trap');

    expect(started).toHaveLength(0);
  });

  it('reports whether the context is running after an unlock', async () => {
    const { context } = fakeAudio();
    const working = new SoundBoard(
      () => context,
      () => settings,
    );
    const unsupported = new SoundBoard(
      () => undefined,
      () => settings,
    );

    expect(await working.unlock()).toBe(true);
    expect(await unsupported.unlock()).toBe(false);
  });

  it('reports a failed resume and can be tried again', async () => {
    const { context, state } = fakeAudio();
    let allow = false;
    context.resume = () => {
      if (!allow) return Promise.reject(new Error('blocked'));
      state.current = 'running';
      return Promise.resolve();
    };
    const board = new SoundBoard(
      () => context,
      () => settings,
    );

    expect(await board.unlock()).toBe(false);
    allow = true;
    expect(await board.unlock()).toBe(true);
  });
});
