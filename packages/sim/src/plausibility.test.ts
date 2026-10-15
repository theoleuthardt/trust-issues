import { describe, expect, it } from 'vitest';
import { Input, LEVELS, REPETITION_LIMIT, assessRun } from './index';
import { SOLUTIONS } from './testing';

const level = (parFrames: number) => ({ parFrames });

const pattern = (repeats: number, count = 7): number[] =>
  Array.from({ length: repeats }, () => [Input.Right, count, Input.Right | Input.Jump, 3]).flat();

describe('assessRun', () => {
  it('flags nothing for the reference solution of any level', () => {
    for (const candidate of LEVELS) {
      const solution = SOLUTIONS[candidate.id];
      if (!solution) throw new Error(`no reference solution for ${candidate.id}`);
      expect(assessRun(candidate, solution.replay, solution.frames), candidate.id).toEqual([]);
    }
  });

  it('flags a run faster than 70% of the par time', () => {
    expect(assessRun(level(1000), [Input.Right, 699], 699)).toEqual(['faster-than-possible']);
  });

  it('accepts a run at exactly 70% of the par time', () => {
    expect(assessRun(level(1000), [Input.Right, 700], 700)).toEqual([]);
  });

  it('flags the same short input pattern repeated exactly many times', () => {
    const replay = pattern(REPETITION_LIMIT);

    expect(assessRun(level(10_000), replay, 10_000)).toEqual(['repetitive-input']);
  });

  it('does not flag one repeat fewer', () => {
    const replay = pattern(REPETITION_LIMIT - 1);

    expect(assessRun(level(10_000), replay, 10_000)).toEqual([]);
  });

  it('does not flag a pattern whose timing varies', () => {
    const replay = Array.from({ length: 30 }, (_, i) => [
      Input.Right,
      6 + (i % 3),
      Input.Jump,
      3,
    ]).flat();

    expect(assessRun(level(10_000), replay, 10_000)).toEqual([]);
  });

  it('finds a repeated pattern of three entries in the middle of a run', () => {
    const triple = Array.from({ length: REPETITION_LIMIT }, () => [
      Input.Left,
      5,
      Input.Right,
      8,
      Input.Jump,
      2,
    ]).flat();
    const replay = [Input.Right, 40, ...triple, Input.Right, 30];

    expect(assessRun(level(10_000), replay, 10_000)).toEqual(['repetitive-input']);
  });

  it('reports both flags together', () => {
    const replay = pattern(REPETITION_LIMIT);

    expect(assessRun(level(10_000), replay, 1_000)).toEqual([
      'faster-than-possible',
      'repetitive-input',
    ]);
  });
});
