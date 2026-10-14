import { describe, expect, it } from 'vitest';
import {
  PROGRESS_KEY,
  ProgressStore,
  firstOpenIndex,
  isUnlocked,
  levelCards,
  recordRun,
} from './progress';

const LEVELS = [
  { id: 'a', name: 'Alpha', stages: [{}, {}, {}] },
  { id: 'b', name: 'Beta', stages: [{}, {}, {}, {}] },
  { id: 'c', name: 'Gamma', stages: [{}, {}, {}] },
];

const run = (score: number, frames = 900, deaths = 0) => ({ score, frames, deaths });

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('recordRun', () => {
  it('stores the first run of a level', () => {
    expect(recordRun({}, 'a', run(900))).toEqual({ a: run(900) });
  });

  it('keeps the higher score', () => {
    const progress = { a: run(900) };

    expect(recordRun(progress, 'a', run(950))).toEqual({ a: run(950) });
    expect(recordRun(progress, 'a', run(800))).toEqual({ a: run(900) });
  });

  it('prefers fewer frames at an equal score', () => {
    const progress = { a: run(900, 950) };

    expect(recordRun(progress, 'a', run(900, 940))).toEqual({ a: run(900, 940) });
    expect(recordRun(progress, 'a', run(900, 960))).toEqual({ a: run(900, 950) });
  });

  it('does not change the input', () => {
    const progress = { a: run(900) };
    recordRun(progress, 'b', run(500));

    expect(progress).toEqual({ a: run(900) });
  });
});

describe('unlocking', () => {
  it('opens the first level and each level after a cleared one', () => {
    expect(isUnlocked(LEVELS, {}, 0)).toBe(true);
    expect(isUnlocked(LEVELS, {}, 1)).toBe(false);
    expect(isUnlocked(LEVELS, { a: run(900) }, 1)).toBe(true);
    expect(isUnlocked(LEVELS, { a: run(900) }, 2)).toBe(false);
  });

  it('finds the first level that is not cleared yet', () => {
    expect(firstOpenIndex(LEVELS, {})).toBe(0);
    expect(firstOpenIndex(LEVELS, { a: run(900) })).toBe(1);
    expect(firstOpenIndex(LEVELS, { a: run(900), b: run(900) })).toBe(2);
  });

  it('stays on the last level when everything is cleared', () => {
    const all = { a: run(900), b: run(900), c: run(900) };

    expect(firstOpenIndex(LEVELS, all)).toBe(2);
  });
});

describe('levelCards', () => {
  it('describes every level with number, name, stages and state', () => {
    const cards = levelCards(LEVELS, { a: run(950, 920, 1) });

    expect(cards).toEqual([
      {
        index: 0,
        id: 'a',
        number: 1,
        name: 'Alpha',
        stages: 3,
        status: 'cleared',
        best: run(950, 920, 1),
      },
      { index: 1, id: 'b', number: 2, name: 'Beta', stages: 4, status: 'open', best: undefined },
      { index: 2, id: 'c', number: 3, name: 'Gamma', stages: 3, status: 'locked', best: undefined },
    ]);
  });
});

describe('ProgressStore with replays and keys', () => {
  it('keeps the replay of the best run', () => {
    const store = new ProgressStore(new MemoryStorage());
    store.record('a', { ...run(900), replay: [2, 60] });

    expect(store.load()).toEqual({ a: { ...run(900), replay: [2, 60] } });
  });

  it('keeps progress of different keys apart and can clear one', () => {
    const storage = new MemoryStorage();
    const guest = new ProgressStore(storage);
    const account = new ProgressStore(storage, 'user.mallory');
    guest.record('a', run(900));
    account.record('b', run(800));

    expect(guest.load()).toEqual({ a: run(900) });
    expect(account.load()).toEqual({ b: run(800) });

    guest.clear();

    expect(guest.load()).toEqual({});
    expect(account.load()).toEqual({ b: run(800) });
  });

  it('ignores a damaged replay but keeps the result', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_KEY, JSON.stringify({ a: { ...run(900), replay: 'nope' } }));

    expect(new ProgressStore(storage).load()).toEqual({ a: run(900) });
  });
});

describe('ProgressStore', () => {
  it('starts empty', () => {
    expect(new ProgressStore(new MemoryStorage()).load()).toEqual({});
  });

  it('persists recorded runs', () => {
    const storage = new MemoryStorage();
    new ProgressStore(storage).record('a', run(900));

    expect(new ProgressStore(storage).load()).toEqual({ a: run(900) });
  });

  it('keeps the best run across records', () => {
    const store = new ProgressStore(new MemoryStorage());
    store.record('a', run(900));
    store.record('a', run(700));

    expect(store.load()).toEqual({ a: run(900) });
  });

  it('keeps working in memory when the storage refuses to read or write', () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: (): void => {
        throw new Error('quota');
      },
    };
    const store = new ProgressStore(broken);

    expect(store.load()).toEqual({});
    expect(() => store.record('a', run(900))).not.toThrow();
    expect(store.load()).toEqual({ a: run(900) });
  });

  it('does not overwrite saved progress when only reading failed', () => {
    const writes: string[] = [];
    const flaky = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: (_key: string, value: string): void => {
        writes.push(value);
      },
    };
    const store = new ProgressStore(flaky);

    store.record('a', run(900));

    expect(writes).toEqual([]);
    expect(store.load()).toEqual({ a: run(900) });
  });

  it('ignores damaged or foreign data', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_KEY, '{not json');
    expect(new ProgressStore(storage).load()).toEqual({});

    storage.setItem(PROGRESS_KEY, JSON.stringify({ a: { score: 'x' }, b: run(10), c: 5 }));
    expect(new ProgressStore(storage).load()).toEqual({ b: run(10) });
  });
});
