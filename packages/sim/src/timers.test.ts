import { describe, expect, it } from 'vitest';
import { Input, TILE_SIZE, Tile, buildLevel, createState, stageOf, step } from './index';
import type { TrapDef } from './index';
import { solveStage } from './solver';
import { pop, stage, timed } from './levels/stage';

const trap = (overrides: Partial<TrapDef> = {}): TrapDef => ({
  id: 'a',
  trigger: { x: 3, y: 0, width: 1, height: 3 },
  action: 'add_spikes',
  tiles: [[6, 1]],
  ...overrides,
});

const level = (traps: TrapDef[], rows = ['.........', '.S.....E.', '#########']) =>
  buildLevel({
    id: 't',
    name: 't',
    stages: [{ rows, traps }],
    maxFrames: 3600,
    parFrames: 100,
  });

const WIDTH = 9;
const tileAt = (state: ReturnType<typeof createState>, x: number, y: number) =>
  state.tiles[y * WIDTH + x];

function untilTriggered(lvl: ReturnType<typeof level>, state: ReturnType<typeof createState>) {
  let guard = 0;
  while (!state.fired.has('a') && guard++ < 200) step(lvl, state, Input.Right);
  return state.tick;
}

function leaveTrigger(state: ReturnType<typeof createState>) {
  state.x = 5 * TILE_SIZE;
}

describe('delay', () => {
  it('applies the action only after the delay has passed since the trigger', () => {
    const lvl = level([trap({ delay: 30 })]);
    const state = createState(lvl);
    const at = untilTriggered(lvl, state);

    for (let i = 0; i < 29; i++) step(lvl, state, 0);
    expect(tileAt(state, 6, 1)).toBe(Tile.Air);
    step(lvl, state, 0);

    expect(state.tick).toBe(at + 30);
    expect(tileAt(state, 6, 1)).toBe(Tile.Spike);
  });

  it('is the same as no delay when it is 0 or missing', () => {
    for (const traps of [[trap()], [trap({ delay: 0 })]]) {
      const lvl = level(traps);
      const state = createState(lvl);
      untilTriggered(lvl, state);

      expect(tileAt(state, 6, 1)).toBe(Tile.Spike);
    }
  });

  it('is cancelled by a death and the trap is armed again', () => {
    const rows = ['.........', '.S^....E.', '#########'];
    const lvl = level([trap({ delay: 40, trigger: { x: 1, y: 0, width: 1, height: 3 } })], rows);
    const state = createState(lvl);
    step(lvl, state, 0);
    expect(state.fired.has('a')).toBe(true);
    state.x = 2 * TILE_SIZE;
    step(lvl, state, 0);
    expect(state.deaths).toBe(1);

    for (let i = 0; i < 60; i++) step(lvl, state, 0);

    expect(tileAt(state, 6, 1)).toBe(Tile.Spike);
    expect(state.deaths).toBe(1);
  });

  it('does not fire again while it is waiting', () => {
    const lvl = level([trap({ delay: 20 })]);
    const state = createState(lvl);
    const at = untilTriggered(lvl, state);

    for (let i = 0; i < 25; i++) step(lvl, state, Input.Left | Input.Right);

    expect(state.tick).toBe(at + 25);
    expect(tileAt(state, 6, 1)).toBe(Tile.Spike);
  });
});

describe('rearm', () => {
  it('takes the effect away again after the given number of ticks', () => {
    const lvl = level([trap({ rearm: 20 })]);
    const state = createState(lvl);
    untilTriggered(lvl, state);
    leaveTrigger(state);
    expect(tileAt(state, 6, 1)).toBe(Tile.Spike);

    for (let i = 0; i < 19; i++) step(lvl, state, 0);
    expect(tileAt(state, 6, 1)).toBe(Tile.Spike);
    step(lvl, state, 0);

    expect(tileAt(state, 6, 1)).toBe(Tile.Air);
  });

  it('puts removed tiles back and lets the trap fire again', () => {
    const lvl = level(
      [trap({ action: 'remove_tiles', tiles: [[6, 2]], rearm: 15 })],
      ['.........', '.S.....E.', '#########'],
    );
    const state = createState(lvl);
    untilTriggered(lvl, state);
    leaveTrigger(state);
    expect(tileAt(state, 6, 2)).toBe(Tile.Air);

    for (let i = 0; i < 16; i++) step(lvl, state, 0);
    expect(tileAt(state, 6, 2)).toBe(Tile.Solid);
    expect(state.fired.has('a')).toBe(false);

    state.x = 3 * TILE_SIZE;
    step(lvl, state, 0);

    expect(tileAt(state, 6, 2)).toBe(Tile.Air);
  });

  it('counts from the moment the action was applied, after a delay', () => {
    const lvl = level([trap({ delay: 10, rearm: 10 })]);
    const state = createState(lvl);
    const at = untilTriggered(lvl, state);
    leaveTrigger(state);

    while (state.tick < at + 19) step(lvl, state, 0);
    expect(tileAt(state, 6, 1)).toBe(Tile.Spike);
    step(lvl, state, 0);

    expect(tileAt(state, 6, 1)).toBe(Tile.Air);
  });
});

describe('validation', () => {
  it.each([
    ['a negative delay', { delay: -1 }],
    ['a fractional delay', { delay: 1.5 }],
    ['a delay beyond ten seconds', { delay: 601 }],
    ['a rearm of 0', { rearm: 0 }],
    ['a fractional rearm', { rearm: 2.5 }],
    ['a rearm beyond a minute', { rearm: 3601 }],
  ])('rejects %s', (_name, timing) => {
    expect(() => level([trap(timing)])).toThrow(/delay|rearm/);
  });

  it('rejects a re-arming trap whose tiles another trap also changes', () => {
    const rearming = trap({ id: 'a', rearm: 30, tiles: [[6, 1]] });
    const other = trap({ id: 'b', action: 'add_tiles', tiles: [[6, 1]] });

    expect(() => level([rearming, other])).toThrow(/rearm.*tile/i);
    expect(() => level([other, rearming])).toThrow(/rearm.*tile/i);
  });

  it('accepts traps that share tiles when none of them re-arms', () => {
    const first = trap({ id: 'a', tiles: [[6, 1]] });
    const second = trap({ id: 'b', action: 'add_tiles', tiles: [[6, 1]] });

    expect(() => level([first, second])).not.toThrow();
  });

  it('accepts a re-arming trap whose tiles nobody else touches', () => {
    const rearming = trap({ id: 'a', rearm: 30, tiles: [[6, 1]] });
    const other = trap({ id: 'b', tiles: [[5, 1]] });

    expect(() => level([rearming, other])).not.toThrow();
  });

  it('accepts valid timings', () => {
    expect(() => level([trap({ delay: 30, rearm: 90 })])).not.toThrow();
  });
});

describe('timed feature', () => {
  it('adds delay and rearm to the traps of the feature it wraps', () => {
    const def = stage([timed(pop(8, 12), { delay: 20, rearm: 60 }), pop(15, 20)]);

    expect(def.traps[0]).toMatchObject({ delay: 20, rearm: 60 });
    expect(def.traps[1]).not.toHaveProperty('delay');
  });
});

describe('solver', () => {
  it('finds a way through a stage with a delayed trap', () => {
    const def = stage([timed(pop(10, 14), { delay: 30 })]);
    const built = buildLevel({
      id: 't',
      name: 't',
      stages: [def],
      maxFrames: 3600,
      parFrames: 100,
    });

    const result = solveStage(stageOf(built, 0), { maxFrames: 3600 });

    expect(result.solved).toBe(true);
  });
});
