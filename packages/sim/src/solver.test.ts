import { describe, expect, it } from 'vitest';
import { buildLevel, simulate } from './index';
import type { Level, TrapDef } from './index';
import { solveStage } from './solver';

const levelOf = (rows: string[], traps: TrapDef[] = []): Level =>
  buildLevel({
    id: 'solver-test',
    name: 'solver test',
    stages: [{ rows, traps }],
    maxFrames: 3600,
    parFrames: 100,
  });

const solve = (rows: string[], traps: TrapDef[] = [], options = {}) => {
  const level = levelOf(rows, traps);
  const stage = level.stages[0];
  if (!stage) throw new Error('no stage');
  return { level, result: solveStage(stage, options) };
};

const FLAT = ['..........', '.S......E.', '##########'];

describe('solveStage', () => {
  it('solves a flat stage with the shortest run', () => {
    const { level, result } = solve(FLAT);

    expect(result.solved).toBe(true);
    if (!result.solved) return;
    expect(simulate(level, result.inputs)).toEqual({ finished: true, frames: 66, deaths: 0 });
    expect(result.inputs).toHaveLength(66);
  });

  it('jumps over a spike', () => {
    const { level, result } = solve(['..........', '.S..^...E.', '##########']);

    expect(result.solved).toBe(true);
    if (!result.solved) return;
    const run = simulate(level, result.inputs);
    expect(run.finished).toBe(true);
    expect(run.deaths).toBe(0);
  });

  it('crosses a pit', () => {
    const { level, result } = solve(['..........', '.S......E.', '###..#####']);

    expect(result.solved).toBe(true);
    if (!result.solved) return;
    expect(simulate(level, result.inputs).deaths).toBe(0);
  });

  it('solves a stage whose spike only appears when a trap fires', () => {
    const trap: TrapDef = {
      id: 'pop',
      trigger: { x: 3, y: 0, width: 1, height: 2 },
      action: 'add_spikes',
      tiles: [[5, 1]],
    };
    const { level, result } = solve(FLAT, [trap]);

    expect(result.solved).toBe(true);
    if (!result.solved) return;
    const run = simulate(level, result.inputs);
    expect(run.finished).toBe(true);
    expect(run.deaths).toBe(0);
  });

  it('reports a stage that cannot be solved', () => {
    const { result } = solve([
      '..........',
      '..#.......',
      '..#.......',
      '..#.......',
      '.S#.....E.',
      '##########',
    ]);

    expect(result).toMatchObject({ solved: false, reason: 'exhausted' });
  });

  it('gives up when the expansion budget is spent', () => {
    const { result } = solve(FLAT, [], { maxExpansions: 3 });

    expect(result).toMatchObject({ solved: false, reason: 'budget' });
  });

  it('is deterministic', () => {
    const first = solve(['..........', '.S..^...E.', '##########']).result;
    const second = solve(['..........', '.S..^...E.', '##########']).result;

    expect(second).toEqual(first);
  });
});
