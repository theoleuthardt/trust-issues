import type { PlatformDef, StageDef, TileRect, TrapAction, TrapDef, ZoneDef } from '../level';

/** Stages are authored on the canvas of the game: 32 x 18 tiles. */
export const STAGE_WIDTH = 32;
export const STAGE_HEIGHT = 18;

const FLOOR_ROW = 15;
const GROUND_ROWS = [16, 17] as const;
const TRIGGER_HEIGHT = 3;
const TRIGGER_WIDTH = 2;

interface Canvas {
  cells: string[][];
  traps: TrapDef[];
  zones: ZoneDef[];
  platforms: PlatformDef[];
}

/** One building block of a stage, applied in order by `stage`. */
export type Feature = (canvas: Canvas) => void;

function put(canvas: Canvas, x: number, y: number, char: string): void {
  const row = canvas.cells[y];
  if (!row || x < 0 || x >= STAGE_WIDTH) {
    throw new Error(`feature tile ${x},${y} is outside the stage`);
  }
  row[x] = char;
}

function addTrap(
  canvas: Canvas,
  action: TrapAction,
  at: number | TileRect,
  tiles: [number, number][],
): void {
  for (const [x, y] of tiles) {
    if (x < 0 || x >= STAGE_WIDTH || y < 0 || y >= STAGE_HEIGHT) {
      throw new Error(`trap tile ${x},${y} is outside the stage`);
    }
  }
  canvas.traps.push({
    id: `t${canvas.traps.length + 1}`,
    trigger:
      typeof at === 'number'
        ? {
            x: at,
            y: FLOOR_ROW - TRIGGER_HEIGHT + 1,
            width: TRIGGER_WIDTH,
            height: TRIGGER_HEIGHT,
          }
        : at,
    action,
    tiles,
  });
}

const columns = (x: number, width: number) => Array.from({ length: width }, (_, i) => x + i);

/** Permanent hole in the floor, `width` tiles wide. */
export const gap =
  (x: number, width = 1): Feature =>
  (canvas) => {
    for (const column of columns(x, width)) {
      for (const row of GROUND_ROWS) put(canvas, column, row, '.');
    }
  };

/** Permanent spikes standing on the floor (or at row `y`). */
export const spikes =
  (x: number, width = 1, y = FLOOR_ROW): Feature =>
  (canvas) => {
    for (const column of columns(x, width)) put(canvas, column, y, '^');
  };

/** Permanent wall of `height` tiles standing on the floor. */
export const wall =
  (x: number, height: number): Feature =>
  (canvas) => {
    for (let i = 0; i < height; i++) put(canvas, x, FLOOR_ROW - i, '#');
  };

/** Permanent free-floating solid rectangle; `y` is its top row. */
export const block =
  (x: number, y: number, width = 1, height = 1): Feature =>
  (canvas) => {
    for (const column of columns(x, width)) {
      for (let row = y; row < y + height; row++) put(canvas, column, row, '#');
    }
  };

/** Solid tiles that are drawn as air: an invisible wall or floor. `y` is the top row. */
export const hidden =
  (x: number, y: number, width = 1, height = 1): Feature =>
  (canvas) => {
    for (const column of columns(x, width)) {
      for (let row = y; row < y + height; row++) put(canvas, column, row, 'h');
    }
  };

/** Tiles that are drawn solid but can be walked through or fallen through. `y` is the top row. */
export const fake =
  (x: number, y: number, width = 1, height = 1): Feature =>
  (canvas) => {
    for (const column of columns(x, width)) {
      for (let row = y; row < y + height; row++) put(canvas, column, row, 'f');
    }
  };

/** A tile that is drawn as the exit and kills whoever touches it. */
export const fakeExit =
  (x: number, y = FLOOR_ROW): Feature =>
  (canvas) => {
    put(canvas, x, y, 'X');
  };

/**
 * Gives the traps that `feature` adds a delay (ticks between trigger and effect) and/or a
 * rearm time (ticks until the effect is undone and the trap can fire again).
 */
export const timed =
  (feature: Feature, timing: { delay?: number; rearm?: number }): Feature =>
  (canvas) => {
    const first = canvas.traps.length;
    feature(canvas);
    for (let index = first; index < canvas.traps.length; index++) {
      const original = canvas.traps[index];
      if (original) canvas.traps[index] = { ...original, ...timing };
    }
  };

/**
 * A platform of `width` tiles with its left end at (`x`, `y`) that travels `distance` tiles
 * along `axis` and back every `period` ticks; the player can ride it.
 */
export const movingPlatform =
  (
    x: number,
    y: number,
    width: number,
    motion: { axis: 'x' | 'y'; distance: number; period: number; phase?: number },
  ): Feature =>
  (canvas) => {
    canvas.platforms.push({ x, y, width, ...motion });
  };

/** An area, in tiles, where left and right are swapped. */
export const invertZone =
  (x: number, y: number, width: number, height: number): Feature =>
  (canvas) => {
    canvas.zones.push({ x, y, width, height, effect: 'invert' });
  };

/** An area, in tiles, where gravity is low and jumps carry far. */
export const floatZone =
  (x: number, y: number, width: number, height: number): Feature =>
  (canvas) => {
    canvas.zones.push({ x, y, width, height, effect: 'low_gravity' });
  };

/** A spike appears at column `x` once the player reaches column `at`. */
export const pop =
  (at: number, x: number, width = 1, y = FLOOR_ROW): Feature =>
  (canvas) => {
    addTrap(
      canvas,
      'add_spikes',
      at,
      columns(x, width).map((column) => [column, y]),
    );
  };

/** The floor under columns `x`..`x + width - 1` vanishes once the player reaches `at`. */
export const drop =
  (at: number, x: number, width = 1): Feature =>
  (canvas) => {
    addTrap(
      canvas,
      'remove_tiles',
      at,
      columns(x, width).flatMap((column) =>
        GROUND_ROWS.map((row): [number, number] => [column, row]),
      ),
    );
  };

/** A wall of `height` tiles rises at column `x` once the player reaches `at`. */
export const rise =
  (at: number, x: number, height: number): Feature =>
  (canvas) => {
    addTrap(
      canvas,
      'add_tiles',
      at,
      Array.from({ length: height }, (_, i): [number, number] => [x, FLOOR_ROW - height + 1 + i]),
    );
  };

/**
 * A trap with an explicit trigger rectangle (in tiles), for traps that belong to a platform
 * rather than to the floor.
 */
export const trap =
  (action: TrapAction, trigger: TileRect, tiles: [number, number][]): Feature =>
  (canvas) => {
    addTrap(canvas, action, trigger, tiles);
  };

/** A spike appears in mid-air at (`x`, `y`) once the player reaches `at`. */
export const sky =
  (at: number, x: number, y: number): Feature =>
  (canvas) => {
    addTrap(canvas, 'add_spikes', at, [[x, y]]);
  };

/** Solid tiles of a platform vanish once the player reaches `at`. */
export const vanish =
  (at: number, x: number, y: number, width = 1): Feature =>
  (canvas) => {
    addTrap(
      canvas,
      'remove_tiles',
      at,
      columns(x, width).map((column) => [column, y]),
    );
  };

/** Solid tiles appear at column `x` from row `y` down `height` tiles once the player reaches `at`. */
export const seal =
  (at: number, x: number, y: number, height = 1): Feature =>
  (canvas) => {
    addTrap(
      canvas,
      'add_tiles',
      at,
      Array.from({ length: height }, (_, i) => [x, y + i]),
    );
  };

export interface StageOptions {
  /** Column the player starts in; the floor row below it must stay solid. */
  start?: number;
  /** Column of the exit. */
  end?: number;
  /** Row of the exit, the floor row by default. */
  endY?: number;
}

/** Builds a stage: a two-row floor, the given features, a spawn and an exit. */
export function stage(features: readonly Feature[], options: StageOptions = {}): StageDef {
  const { start = 1, end = 30, endY = FLOOR_ROW } = options;
  const canvas: Canvas = {
    cells: Array.from({ length: STAGE_HEIGHT }, (_, y) =>
      Array.from({ length: STAGE_WIDTH }, () =>
        (GROUND_ROWS as readonly number[]).includes(y) ? '#' : '.',
      ),
    ),
    traps: [],
    zones: [],
    platforms: [],
  };
  for (const feature of features) feature(canvas);
  put(canvas, start, FLOOR_ROW, 'S');
  put(canvas, end, endY, 'E');
  const rows = canvas.cells.map((row) => row.join(''));
  return {
    rows,
    traps: canvas.traps,
    ...(canvas.zones.length > 0 ? { zones: canvas.zones } : {}),
    ...(canvas.platforms.length > 0 ? { platforms: canvas.platforms } : {}),
  };
}
