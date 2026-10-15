import { PLAYER_HEIGHT, PLAYER_WIDTH, SIM_VERSION, TILE_SIZE, Tile } from './constants';

export type TrapAction = 'remove_tiles' | 'add_tiles' | 'add_spikes';

/** A rectangle in tile units. */
export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Most ticks a trap may wait between its trigger and its effect: ten seconds. */
export const MAX_TRAP_DELAY = 600;
/** Most ticks an effect may last before the trap re-arms: one minute. */
export const MAX_TRAP_REARM = 3600;

/**
 * A trap: when the player overlaps `trigger`, `action` is applied to `tiles`, after `delay`
 * ticks if one is given. With `rearm`, the effect is undone that many ticks after it was
 * applied and the trap can be triggered again; without it the trap is one-shot. A death
 * cancels everything and re-arms every trap of the stage.
 */
export interface TrapDef {
  id: string;
  trigger: TileRect;
  action: TrapAction;
  tiles: readonly (readonly [number, number])[];
  delay?: number;
  rearm?: number;
}

/**
 * Authoring format of one stage. `rows` use `.` air, `#` solid, `^` spike, `h` hidden solid
 * (collides, drawn as air), `f` fake solid (drawn solid, passable), `X` fake exit (drawn as
 * the exit, kills), `S` spawn (player stands on the tile below it) and `E` exit.
 */
export interface StageDef {
  rows: readonly string[];
  traps: readonly TrapDef[];
}

/** What an author writes: a level without its par time, which comes from the solver. */
export type LevelContent = Omit<LevelDef, 'parFrames'>;

/** Authoring format of a level: a chapter of one to `MAX_STAGES` stages played in order. */
export interface LevelDef {
  id: string;
  name: string;
  stages: readonly StageDef[];
  maxFrames: number;
  /** Reference time in frames that scores the par score; equals the recorded reference solution. */
  parFrames: number;
  /** Defaults to 1; raise it with every change that alters what an existing replay does. */
  revision?: number;
}

/** Parsed, validated stage. `tiles` is the initial row-major tile grid. */
export interface Stage {
  width: number;
  height: number;
  tiles: Uint8Array;
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  traps: readonly TrapDef[];
}

/** Parsed, validated level ready for simulation. The run budget `maxFrames` spans all stages. */
export interface Level {
  id: string;
  name: string;
  stages: readonly Stage[];
  maxFrames: number;
  parFrames: number;
  /** Counts the changes to this level that alter what an existing replay does. */
  revision: number;
}

/** The versions a replay was recorded with; the verifier only accepts the current ones. */
export interface RunVersions {
  simVersion: number;
  levelRevision: number;
}

/** The versions of the simulation and of `level` that a run played right now is recorded with. */
export function runVersions(level: Level): RunVersions {
  return { simVersion: SIM_VERSION, levelRevision: level.revision };
}

/** Most stages one level may have. */
export const MAX_STAGES = 4;

const TILE_CHARS: Record<string, number> = {
  '.': Tile.Air,
  '#': Tile.Solid,
  '^': Tile.Spike,
  h: Tile.Hidden,
  f: Tile.Fake,
  X: Tile.FakeExit,
  S: Tile.Air,
  E: Tile.Air,
};

function buildStage(levelId: string, index: number, def: StageDef): Stage {
  const where = `level ${levelId} stage ${index + 1}`;
  const firstRow = def.rows[0];
  if (firstRow === undefined || firstRow.length === 0) {
    throw new Error(`${where}: no rows`);
  }

  const width = firstRow.length;
  const height = def.rows.length;
  const tiles = new Uint8Array(width * height);
  let spawn: { x: number; y: number } | undefined;
  let exit: { x: number; y: number } | undefined;

  def.rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`${where}: all rows must have the same width`);
    }
    for (let x = 0; x < width; x++) {
      const char = row.charAt(x);
      const tile = TILE_CHARS[char];
      if (tile === undefined) {
        throw new Error(`${where}: unknown tile '${char}' at ${x},${y}`);
      }
      tiles[y * width + x] = tile;
      if (char === 'S') {
        if (spawn) throw new Error(`${where}: exactly one spawn required`);
        spawn = {
          x: x * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2,
          y: (y + 1) * TILE_SIZE - PLAYER_HEIGHT,
        };
      } else if (char === 'E') {
        if (exit) throw new Error(`${where}: exactly one exit required`);
        exit = { x, y };
      }
    }
  });

  if (!spawn) throw new Error(`${where}: exactly one spawn required`);
  if (!exit) throw new Error(`${where}: exactly one exit required`);

  const seen = new Set<string>();
  for (const trap of def.traps) {
    if (seen.has(trap.id)) throw new Error(`${where}: duplicate trap id ${trap.id}`);
    seen.add(trap.id);
    if (trap.delay !== undefined) {
      if (!Number.isInteger(trap.delay) || trap.delay < 0 || trap.delay > MAX_TRAP_DELAY) {
        throw new Error(`${where}: trap ${trap.id} delay must be 0 to ${MAX_TRAP_DELAY} ticks`);
      }
    }
    if (trap.rearm !== undefined) {
      if (!Number.isInteger(trap.rearm) || trap.rearm < 1 || trap.rearm > MAX_TRAP_REARM) {
        throw new Error(`${where}: trap ${trap.id} rearm must be 1 to ${MAX_TRAP_REARM} ticks`);
      }
    }
    for (const [x, y] of trap.tiles) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        throw new Error(`${where}: trap ${trap.id} targets a tile outside the stage`);
      }
    }
  }

  return { width, height, tiles, spawn, exit, traps: def.traps };
}

/** Parses and validates a level definition; throws on any structural error. */
export function buildLevel(def: LevelDef): Level {
  if (!Number.isInteger(def.maxFrames) || def.maxFrames <= 0) {
    throw new Error(`level ${def.id}: maxFrames must be a positive integer`);
  }
  if (!Number.isInteger(def.parFrames) || def.parFrames <= 0 || def.parFrames > def.maxFrames) {
    throw new Error(`level ${def.id}: parFrames must be a positive integer within maxFrames`);
  }
  const revision = def.revision ?? 1;
  if (!Number.isInteger(revision) || revision <= 0) {
    throw new Error(`level ${def.id}: revision must be a positive integer`);
  }
  if (!Array.isArray(def.stages) || def.stages.length < 1) {
    throw new Error(`level ${def.id}: at least one stage required`);
  }
  if (def.stages.length > MAX_STAGES) {
    throw new Error(`level ${def.id}: at most ${MAX_STAGES} stages allowed`);
  }

  const stages = def.stages.map((stage, index) => buildStage(def.id, index, stage));
  const first = stages[0] as Stage;
  stages.forEach((stage, index) => {
    if (stage.width !== first.width || stage.height !== first.height) {
      throw new Error(`level ${def.id} stage ${index + 1}: size differs from stage 1`);
    }
  });

  return {
    id: def.id,
    name: def.name,
    stages,
    maxFrames: def.maxFrames,
    parFrames: def.parFrames,
    revision,
  };
}

/** Returns the stage at `index`; throws when the level has no such stage. */
export function stageOf(level: Level, index: number): Stage {
  const stage = level.stages[index];
  if (!stage) throw new Error(`level ${level.id} has no stage ${index + 1}`);
  return stage;
}
