import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  MAX_STAGES,
  SIM_VERSION,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
  Tile,
  buildLevel,
  runVersions,
  stageOf,
} from './index';
import type { LevelDef, StageDef } from './index';

const stageDef = (overrides: Partial<StageDef> = {}): StageDef => ({
  rows: ['.....', '.S..E', '#####'],
  traps: [],
  ...overrides,
});

const def = (overrides: Partial<LevelDef> = {}): LevelDef => ({
  id: 'test',
  name: 'Test',
  stages: [stageDef()],
  maxFrames: 600,
  parFrames: 120,
  ...overrides,
});

const withRows = (rows: string[]) => def({ stages: [stageDef({ rows })] });

describe('buildLevel', () => {
  it('parses dimensions and tile kinds of a stage', () => {
    const stage = stageOf(buildLevel(withRows(['..^..', '.S..E', '##.##'])), 0);

    expect(stage.width).toBe(5);
    expect(stage.height).toBe(3);
    expect(stage.tiles[2]).toBe(Tile.Spike);
    expect(stage.tiles[10]).toBe(Tile.Solid);
    expect(stage.tiles[12]).toBe(Tile.Air);
  });

  it('places the player standing on the ground of the spawn tile, horizontally centred', () => {
    const stage = stageOf(buildLevel(def()), 0);

    expect(stage.spawn.x).toBe(1 * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2);
    expect(stage.spawn.y).toBe(2 * TILE_SIZE - PLAYER_HEIGHT);
  });

  it('records the exit tile', () => {
    expect(stageOf(buildLevel(def()), 0).exit).toEqual({ x: 4, y: 1 });
  });

  it('treats spawn and exit markers as air', () => {
    const stage = stageOf(buildLevel(def()), 0);

    expect(stage.tiles[1 * 5 + 1]).toBe(Tile.Air);
    expect(stage.tiles[1 * 5 + 4]).toBe(Tile.Air);
  });

  it('rejects ragged rows', () => {
    expect(() => buildLevel(withRows(['.....', '.S.E', '#####']))).toThrow(/same width/);
  });

  it('rejects unknown characters', () => {
    expect(() => buildLevel(withRows(['.....', '.S?.E', '#####']))).toThrow(/unknown tile/);
  });

  it('requires exactly one spawn and one exit per stage', () => {
    expect(() => buildLevel(withRows(['.....', '....E', '#####']))).toThrow(/spawn/);
    expect(() => buildLevel(withRows(['.....', '.S.SE', '#####']))).toThrow(/spawn/);
    expect(() => buildLevel(withRows(['.....', '.S...', '#####']))).toThrow(/exit/);
    expect(() => buildLevel(withRows(['....E', '.S..E', '#####']))).toThrow(/exit/);
  });

  it('rejects traps that reference tiles outside the stage', () => {
    const trap = {
      id: 'bad',
      trigger: { x: 0, y: 0, width: 1, height: 1 },
      action: 'add_spikes' as const,
      tiles: [[9, 0]] as const,
    };

    expect(() => buildLevel(def({ stages: [stageDef({ traps: [trap] })] }))).toThrow(/outside/);
  });

  it('rejects duplicate trap ids within a stage', () => {
    const trap = {
      id: 'dup',
      trigger: { x: 0, y: 0, width: 1, height: 1 },
      action: 'add_spikes' as const,
      tiles: [[2, 1]] as const,
    };

    expect(() => buildLevel(def({ stages: [stageDef({ traps: [trap, trap] })] }))).toThrow(
      /duplicate/,
    );
  });

  it('requires a positive integer par time', () => {
    expect(() => buildLevel(def({ parFrames: 0 }))).toThrow(/parFrames/);
    expect(() => buildLevel(def({ parFrames: 2.5 }))).toThrow(/parFrames/);
  });

  it('requires the par time to fit into the frame budget', () => {
    expect(() => buildLevel(def({ parFrames: 601 }))).toThrow(/parFrames/);
  });

  it('keeps the par time on the built level', () => {
    expect(buildLevel(def()).parFrames).toBe(120);
  });

  it('requires a positive integer frame budget', () => {
    expect(() => buildLevel(def({ maxFrames: 0 }))).toThrow(/maxFrames/);
    expect(() => buildLevel(def({ maxFrames: 1.5 }))).toThrow(/maxFrames/);
  });
});

describe('stages', () => {
  it('builds every stage in order', () => {
    const level = buildLevel(
      def({
        stages: [stageDef(), stageDef({ rows: ['.....', '..S.E', '#####'] })],
      }),
    );

    expect(level.stages).toHaveLength(2);
    expect(stageOf(level, 1).spawn.x).toBe(2 * TILE_SIZE + 4);
  });

  it('names the problem when a level is still written in the old single-stage format', () => {
    const legacy = {
      id: 'old',
      name: 'Old',
      rows: ['.S.E', '####'],
      traps: [],
      maxFrames: 100,
      parFrames: 50,
    };

    expect(() => buildLevel(legacy as unknown as LevelDef)).toThrow(/stage/);
  });

  it('requires at least one stage', () => {
    expect(() => buildLevel(def({ stages: [] }))).toThrow(/stage/);
  });

  it(`allows at most ${MAX_STAGES} stages`, () => {
    const stages = Array.from({ length: MAX_STAGES + 1 }, () => stageDef());

    expect(() => buildLevel(def({ stages }))).toThrow(/stages/);
  });

  it('requires every stage to have the size of the first one', () => {
    const stages = [stageDef(), stageDef({ rows: ['......', '.S...E', '######'] })];

    expect(() => buildLevel(def({ stages }))).toThrow(/size/);
  });

  it('names the stage in validation errors', () => {
    const stages = [stageDef(), stageDef({ rows: ['.....', '....E', '#####'] })];

    expect(() => buildLevel(def({ stages }))).toThrow(/stage 2/);
  });

  it('throws for a stage index that does not exist', () => {
    expect(() => stageOf(buildLevel(def()), 3)).toThrow(/stage/);
  });
});

describe('versions', () => {
  it('has a positive integer simulation version', () => {
    expect(Number.isInteger(SIM_VERSION)).toBe(true);
    expect(SIM_VERSION).toBeGreaterThan(0);
  });

  it('gives a level revision 1 unless its definition says otherwise', () => {
    expect(buildLevel(def()).revision).toBe(1);
    expect(buildLevel(def({ revision: 3 })).revision).toBe(3);
  });

  it.each([0, -1, 1.5])('rejects the level revision %s', (revision) => {
    expect(() => buildLevel(def({ revision }))).toThrow(/revision/);
  });

  it('names the versions a run of a level is recorded with', () => {
    expect(runVersions(buildLevel(def({ revision: 3 })))).toEqual({
      simVersion: SIM_VERSION,
      levelRevision: 3,
    });
  });

  it('gives every shipped level a revision', () => {
    for (const level of LEVELS) expect(level.revision).toBeGreaterThanOrEqual(1);
  });
});
