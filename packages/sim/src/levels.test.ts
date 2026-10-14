import { describe, expect, it } from 'vitest';
import { Input, LEVELS, decodeReplay, getLevel, simulate } from './index';
import { SOLUTIONS } from './testing';

describe('levels', () => {
  it('has unique ids', () => {
    const ids = LEVELS.map((level) => level.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('looks levels up by id', () => {
    expect(getLevel('trust-nothing')?.name).toBe('Trust Nothing');
    expect(getLevel('missing')).toBeUndefined();
  });

  describe.each(LEVELS.map((level) => [level.id, level] as const))('%s', (id, level) => {
    it('is beatable with the recorded reference solution', () => {
      const solution = SOLUTIONS[id];
      expect(solution, `no reference solution for ${id}`).toBeDefined();
      if (!solution) return;

      const inputs = decodeReplay(solution.replay, level.maxFrames);
      const result = simulate(level, inputs);

      expect(result).toEqual({ finished: true, frames: solution.frames, deaths: solution.deaths });
    });

    it('is not beaten by just holding right', () => {
      const result = simulate(level, new Array<number>(level.maxFrames).fill(Input.Right));

      expect(result.deaths).toBeGreaterThan(0);
    });
  });
});
