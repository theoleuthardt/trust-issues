import { describe, expect, it } from 'vitest';
import {
  GRAVITY,
  Input,
  LOW_GRAVITY,
  TILE_SIZE,
  buildLevel,
  createState,
  stageOf,
  step,
} from './index';
import type { ZoneDef } from './index';
import { fakeExit, floatZone, invertZone, stage } from './levels/stage';
import { solveStage } from './solver';

const FLAT = ['.................', '.S.............E.', '#################'];

const level = (zones: ZoneDef[], rows: string[] = FLAT) =>
  buildLevel({
    id: 't',
    name: 't',
    stages: [{ rows, traps: [], zones }],
    maxFrames: 3600,
    parFrames: 100,
  });

const run = (
  lvl: ReturnType<typeof level>,
  state: ReturnType<typeof createState>,
  mask: number,
  ticks: number,
) => {
  for (let i = 0; i < ticks; i++) step(lvl, state, mask);
};

describe('invert zones', () => {
  const zone: ZoneDef = { x: 4, y: 0, width: 4, height: 3, effect: 'invert' };

  it('swap left and right while the player is inside', () => {
    const lvl = level([zone]);
    const state = createState(lvl);
    state.x = 5 * TILE_SIZE;
    const before = state.x;

    run(lvl, state, Input.Right, 5);

    expect(state.x).toBeLessThan(before);
  });

  it('leave the controls alone outside the zone', () => {
    const lvl = level([zone]);
    const state = createState(lvl);
    const before = state.x;

    run(lvl, state, Input.Right, 5);

    expect(state.x).toBeGreaterThan(before);
  });

  it('give the normal controls back on the first tick after leaving', () => {
    const lvl = level([zone]);
    const state = createState(lvl);
    state.x = 4 * TILE_SIZE + 2;

    run(lvl, state, Input.Left, 40);
    expect(state.x).toBeGreaterThan(4 * TILE_SIZE);
    state.x = 3 * TILE_SIZE;
    const outside = state.x;
    run(lvl, state, Input.Right, 3);

    expect(state.x).toBeGreaterThan(outside);
  });

  it('hold a player who keeps walking into them at the border', () => {
    const lvl = level([zone]);
    const state = createState(lvl);
    state.x = 3 * TILE_SIZE;

    run(lvl, state, Input.Right, 60);

    expect(state.x).toBeGreaterThan(3 * TILE_SIZE);
    expect(state.x).toBeLessThan(4 * TILE_SIZE);
  });

  it('carry a player who walks the other way to the far border', () => {
    const lvl = level([zone]);
    const state = createState(lvl);
    state.x = 5 * TILE_SIZE;

    run(lvl, state, Input.Left, 80);

    expect(state.x).toBeGreaterThan(7 * TILE_SIZE);
    expect(state.x).toBeLessThan(8 * TILE_SIZE);
  });
});

describe('float zones', () => {
  const zone: ZoneDef = { x: 0, y: 0, width: 17, height: 3, effect: 'low_gravity' };

  it('pull the player down more slowly', () => {
    const rows = [
      '.................',
      '.S.............E.',
      '.................',
      '#################',
    ];
    const floating = level([zone], rows);
    const normal = level([], rows);
    const up = createState(floating);
    const down = createState(normal);
    up.y = 0;
    down.y = 0;
    up.onGround = false;
    down.onGround = false;

    run(floating, up, 0, 10);
    run(normal, down, 0, 10);

    expect(up.y).toBeLessThan(down.y);
    expect(up.vy).toBeCloseTo(LOW_GRAVITY * 10, 5);
    expect(down.vy).toBeCloseTo(GRAVITY * 10, 5);
  });

  it('make a jump rise higher', () => {
    const rows = [
      '.................',
      '.................',
      '.................',
      '.S.............E.',
      '#################',
    ];
    const floating = level([{ ...zone, height: 5 }], rows);
    const normal = level([], rows);
    const a = createState(floating);
    const b = createState(normal);
    let highest = { a: a.y, b: b.y };

    for (let i = 0; i < 60; i++) {
      step(floating, a, i === 0 ? Input.Jump : 0);
      step(normal, b, i === 0 ? Input.Jump : 0);
      highest = { a: Math.min(highest.a, a.y), b: Math.min(highest.b, b.y) };
    }

    expect(highest.a).toBeLessThan(highest.b - TILE_SIZE);
  });

  it('start to work on the tick after the player jumped into the zone and end as soon as they leave', () => {
    const rows = ['.........', '.........', '.........', '.S.....E.', '#########'];
    const lvl = level([{ x: 0, y: 0, width: 9, height: 2, effect: 'low_gravity' }], rows);
    const state = createState(lvl);
    state.y = 2 * TILE_SIZE + 6;
    state.onGround = false;
    state.vy = -5;

    step(lvl, state, 0);
    const outside = state.vy;
    expect(outside).toBeCloseTo(-5 + GRAVITY, 5);

    state.y = 0.5 * TILE_SIZE;
    step(lvl, state, 0);
    expect(state.vy).toBeCloseTo(outside + LOW_GRAVITY, 5);

    state.y = 2.5 * TILE_SIZE;
    const inside = state.vy;
    step(lvl, state, 0);
    expect(state.vy).toBeCloseTo(inside + GRAVITY, 5);
  });
});

describe('validation', () => {
  it.each([
    ['a zone outside the stage', { x: 15, y: 0, width: 5, height: 1, effect: 'invert' as const }],
    ['an empty zone', { x: 1, y: 0, width: 0, height: 1, effect: 'invert' as const }],
    ['a negative position', { x: -1, y: 0, width: 2, height: 1, effect: 'invert' as const }],
    ['a fractional size', { x: 1, y: 0, width: 1.5, height: 1, effect: 'invert' as const }],
    ['an unknown effect', { x: 1, y: 0, width: 1, height: 1, effect: 'spin' as never }],
  ])('rejects %s', (_name, zone) => {
    expect(() => level([zone])).toThrow(/zone/);
  });
});

describe('stage features', () => {
  it('invertZone and floatZone add zones to the stage', () => {
    const def = stage([invertZone(10, 8, 4, 8), floatZone(20, 8, 3, 8), fakeExit(28)]);

    expect(def.zones).toEqual([
      { x: 10, y: 8, width: 4, height: 8, effect: 'invert' },
      { x: 20, y: 8, width: 3, height: 8, effect: 'low_gravity' },
    ]);
  });

  it('leave `zones` out of a stage that has none', () => {
    expect(stage([])).not.toHaveProperty('zones');
  });
});

describe('solver', () => {
  it('finds a way through a stage with an invert zone', () => {
    const built = buildLevel({
      id: 't',
      name: 't',
      stages: [stage([invertZone(10, 10, 5, 6)])],
      maxFrames: 3600,
      parFrames: 100,
    });

    const result = solveStage(stageOf(built, 0), { maxFrames: 3600 });

    expect(result.solved).toBe(true);
  });
});
