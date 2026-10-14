import {
  GRAVITY,
  Input,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  MOVE_SPEED,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  SPIKE_INSET,
  TILE_SIZE,
  Tile,
} from './constants';
import type { Level, TileRect } from './level';

/** Mutable state of one run. A run spans all lives until the exit is reached. */
export interface GameState {
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  tiles: Uint8Array;
  fired: Set<string>;
  deaths: number;
  finished: boolean;
}

export interface RunResult {
  finished: boolean;
  frames: number;
  deaths: number;
}

function spawnsOnGround(level: Level): boolean {
  const below = lastTile(level.spawn.y, PLAYER_HEIGHT) + 1;
  const left = firstTile(level.spawn.x);
  const right = lastTile(level.spawn.x, PLAYER_WIDTH);
  for (let tx = left; tx <= right; tx++) {
    if (tileAt(level, level.tiles, tx, below) === Tile.Solid) return true;
  }
  return false;
}

export function createState(level: Level): GameState {
  return {
    tick: 0,
    x: level.spawn.x,
    y: level.spawn.y,
    vx: 0,
    vy: 0,
    onGround: spawnsOnGround(level),
    tiles: level.tiles.slice(),
    fired: new Set(),
    deaths: 0,
    finished: false,
  };
}

function tileAt(level: Level, tiles: Uint8Array, tx: number, ty: number): number {
  if (tx < 0 || tx >= level.width) return Tile.Solid;
  if (ty < 0 || ty >= level.height) return Tile.Air;
  return tiles[ty * level.width + tx] ?? Tile.Air;
}

function firstTile(position: number): number {
  return Math.floor(position / TILE_SIZE);
}

function lastTile(position: number, size: number): number {
  return Math.ceil((position + size) / TILE_SIZE) - 1;
}

function columnBlocked(level: Level, state: GameState, tx: number): boolean {
  const top = firstTile(state.y);
  const bottom = lastTile(state.y, PLAYER_HEIGHT);
  for (let ty = top; ty <= bottom; ty++) {
    if (tileAt(level, state.tiles, tx, ty) === Tile.Solid) return true;
  }
  return false;
}

function rowBlocked(level: Level, state: GameState, ty: number): boolean {
  const left = firstTile(state.x);
  const right = lastTile(state.x, PLAYER_WIDTH);
  for (let tx = left; tx <= right; tx++) {
    if (tileAt(level, state.tiles, tx, ty) === Tile.Solid) return true;
  }
  return false;
}

function moveX(level: Level, state: GameState): void {
  if (state.vx === 0) return;
  state.x += state.vx;
  if (state.vx > 0) {
    const column = lastTile(state.x, PLAYER_WIDTH);
    if (columnBlocked(level, state, column)) state.x = column * TILE_SIZE - PLAYER_WIDTH;
  } else {
    const column = firstTile(state.x);
    if (columnBlocked(level, state, column)) state.x = (column + 1) * TILE_SIZE;
  }
}

function moveY(level: Level, state: GameState): void {
  state.y += state.vy;
  state.onGround = false;
  if (state.vy > 0) {
    const row = lastTile(state.y, PLAYER_HEIGHT);
    if (rowBlocked(level, state, row)) {
      state.y = row * TILE_SIZE - PLAYER_HEIGHT;
      state.vy = 0;
      state.onGround = true;
    }
  } else if (state.vy < 0) {
    const row = firstTile(state.y);
    if (rowBlocked(level, state, row)) {
      state.y = (row + 1) * TILE_SIZE;
      state.vy = 0;
    }
  }
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

function fireTraps(level: Level, state: GameState): void {
  for (const trap of level.traps) {
    if (state.fired.has(trap.id) || !overlapsTiles(state, trap.trigger)) continue;
    state.fired.add(trap.id);
    for (const [tx, ty] of trap.tiles) {
      const index = ty * level.width + tx;
      if (trap.action === 'remove_tiles') state.tiles[index] = Tile.Air;
      else if (trap.action === 'add_tiles') state.tiles[index] = Tile.Solid;
      else if (state.tiles[index] === Tile.Air) state.tiles[index] = Tile.Spike;
    }
  }
}

function touchesHazard(level: Level, state: GameState): boolean {
  if (state.y > level.height * TILE_SIZE) return true;
  const top = firstTile(state.y);
  const bottom = lastTile(state.y, PLAYER_HEIGHT);
  const left = firstTile(state.x);
  const right = lastTile(state.x, PLAYER_WIDTH);
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (tileAt(level, state.tiles, tx, ty) !== Tile.Spike) continue;
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

function respawn(level: Level, state: GameState): void {
  state.x = level.spawn.x;
  state.y = level.spawn.y;
  state.vx = 0;
  state.vy = 0;
  state.onGround = spawnsOnGround(level);
  state.tiles = level.tiles.slice();
  state.fired.clear();
  state.deaths += 1;
}

/**
 * Advances the run by exactly one tick using the input mask held during that tick.
 * Nothing outside `state`, `level` and `input` may influence the result.
 */
export function step(level: Level, state: GameState, input: number): void {
  if (state.finished) return;
  state.tick += 1;

  const direction = ((input & Input.Right) !== 0 ? 1 : 0) - ((input & Input.Left) !== 0 ? 1 : 0);
  state.vx = direction * MOVE_SPEED;
  if (state.onGround && (input & Input.Jump) !== 0) state.vy = JUMP_VELOCITY;
  state.vy = Math.min(state.vy + GRAVITY, MAX_FALL_SPEED);

  moveX(level, state);
  moveY(level, state);
  fireTraps(level, state);

  if (touchesHazard(level, state)) {
    respawn(level, state);
    return;
  }

  const exit = { x: level.exit.x, y: level.exit.y, width: 1, height: 1 };
  if (overlapsTiles(state, exit)) state.finished = true;
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
