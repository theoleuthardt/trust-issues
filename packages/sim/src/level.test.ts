import { describe, expect, it } from 'vitest';
import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE, Tile, buildLevel } from './index';
import type { LevelDef } from './index';

const def = (overrides: Partial<LevelDef> = {}): LevelDef => ({
  id: 'test',
  name: 'Test',
  rows: ['.....', '.S..E', '#####'],
  traps: [],
  maxFrames: 600,
  ...overrides,
});

describe('buildLevel', () => {
  it('parses dimensions and tile kinds', () => {
    const level = buildLevel(def({ rows: ['..^..', '.S..E', '##.##'] }));

    expect(level.width).toBe(5);
    expect(level.height).toBe(3);
    expect(level.tiles[2]).toBe(Tile.Spike);
    expect(level.tiles[10]).toBe(Tile.Solid);
    expect(level.tiles[12]).toBe(Tile.Air);
  });

  it('places the player standing on the ground of the spawn tile, horizontally centred', () => {
    const level = buildLevel(def());

    expect(level.spawn.x).toBe(1 * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2);
    expect(level.spawn.y).toBe(2 * TILE_SIZE - PLAYER_HEIGHT);
  });

  it('records the exit tile', () => {
    const level = buildLevel(def());

    expect(level.exit).toEqual({ x: 4, y: 1 });
  });

  it('treats spawn and exit markers as air', () => {
    const level = buildLevel(def());

    expect(level.tiles[1 * 5 + 1]).toBe(Tile.Air);
    expect(level.tiles[1 * 5 + 4]).toBe(Tile.Air);
  });

  it('rejects ragged rows', () => {
    expect(() => buildLevel(def({ rows: ['.....', '.S.E', '#####'] }))).toThrow(/same width/);
  });

  it('rejects unknown characters', () => {
    expect(() => buildLevel(def({ rows: ['.....', '.S?.E', '#####'] }))).toThrow(/unknown tile/);
  });

  it('requires exactly one spawn and one exit', () => {
    expect(() => buildLevel(def({ rows: ['.....', '....E', '#####'] }))).toThrow(/spawn/);
    expect(() => buildLevel(def({ rows: ['.....', '.S.SE', '#####'] }))).toThrow(/spawn/);
    expect(() => buildLevel(def({ rows: ['.....', '.S...', '#####'] }))).toThrow(/exit/);
    expect(() => buildLevel(def({ rows: ['....E', '.S..E', '#####'] }))).toThrow(/exit/);
  });

  it('rejects traps that reference tiles outside the level', () => {
    const trap = {
      id: 'bad',
      trigger: { x: 0, y: 0, width: 1, height: 1 },
      action: 'add_spikes' as const,
      tiles: [[9, 0]] as const,
    };

    expect(() => buildLevel(def({ traps: [trap] }))).toThrow(/outside/);
  });

  it('rejects duplicate trap ids', () => {
    const trap = {
      id: 'dup',
      trigger: { x: 0, y: 0, width: 1, height: 1 },
      action: 'add_spikes' as const,
      tiles: [[2, 1]] as const,
    };

    expect(() => buildLevel(def({ traps: [trap, trap] }))).toThrow(/duplicate/);
  });

  it('requires a positive integer frame budget', () => {
    expect(() => buildLevel(def({ maxFrames: 0 }))).toThrow(/maxFrames/);
    expect(() => buildLevel(def({ maxFrames: 1.5 }))).toThrow(/maxFrames/);
  });
});
