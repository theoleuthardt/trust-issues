import {
  GRAVITY,
  Input,
  JUMP_VELOCITY,
  LOW_GRAVITY,
  LOW_GRAVITY_MAX_FALL,
  MAX_FALL_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  SPIKE_INSET,
  TILE_SIZE,
  Tile,
} from './constants';
import { stageOf } from './level';
import type { Level, PlatformDef, Stage, TileRect, TrapDef } from './level';

/** Mutable state of one run. A run spans all lives until the exit is reached. */
export interface GameState {
  tick: number;
  /** Ticks since this stage was entered or the player last died in it; platforms run on it. */
  stageTick: number;
  stage: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  tiles: Uint8Array;
  fired: Set<string>;
  /** Traps that were triggered and wait for their delay, with the tick they take effect. */
  pending: Map<string, number>;
  /** Applied traps that undo themselves, with the tick they do and the tiles as they were. */
  active: Map<string, { until: number; before: number[] }>;
  deaths: number;
  finished: boolean;
}

export interface RunResult {
  finished: boolean;
  frames: number;
  deaths: number;
}

function isSolid(tile: number): boolean {
  return tile === Tile.Solid || tile === Tile.Hidden;
}

function spawnsOnGround(stage: Stage): boolean {
  const below = lastTile(stage.spawn.y, PLAYER_HEIGHT) + 1;
  const left = firstTile(stage.spawn.x);
  const right = lastTile(stage.spawn.x, PLAYER_WIDTH);
  for (let tx = left; tx <= right; tx++) {
    if (isSolid(tileAt(stage, stage.tiles, tx, below))) return true;
  }
  return false;
}

export function createState(level: Level): GameState {
  const stage = stageOf(level, 0);
  return {
    tick: 0,
    stageTick: 0,
    stage: 0,
    x: stage.spawn.x,
    y: stage.spawn.y,
    vx: 0,
    vy: 0,
    onGround: spawnsOnGround(stage),
    tiles: stage.tiles.slice(),
    fired: new Set(),
    pending: new Map(),
    active: new Map(),
    deaths: 0,
    finished: false,
  };
}

function tileAt(stage: Stage, tiles: Uint8Array, tx: number, ty: number): number {
  if (tx < 0 || tx >= stage.width) return Tile.Solid;
  if (ty < 0 || ty >= stage.height) return Tile.Air;
  return tiles[ty * stage.width + tx] ?? Tile.Air;
}

function firstTile(position: number): number {
  return Math.floor(position / TILE_SIZE);
}

function lastTile(position: number, size: number): number {
  return Math.ceil((position + size) / TILE_SIZE) - 1;
}

function columnBlocked(stage: Stage, state: GameState, tx: number): boolean {
  const top = firstTile(state.y);
  const bottom = lastTile(state.y, PLAYER_HEIGHT);
  for (let ty = top; ty <= bottom; ty++) {
    if (isSolid(tileAt(stage, state.tiles, tx, ty))) return true;
  }
  return false;
}

function rowBlocked(stage: Stage, state: GameState, ty: number): boolean {
  const left = firstTile(state.x);
  const right = lastTile(state.x, PLAYER_WIDTH);
  for (let tx = left; tx <= right; tx++) {
    if (isSolid(tileAt(stage, state.tiles, tx, ty))) return true;
  }
  return false;
}

function moveX(stage: Stage, state: GameState): void {
  if (state.vx === 0) return;
  state.x += state.vx;
  if (state.vx > 0) {
    const column = lastTile(state.x, PLAYER_WIDTH);
    if (columnBlocked(stage, state, column)) state.x = column * TILE_SIZE - PLAYER_WIDTH;
  } else {
    const column = firstTile(state.x);
    if (columnBlocked(stage, state, column)) state.x = (column + 1) * TILE_SIZE;
  }
}

/** Moves vertically against the tiles; returns where the bottom of the player was before. */
function moveY(stage: Stage, state: GameState): number {
  const previousBottom = state.y + PLAYER_HEIGHT;
  state.y += state.vy;
  state.onGround = false;
  if (state.vy > 0) {
    const row = lastTile(state.y, PLAYER_HEIGHT);
    if (rowBlocked(stage, state, row)) {
      state.y = row * TILE_SIZE - PLAYER_HEIGHT;
      state.vy = 0;
      state.onGround = true;
    }
  } else if (state.vy < 0) {
    const row = firstTile(state.y);
    if (rowBlocked(stage, state, row)) {
      state.y = (row + 1) * TILE_SIZE;
      state.vy = 0;
    }
  }
  return previousBottom;
}

function overlapsRect(state: GameState, left: number, top: number, right: number, bottom: number) {
  return (
    state.x < right &&
    state.x + PLAYER_WIDTH > left &&
    state.y < bottom &&
    state.y + PLAYER_HEIGHT > top
  );
}

function overlapsTiles(state: GameState, rect: TileRect): boolean {
  return overlapsRect(
    state,
    rect.x * TILE_SIZE,
    rect.y * TILE_SIZE,
    (rect.x + rect.width) * TILE_SIZE,
    (rect.y + rect.height) * TILE_SIZE,
  );
}

/** Which zone effects hold for the centre of the player's box at the start of a tick. */
function zonesAt(stage: Stage, state: GameState): { invert: boolean; floating: boolean } {
  const effects = { invert: false, floating: false };
  if (stage.zones.length === 0) return effects;
  const centreX = state.x + PLAYER_WIDTH / 2;
  const centreY = state.y + PLAYER_HEIGHT / 2;
  for (const zone of stage.zones) {
    const inside =
      centreX >= zone.x * TILE_SIZE &&
      centreX < (zone.x + zone.width) * TILE_SIZE &&
      centreY >= zone.y * TILE_SIZE &&
      centreY < (zone.y + zone.height) * TILE_SIZE;
    if (!inside) continue;
    if (zone.effect === 'invert') effects.invert = true;
    else effects.floating = true;
  }
  return effects;
}

/** Where a platform is at `tick`, in pixels. Pure in the tick, integer math only. */
export function platformRect(
  platform: PlatformDef,
  tick: number,
): { x: number; y: number; width: number; height: number } {
  const half = platform.period / 2;
  const phase =
    (((tick + (platform.phase ?? 0)) % platform.period) + platform.period) % platform.period;
  const progress = phase < half ? phase : platform.period - phase;
  const offset = Math.floor((platform.distance * TILE_SIZE * progress) / half);
  return {
    x: platform.x * TILE_SIZE + (platform.axis === 'x' ? offset : 0),
    y: platform.y * TILE_SIZE + (platform.axis === 'y' ? offset : 0),
    width: platform.width * TILE_SIZE,
    height: TILE_SIZE,
  };
}

function overlapsHorizontally(state: GameState, rect: { x: number; width: number }): boolean {
  return state.x < rect.x + rect.width && state.x + PLAYER_WIDTH > rect.x;
}

/** The platform the player stands on at `tick`, if there is one. */
function platformUnder(stage: Stage, state: GameState, tick: number): PlatformDef | undefined {
  for (const platform of stage.platforms) {
    const rect = platformRect(platform, tick);
    if (state.y + PLAYER_HEIGHT === rect.y && overlapsHorizontally(state, rect)) return platform;
  }
  return undefined;
}

/**
 * Lets the player stand on a platform: keeps a rider on it while they do not jump, and catches
 * a falling player whose feet were above the platform's top before this tick.
 */
function settleOnPlatforms(
  stage: Stage,
  state: GameState,
  riding: PlatformDef | undefined,
  previousBottom: number,
): void {
  if (state.onGround || state.vy < 0) return;
  if (riding) {
    const rect = platformRect(riding, state.stageTick);
    if (overlapsHorizontally(state, rect)) {
      state.y = rect.y - PLAYER_HEIGHT;
      state.vy = 0;
      state.onGround = true;
      return;
    }
  }
  for (const platform of stage.platforms) {
    const before = platformRect(platform, state.stageTick - 1);
    const now = platformRect(platform, state.stageTick);
    if (
      overlapsHorizontally(state, now) &&
      previousBottom <= before.y &&
      state.y + PLAYER_HEIGHT >= now.y
    ) {
      state.y = now.y - PLAYER_HEIGHT;
      state.vy = 0;
      state.onGround = true;
      return;
    }
  }
}

function applyTrap(stage: Stage, state: GameState, trap: TrapDef): void {
  if (trap.rearm !== undefined) {
    const before = trap.tiles.map(([tx, ty]) => state.tiles[ty * stage.width + tx] ?? Tile.Air);
    state.active.set(trap.id, { until: state.tick + trap.rearm, before });
  }
  for (const [tx, ty] of trap.tiles) {
    const index = ty * stage.width + tx;
    if (trap.action === 'remove_tiles') state.tiles[index] = Tile.Air;
    else if (trap.action === 'add_tiles') state.tiles[index] = Tile.Solid;
    else if (state.tiles[index] === Tile.Air) state.tiles[index] = Tile.Spike;
  }
}

function fireTraps(stage: Stage, state: GameState): void {
  for (const trap of stage.traps) {
    const active = state.active.get(trap.id);
    if (active && state.tick >= active.until) {
      trap.tiles.forEach(([tx, ty], i) => {
        state.tiles[ty * stage.width + tx] = active.before[i] ?? Tile.Air;
      });
      state.active.delete(trap.id);
      state.fired.delete(trap.id);
    }

    const due = state.pending.get(trap.id);
    if (due !== undefined && state.tick >= due) {
      state.pending.delete(trap.id);
      applyTrap(stage, state, trap);
    }

    if (state.fired.has(trap.id) || !overlapsTiles(state, trap.trigger)) continue;
    state.fired.add(trap.id);
    if (trap.delay !== undefined && trap.delay > 0) {
      state.pending.set(trap.id, state.tick + trap.delay);
    } else {
      applyTrap(stage, state, trap);
    }
  }
}

function touchesHazard(stage: Stage, state: GameState): boolean {
  if (state.y > stage.height * TILE_SIZE) return true;
  const top = firstTile(state.y);
  const bottom = lastTile(state.y, PLAYER_HEIGHT);
  const left = firstTile(state.x);
  const right = lastTile(state.x, PLAYER_WIDTH);
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      const tile = tileAt(stage, state.tiles, tx, ty);
      if (tile === Tile.FakeExit) return true;
      if (tile !== Tile.Spike) continue;
      const inside = overlapsRect(
        state,
        tx * TILE_SIZE + SPIKE_INSET,
        ty * TILE_SIZE + SPIKE_INSET,
        (tx + 1) * TILE_SIZE - SPIKE_INSET,
        (ty + 1) * TILE_SIZE - SPIKE_INSET,
      );
      if (inside) return true;
    }
  }
  return false;
}

function enterStage(stage: Stage, state: GameState): void {
  state.x = stage.spawn.x;
  state.y = stage.spawn.y;
  state.vx = 0;
  state.vy = 0;
  state.onGround = spawnsOnGround(stage);
  state.tiles = stage.tiles.slice();
  state.stageTick = 0;
  state.fired.clear();
  state.pending.clear();
  state.active.clear();
}

/**
 * Advances the run by exactly one tick using the input mask held during that tick.
 * Nothing outside `state`, `level` and `input` may influence the result.
 */
export function step(level: Level, state: GameState, input: number): void {
  if (state.finished) return;
  state.tick += 1;
  state.stageTick += 1;
  const stage = stageOf(level, state.stage);

  const zones = zonesAt(stage, state);
  const direction =
    (((input & Input.Right) !== 0 ? 1 : 0) - ((input & Input.Left) !== 0 ? 1 : 0)) *
    (zones.invert ? -1 : 1);
  state.vx = direction * MOVE_SPEED;
  if (state.onGround && (input & Input.Jump) !== 0) state.vy = JUMP_VELOCITY;
  state.vy = zones.floating
    ? Math.min(state.vy + LOW_GRAVITY, LOW_GRAVITY_MAX_FALL)
    : Math.min(state.vy + GRAVITY, MAX_FALL_SPEED);

  const riding = state.onGround ? platformUnder(stage, state, state.stageTick - 1) : undefined;
  if (riding) {
    const was = platformRect(riding, state.stageTick - 1);
    const now = platformRect(riding, state.stageTick);
    state.x += now.x - was.x;
    state.y += now.y - was.y;
  }

  moveX(stage, state);
  const previousBottom = moveY(stage, state);
  if (stage.platforms.length > 0) settleOnPlatforms(stage, state, riding, previousBottom);
  fireTraps(stage, state);

  if (touchesHazard(stage, state)) {
    enterStage(stage, state);
    state.deaths += 1;
    return;
  }

  const exit = { x: stage.exit.x, y: stage.exit.y, width: 1, height: 1 };
  if (!overlapsTiles(state, exit)) return;
  if (state.stage === level.stages.length - 1) {
    state.finished = true;
    return;
  }
  state.stage += 1;
  enterStage(stageOf(level, state.stage), state);
}

/** Plays a decoded input list from the level start and reports how the run ended. */
export function simulate(level: Level, inputs: readonly number[]): RunResult {
  const state = createState(level);
  for (const input of inputs) {
    if (state.finished) break;
    step(level, state, input);
  }
  return { finished: state.finished, frames: state.tick, deaths: state.deaths };
}
