import { describe, expect, it, vi } from 'vitest';
import type { RunResult } from '../api/client';
import { syncAccount } from './accountSync';
import { ProgressStore } from './progress';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const RESULT: RunResult = { frames: 900, deaths: 0, score: 1000, personalBest: true, rank: 1 };

function setup(
  server: { levelId: string; score: number; frames: number; deaths: number }[],
  submit: (levelId: string, replay: number[]) => Promise<RunResult> = () => Promise.resolve(RESULT),
) {
  const storage = new MemoryStorage();
  const guest = new ProgressStore(storage, 'guest');
  const account = new ProgressStore(storage, 'account');
  const submitFn = vi.fn(submit);
  const run = () =>
    syncAccount({ fetchServer: () => Promise.resolve(server), submit: submitFn, guest, account });
  return { guest, account, submitFn, run };
}

describe('syncAccount', () => {
  it('takes over the progress the server has', async () => {
    const { account, run } = setup([{ levelId: 'a', score: 950, frames: 920, deaths: 1 }]);

    await run();

    expect(account.load()).toEqual({ a: { score: 950, frames: 920, deaths: 1 } });
  });

  it('submits guest runs that have a replay and the server does not know', async () => {
    const { guest, account, submitFn, run } = setup([]);
    guest.record('a', { score: 900, frames: 930, deaths: 0, replay: [2, 930] });

    const outcome = await run();

    expect(submitFn).toHaveBeenCalledWith('a', [2, 930]);
    expect(outcome.submitted).toBe(1);
    expect(account.load().a).toMatchObject({ score: 900 });
  });

  it('does not submit a guest run the server already beats', async () => {
    const { guest, submitFn, run } = setup([{ levelId: 'a', score: 990, frames: 900, deaths: 0 }]);
    guest.record('a', { score: 900, frames: 930, deaths: 0, replay: [2, 930] });

    await run();

    expect(submitFn).not.toHaveBeenCalled();
  });

  it('keeps guest progress without a replay for unlocking but cannot submit it', async () => {
    const { guest, account, submitFn, run } = setup([]);
    guest.record('a', { score: 900, frames: 930, deaths: 0 });

    await run();

    expect(submitFn).not.toHaveBeenCalled();
    expect(account.load().a).toMatchObject({ score: 900 });
  });

  it('clears the guest progress after a successful merge', async () => {
    const { guest, run } = setup([]);
    guest.record('a', { score: 900, frames: 930, deaths: 0, replay: [2, 930] });

    await run();

    expect(guest.load()).toEqual({});
  });

  it('keeps going when a single submission fails and keeps that run locally', async () => {
    const { guest, account, run } = setup([], () => Promise.reject(new Error('busy')));
    guest.record('a', { score: 900, frames: 930, deaths: 0, replay: [2, 930] });

    const outcome = await run();

    expect(outcome.failed).toBe(1);
    expect(account.load().a).toMatchObject({ score: 900 });
    expect(guest.load()).toEqual({});
  });

  it('leaves everything alone when the server cannot be reached', async () => {
    const storage = new MemoryStorage();
    const guest = new ProgressStore(storage, 'guest');
    const account = new ProgressStore(storage, 'account');
    guest.record('a', { score: 900, frames: 930, deaths: 0 });

    const outcome = await syncAccount({
      fetchServer: () => Promise.reject(new Error('offline')),
      submit: () => Promise.resolve(RESULT),
      guest,
      account,
    });

    expect(outcome.reachable).toBe(false);
    expect(guest.load().a).toBeDefined();
    expect(account.load()).toEqual({});
  });
});
