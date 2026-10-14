import { Input, MOVE_SPEED, PLAYER_WIDTH, TILE_SIZE } from './constants';
import type { Level, Stage } from './level';
import { createState, step } from './simulation';
import type { GameState } from './simulation';

export interface SolveOptions {
  /** Longest run in ticks the search may consider. */
  maxFrames?: number;
  /** Most nodes the search may expand before giving up. */
  maxExpansions?: number;
}

export type SolveResult =
  | { solved: true; inputs: number[]; expansions: number }
  | { solved: false; reason: 'exhausted' | 'budget'; expansions: number };

const MASKS = [
  Input.Right,
  Input.Left,
  Input.Right | Input.Jump,
  Input.Left | Input.Jump,
  Input.Jump,
  0,
];
const COUNTS = [1, 2, 5, 12];
const DEFAULT_MAX_FRAMES = 1800;
const DEFAULT_MAX_EXPANSIONS = 400_000;

interface Node {
  state: GameState;
  g: number;
  f: number;
  parent: Node | undefined;
  mask: number;
}

class MinHeap {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    const items = this.items;
    items.push(node);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.less(items[parent] as Node, items[index] as Node)) break;
      [items[parent], items[index]] = [items[index] as Node, items[parent] as Node];
      index = parent;
    }
  }

  pop(): Node | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined) return top;
    if (items.length === 0) return top;
    items[0] = last;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < items.length && this.less(items[left] as Node, items[smallest] as Node)) {
        smallest = left;
      }
      if (right < items.length && this.less(items[right] as Node, items[smallest] as Node)) {
        smallest = right;
      }
      if (smallest === index) break;
      [items[smallest], items[index]] = [items[index] as Node, items[smallest] as Node];
      index = smallest;
    }
    return top;
  }

  private less(a: Node, b: Node): boolean {
    return a.f < b.f || (a.f === b.f && a.g > b.g);
  }
}

function clone(state: GameState): GameState {
  return { ...state, tiles: state.tiles.slice(), fired: new Set(state.fired) };
}

function keyOf(state: GameState): string {
  const fired = state.fired.size === 0 ? '' : Array.from(state.fired).sort().join('|');
  return `${state.x},${state.y},${state.vy},${state.onGround ? 1 : 0},${fired}`;
}

/**
 * Searches the shortest zero-death input list that takes the player from the spawn of a stage
 * to its exit. The search is A* over short input macros (hold a direction, optionally jump,
 * for a few ticks); the heuristic is the horizontal distance to the exit at full speed.
 */
export function solveStage(stage: Stage, options: SolveOptions = {}): SolveResult {
  const maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES;
  const maxExpansions = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;
  const level: Level = {
    id: 'solver',
    name: 'solver',
    stages: [stage],
    maxFrames,
    parFrames: 1,
  };
  const exitCentre = stage.exit.x * TILE_SIZE + TILE_SIZE / 2;
  const slack = (TILE_SIZE + PLAYER_WIDTH) / 2;
  const heuristic = (state: GameState): number => {
    const distance = Math.abs(exitCentre - (state.x + PLAYER_WIDTH / 2)) - slack;
    return distance <= 0 ? 0 : Math.ceil(distance / MOVE_SPEED);
  };

  const start = createState(level);
  const open = new MinHeap();
  const best = new Map<string, number>();
  open.push({ state: start, g: 0, f: heuristic(start), parent: undefined, mask: 0 });
  best.set(keyOf(start), 0);

  let expansions = 0;
  for (let node = open.pop(); node !== undefined; node = open.pop()) {
    if (node.state.finished) return { solved: true, inputs: reconstruct(node), expansions };
    if (!node.state.finished && (best.get(keyOf(node.state)) ?? Infinity) < node.g) continue;
    if (++expansions > maxExpansions) return { solved: false, reason: 'budget', expansions };

    for (const mask of MASKS) {
      let state = clone(node.state);
      for (const count of COUNTS) {
        const previous = state;
        state = clone(previous);
        for (let tick = 0; tick < count && !state.finished && state.deaths === 0; tick++) {
          step(level, state, mask);
        }
        if (state.deaths > 0 || state.tick > maxFrames) break;
        if (state.tick === previous.tick) break;

        const key = state.finished ? undefined : keyOf(state);
        const known = key === undefined ? undefined : best.get(key);
        if (known !== undefined && known <= state.tick) continue;
        if (key !== undefined) best.set(key, state.tick);
        open.push({
          state,
          g: state.tick,
          f: state.tick + (state.finished ? 0 : heuristic(state)),
          parent: node,
          mask,
        });
      }
    }
  }
  return { solved: false, reason: 'exhausted', expansions };
}

function reconstruct(last: Node): number[] {
  const segments: { mask: number; ticks: number }[] = [];
  for (let node: Node | undefined = last; node?.parent; node = node.parent) {
    segments.push({ mask: node.mask, ticks: node.state.tick - node.parent.state.tick });
  }
  return segments.reverse().flatMap(({ mask, ticks }) => new Array<number>(ticks).fill(mask));
}
