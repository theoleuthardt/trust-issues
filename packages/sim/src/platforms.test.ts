import { describe, expect, it } from 'vitest';
import {
  Input,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
  Tile,
  buildLevel,
  createState,
  platformRect,
  stageOf,
  step,
} from './index';
import type { PlatformDef } from './index';
import { movingPlatform, stage } from './levels/stage';
import { solveStage } from './solver';

const level = (platforms: PlatformDef[], rows: string[]) =>
  buildLevel({
    id: 't',
    name: 't',
    stages: [{ rows, traps: [], platforms }],
    maxFrames: 3600,
    parFrames: 100,
  });

const ROOM = [
  '..................',
  '..................',
  '..................',
  '..................',
  '..................',
  '.S...............E',
  '##################',
];

const run = (
  lvl: ReturnType<typeof level>,
  state: ReturnType<typeof createState>,
  mask: number,
  ticks: number,
) => {
  for (let i = 0; i < ticks; i++) step(lvl, state, mask);
};

describe('platformRect', () => {
  const platform: PlatformDef = { x: 4, y: 3, width: 2, axis: 'x', distance: 3, period: 120 };

  it('starts at its place and reaches the far end after half a period', () => {
    expect(platformRect(platform, 0)).toEqual({
      x: 4 * TILE_SIZE,
      y: 3 * TILE_SIZE,
      width: 2 * TILE_SIZE,
      height: TILE_SIZE,
    });
    expect(platformRect(platform, 60).x).toBe(4 * TILE_SIZE + 3 * TILE_SIZE);
  });

  it('comes back and repeats every period', () => {
    expect(platformRect(platform, 120)).toEqual(platformRect(platform, 0));
    expect(platformRect(platform, 90).x).toBe(platformRect(platform, 30).x);
    expect(platformRect(platform, 125)).toEqual(platformRect(platform, 5));
  });

  it('moves along y for a vertical platform', () => {
    const vertical: PlatformDef = { ...platform, axis: 'y' };

    expect(platformRect(vertical, 60).y).toBe(3 * TILE_SIZE + 3 * TILE_SIZE);
    expect(platformRect(vertical, 60).x).toBe(4 * TILE_SIZE);
  });

  it('only uses whole pixels', () => {
    for (let tick = 0; tick < 240; tick++) {
      expect(Number.isInteger(platformRect({ ...platform, distance: 5, period: 70 }, tick).x)).toBe(
        true,
      );
    }
  });

  it('can be shifted in time by a phase', () => {
    const shifted: PlatformDef = { ...platform, phase: 60 };

    expect(platformRect(shifted, 0).x).toBe(platformRect(platform, 60).x);
  });
});

describe('riding', () => {
  it('carries a player along a horizontal platform', () => {
    const platform: PlatformDef = { x: 2, y: 4, width: 3, axis: 'x', distance: 6, period: 240 };
    const lvl = level([platform], ROOM);
    const state = createState(lvl);
    state.x = 2 * TILE_SIZE + 20;
    state.y = 4 * TILE_SIZE - PLAYER_HEIGHT;
    state.onGround = true;
    const start = state.x;

    run(lvl, state, 0, 60);

    expect(state.x - start).toBe(platformRect(platform, 60).x - platformRect(platform, 0).x);
    expect(state.y).toBe(4 * TILE_SIZE - PLAYER_HEIGHT);
    expect(state.onGround).toBe(true);
  });

  it('carries a player up and down a vertical platform without leaving it', () => {
    const platform: PlatformDef = { x: 6, y: 1, width: 2, axis: 'y', distance: 3, period: 120 };
    const lvl = level([platform], ROOM);
    const state = createState(lvl);
    state.x = 6 * TILE_SIZE + 10;
    state.y = platformRect(platform, 0).y - PLAYER_HEIGHT;
    state.onGround = true;

    for (let tick = 1; tick <= 120; tick++) {
      step(lvl, state, 0);
      expect(state.y).toBe(platformRect(platform, tick).y - PLAYER_HEIGHT);
      expect(state.onGround).toBe(true);
    }
  });

  it('lets the player jump off a moving platform', () => {
    const platform: PlatformDef = { x: 2, y: 4, width: 3, axis: 'x', distance: 6, period: 240 };
    const lvl = level([platform], ROOM);
    const state = createState(lvl);
    state.x = 3 * TILE_SIZE;
    state.y = 4 * TILE_SIZE - PLAYER_HEIGHT;
    state.onGround = true;

    step(lvl, state, Input.Jump);

    expect(state.vy).toBeLessThan(0);
    expect(state.y).toBeLessThan(4 * TILE_SIZE - PLAYER_HEIGHT);
  });

  it('lands on a platform that is moving, coming from above', () => {
    const platform: PlatformDef = { x: 2, y: 4, width: 3, axis: 'x', distance: 6, period: 240 };
    const lvl = level([platform], ROOM);
    const state = createState(lvl);
    state.x = 3 * TILE_SIZE;
    state.y = 0;
    state.onGround = false;

    run(lvl, state, 0, 40);

    expect(state.onGround).toBe(true);
    expect(state.y + PLAYER_HEIGHT).toBe(platformRect(platform, state.stageTick).y);
  });

  it('can be left through the side: walking off makes the player fall', () => {
    const platform: PlatformDef = { x: 2, y: 3, width: 2, axis: 'y', distance: 1, period: 40 };
    const lvl = level([platform], ROOM);
    const state = createState(lvl);
    state.x = 2 * TILE_SIZE + 4;
    state.y = platformRect(platform, 0).y - PLAYER_HEIGHT;
    state.onGround = true;

    run(lvl, state, Input.Right, 30);

    expect(state.x).toBeGreaterThan(4 * TILE_SIZE);
    expect(state.y).toBeGreaterThan(3 * TILE_SIZE);
  });

  it('does not carry a rider into a ceiling that appeared above them', () => {
    const rows = [
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '.S...............E',
      '##################',
    ];
    const platform: PlatformDef = { x: 1, y: 3, width: 3, axis: 'y', distance: 3, period: 120 };
    const lvl = level([platform], rows);
    const state = createState(lvl);
    state.tick = 90;
    state.stageTick = 90;
    state.x = 2 * TILE_SIZE;
    state.y = platformRect(platform, 90).y - PLAYER_HEIGHT;
    state.onGround = true;
    const width = stageOf(lvl, 0).width;
    for (let x = 0; x < width; x++) state.tiles[2 * width + x] = Tile.Solid;

    for (let tick = 0; tick < 30; tick++) {
      step(lvl, state, 0);
      expect(state.y).toBeGreaterThanOrEqual(3 * TILE_SIZE);
    }
  });

  it('does not carry a rider through a wall', () => {
    const rows = [
      '..................',
      '..................',
      '..................',
      '..................',
      '.....#............',
      '.S...#...........E',
      '##################',
    ];
    const platform: PlatformDef = { x: 1, y: 6, width: 3, axis: 'x', distance: 4, period: 120 };
    const lvl = level(
      [{ ...platform, y: 5 }],
      rows.map((row, y) => (y === 5 ? row.replace('#', '.') : row)),
    );
    const state = createState(lvl);
    state.x = 3 * TILE_SIZE;
    state.y = platformRect({ ...platform, y: 5 }, 0).y - PLAYER_HEIGHT;
    state.onGround = true;

    for (let tick = 0; tick < 60; tick++) {
      step(lvl, state, 0);
      expect(state.x + PLAYER_WIDTH).toBeLessThanOrEqual(5 * TILE_SIZE);
    }
  });

  it('is passed through from below', () => {
    const platform: PlatformDef = { x: 2, y: 3, width: 4, axis: 'x', distance: 1, period: 1200 };
    const lvl = level([platform], ROOM);
    const state = createState(lvl);
    state.x = 3 * TILE_SIZE;
    state.y = 5 * TILE_SIZE - PLAYER_HEIGHT + 4;
    state.onGround = true;

    step(lvl, state, Input.Jump);
    run(lvl, state, 0, 6);

    expect(state.y).toBeLessThan(3 * TILE_SIZE);
  });

  it('does not change anything for a level without platforms', () => {
    const lvl = level([], ROOM);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 10);

    expect(state.x).toBe(stageOf(lvl, 0).spawn.x + 30);
    expect(PLAYER_WIDTH).toBe(24);
  });
});

describe('determinism', () => {
  it('gives the same run for the same inputs', () => {
    const platform: PlatformDef = { x: 2, y: 4, width: 3, axis: 'x', distance: 6, period: 240 };
    const lvl = level([platform], ROOM);
    const inputs = Array.from({ length: 300 }, (_, i) => (i % 17 < 9 ? Input.Right : Input.Jump));
    const a = createState(lvl);
    const b = createState(lvl);

    for (const input of inputs) {
      step(lvl, a, input);
      step(lvl, b, input);
    }

    expect({ x: a.x, y: a.y, deaths: a.deaths }).toEqual({ x: b.x, y: b.y, deaths: b.deaths });
  });
});

describe('validation', () => {
  const base: PlatformDef = { x: 2, y: 3, width: 2, axis: 'x', distance: 3, period: 120 };

  it.each([
    ['a platform outside the stage at its start', { ...base, x: 17 }],
    ['a platform that leaves the stage on its way', { ...base, distance: 20 }],
    ['a width of 0', { ...base, width: 0 }],
    ['a fractional distance', { ...base, distance: 1.5 }],
    ['a distance of 0', { ...base, distance: 0 }],
    ['an odd period', { ...base, period: 121 }],
    ['a period that is too short', { ...base, period: 10 }],
    ['an unknown axis', { ...base, axis: 'z' as never }],
  ])('rejects %s', (_name, platform) => {
    expect(() => level([platform], ROOM)).toThrow(/platform/);
  });

  it('accepts a valid platform', () => {
    expect(() => level([base], ROOM)).not.toThrow();
  });
});

describe('stage feature', () => {
  it('movingPlatform adds a platform to the stage', () => {
    const def = stage([movingPlatform(8, 11, 3, { axis: 'x', distance: 5, period: 180 })]);

    expect(def.platforms).toEqual([{ x: 8, y: 11, width: 3, axis: 'x', distance: 5, period: 180 }]);
  });

  it('leaves `platforms` out of a stage that has none', () => {
    expect(stage([])).not.toHaveProperty('platforms');
  });
});

describe('solver', () => {
  it('finds a way over a gap that only a moving platform bridges', () => {
    const def = stage([movingPlatform(8, 14, 3, { axis: 'x', distance: 5, period: 80 })]);
    const rows = def.rows.map((row, y) =>
      y >= 16 ? `${row.slice(0, 7)}${'.'.repeat(8)}${row.slice(15)}` : row,
    );
    const built = buildLevel({
      id: 't',
      name: 't',
      stages: [{ ...def, rows }],
      maxFrames: 3600,
      parFrames: 100,
    });

    const result = solveStage(stageOf(built, 0), { maxFrames: 3600 });

    expect(result.solved).toBe(true);
  });
});
