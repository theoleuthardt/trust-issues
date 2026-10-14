import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE, Tile } from './constants';

export type TrapAction = 'remove_tiles' | 'add_tiles' | 'add_spikes';

/** A rectangle in tile units. */
export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A one-shot trap: when the player overlaps `trigger`, `action` is applied to `tiles`.
 * Traps re-arm when the player dies.
 */
export interface TrapDef {
  id: string;
  trigger: TileRect;
  action: TrapAction;
  tiles: readonly (readonly [number, number])[];
}

/**
 * Authoring format of a level. `rows` use `.` air, `#` solid, `^` spike,
 * `S` spawn (player stands on the tile below it) and `E` exit.
 */
export interface LevelDef {
  id: string;
  name: string;
  rows: readonly string[];
  traps: readonly TrapDef[];
  maxFrames: number;
}

/** Parsed, validated level ready for simulation. `tiles` is the initial row-major tile grid. */
export interface Level {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: Uint8Array;
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  traps: readonly TrapDef[];
  maxFrames: number;
}

const TILE_CHARS: Record<string, number> = {
  '.': Tile.Air,
  '#': Tile.Solid,
  '^': Tile.Spike,
  S: Tile.Air,
  E: Tile.Air,
};

/** Parses and validates a level definition; throws on any structural error. */
export function buildLevel(def: LevelDef): Level {
  const firstRow = def.rows[0];
  if (firstRow === undefined || firstRow.length === 0) {
    throw new Error(`level ${def.id}: no rows`);
  }
  if (!Number.isInteger(def.maxFrames) || def.maxFrames <= 0) {
    throw new Error(`level ${def.id}: maxFrames must be a positive integer`);
  }

  const width = firstRow.length;
  const height = def.rows.length;
  const tiles = new Uint8Array(width * height);
  let spawn: { x: number; y: number } | undefined;
  let exit: { x: number; y: number } | undefined;

  def.rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`level ${def.id}: all rows must have the same width`);
    }
    for (let x = 0; x < width; x++) {
      const char = row.charAt(x);
      const tile = TILE_CHARS[char];
      if (tile === undefined) {
        throw new Error(`level ${def.id}: unknown tile '${char}' at ${x},${y}`);
      }
      tiles[y * width + x] = tile;
      if (char === 'S') {
        if (spawn) throw new Error(`level ${def.id}: exactly one spawn required`);
        spawn = {
          x: x * TILE_SIZE + (TILE_SIZE - PLAYER_WIDTH) / 2,
          y: (y + 1) * TILE_SIZE - PLAYER_HEIGHT,
        };
      } else if (char === 'E') {
        if (exit) throw new Error(`level ${def.id}: exactly one exit required`);
        exit = { x, y };
      }
    }
  });

  if (!spawn) throw new Error(`level ${def.id}: exactly one spawn required`);
  if (!exit) throw new Error(`level ${def.id}: exactly one exit required`);

  const seen = new Set<string>();
  for (const trap of def.traps) {
    if (seen.has(trap.id)) throw new Error(`level ${def.id}: duplicate trap id ${trap.id}`);
    seen.add(trap.id);
    for (const [x, y] of trap.tiles) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        throw new Error(`level ${def.id}: trap ${trap.id} targets a tile outside the level`);
      }
    }
  }

  return {
    id: def.id,
    name: def.name,
    width,
    height,
    tiles,
    spawn,
    exit,
    traps: def.traps,
    maxFrames: def.maxFrames,
  };
}
