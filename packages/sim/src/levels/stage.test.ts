import { describe, expect, it } from 'vitest';
import { buildLevel } from '../level';
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  block,
  drop,
  gap,
  pop,
  rise,
  seal,
  sky,
  spikes,
  stage,
  trap,
  vanish,
  wall,
} from './stage';

const cell = (rows: readonly string[], x: number, y: number) => rows[y]?.charAt(x);

describe('stage', () => {
  it('builds a full-size stage with a floor, a spawn and an exit', () => {
    const { rows, traps } = stage([]);

    expect(rows).toHaveLength(STAGE_HEIGHT);
    for (const row of rows) expect(row).toHaveLength(STAGE_WIDTH);
    expect(cell(rows, 1, 15)).toBe('S');
    expect(cell(rows, 30, 15)).toBe('E');
    expect(cell(rows, 5, 16)).toBe('#');
    expect(cell(rows, 5, 17)).toBe('#');
    expect(cell(rows, 5, 15)).toBe('.');
    expect(traps).toEqual([]);
  });

  it('places spawn and exit where asked', () => {
    const { rows } = stage([block(26, 13, 4)], { start: 3, end: 28, endY: 12 });

    expect(cell(rows, 3, 15)).toBe('S');
    expect(cell(rows, 28, 12)).toBe('E');
  });

  it('is accepted by buildLevel', () => {
    const level = buildLevel({
      id: 'dsl',
      name: 'dsl',
      stages: [stage([gap(10, 2), spikes(20), pop(5, 8), drop(14, 16, 2), rise(22, 26, 2)])],
      maxFrames: 600,
      parFrames: 100,
    });

    expect(level.stages).toHaveLength(1);
  });
});

describe('static features', () => {
  it('gap removes both floor rows', () => {
    const { rows } = stage([gap(10, 3)]);

    for (const x of [10, 11, 12]) {
      expect(cell(rows, x, 16)).toBe('.');
      expect(cell(rows, x, 17)).toBe('.');
    }
    expect(cell(rows, 9, 16)).toBe('#');
    expect(cell(rows, 13, 16)).toBe('#');
  });

  it('spikes put spike tiles on the floor row', () => {
    const { rows } = stage([spikes(8, 2)]);

    expect(cell(rows, 8, 15)).toBe('^');
    expect(cell(rows, 9, 15)).toBe('^');
    expect(cell(rows, 10, 15)).toBe('.');
  });

  it('wall stacks solid tiles on the floor', () => {
    const { rows } = stage([wall(12, 3)]);

    expect([15, 14, 13].map((y) => cell(rows, 12, y))).toEqual(['#', '#', '#']);
    expect(cell(rows, 12, 12)).toBe('.');
  });

  it('block places a free-floating rectangle', () => {
    const { rows } = stage([block(5, 10, 3, 2)]);

    expect(cell(rows, 5, 10)).toBe('#');
    expect(cell(rows, 7, 11)).toBe('#');
    expect(cell(rows, 8, 10)).toBe('.');
  });

  it('rejects features outside the stage', () => {
    expect(() => stage([block(31, 5, 3)])).toThrow(/outside/);
    expect(() => stage([wall(-1, 2)])).toThrow(/outside/);
  });
});

describe('trap features', () => {
  it('pop adds a spike when the player is two columns before the trigger column', () => {
    const { rows, traps } = stage([pop(8, 12)]);

    expect(cell(rows, 12, 15)).toBe('.');
    expect(traps).toEqual([
      {
        id: 't1',
        trigger: { x: 8, y: 13, width: 2, height: 3 },
        action: 'add_spikes',
        tiles: [[12, 15]],
      },
    ]);
  });

  it('pop can be wider and placed above the floor', () => {
    const { traps } = stage([pop(4, 9, 2, 12)]);

    expect(traps[0]?.tiles).toEqual([
      [9, 12],
      [10, 12],
    ]);
  });

  it('drop removes floor tiles in both rows', () => {
    const { traps } = stage([drop(5, 9, 2)]);

    expect(traps[0]).toMatchObject({ action: 'remove_tiles' });
    expect(traps[0]?.tiles).toEqual([
      [9, 16],
      [9, 17],
      [10, 16],
      [10, 17],
    ]);
  });

  it('rise adds a wall column of the given height', () => {
    const { traps } = stage([rise(10, 15, 2)]);

    expect(traps[0]).toMatchObject({ action: 'add_tiles' });
    expect(traps[0]?.tiles).toEqual([
      [15, 14],
      [15, 15],
    ]);
  });

  it('sky adds a spike at an arbitrary height', () => {
    const { traps } = stage([sky(6, 11, 12)]);

    expect(traps[0]).toMatchObject({ action: 'add_spikes', tiles: [[11, 12]] });
  });

  it('vanish removes tiles of a platform and seal adds tiles', () => {
    const { traps } = stage([block(10, 12, 3), vanish(8, 10, 12, 3), seal(20, 25, 10, 3)]);

    expect(traps[0]).toMatchObject({ action: 'remove_tiles' });
    expect(traps[0]?.tiles).toHaveLength(3);
    expect(traps[1]).toMatchObject({ action: 'add_tiles' });
    expect(traps[1]?.tiles).toEqual([
      [25, 10],
      [25, 11],
      [25, 12],
    ]);
  });

  it('numbers trap ids in feature order', () => {
    const { traps } = stage([pop(5, 9), drop(12, 16), rise(20, 24, 2)]);

    expect(traps.map((trap) => trap.id)).toEqual(['t1', 't2', 't3']);
  });
});

describe('trap', () => {
  it('adds a trap with an explicit trigger rectangle', () => {
    const { traps } = stage([trap('add_spikes', { x: 9, y: 9, width: 3, height: 3 }, [[14, 9]])]);

    expect(traps).toEqual([
      {
        id: 't1',
        trigger: { x: 9, y: 9, width: 3, height: 3 },
        action: 'add_spikes',
        tiles: [[14, 9]],
      },
    ]);
  });

  it('rejects tiles outside the stage', () => {
    expect(() =>
      stage([trap('add_tiles', { x: 0, y: 0, width: 1, height: 1 }, [[40, 2]])]),
    ).toThrow(/outside/);
  });
});

describe('stage width', () => {
  it('builds a wider stage when asked to, with the exit near the right end', () => {
    const { rows } = stage([], { width: 64 });

    expect(rows).toHaveLength(STAGE_HEIGHT);
    for (const row of rows) expect(row).toHaveLength(64);
    expect(cell(rows, 62, 15)).toBe('E');
    expect(cell(rows, 40, 16)).toBe('#');
  });

  it('lets features use the added columns', () => {
    const { rows, traps } = stage([spikes(50, 2), drop(40, 44, 2)], { width: 64 });

    expect(cell(rows, 51, 15)).toBe('^');
    expect(traps[0]?.tiles[0]).toEqual([44, 16]);
  });

  it('still refuses a feature outside the stage', () => {
    expect(() => stage([spikes(40)], { width: 32 })).toThrow(/outside/);
    expect(() => stage([spikes(70)], { width: 64 })).toThrow(/outside/);
  });

  it('only accepts a sensible width', () => {
    expect(() => stage([], { width: 10 })).toThrow(/width/);
    expect(() => stage([], { width: 500 })).toThrow(/width/);
  });
});
