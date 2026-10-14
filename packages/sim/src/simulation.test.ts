import { describe, expect, it } from 'vitest';
import {
  GRAVITY,
  Input,
  JUMP_VELOCITY,
  MOVE_SPEED,
  TILE_SIZE,
  Tile,
  buildLevel,
  createState,
  simulate,
  stageOf,
  step,
} from './index';
import type { LevelDef, TrapDef } from './index';

const level = (rows: string[], traps: TrapDef[] = []) =>
  buildLevel({
    id: 't',
    name: 't',
    stages: [{ rows, traps }],
    maxFrames: 3600,
    parFrames: 100,
  } satisfies LevelDef);

const multiStage = (stages: { rows: string[]; traps?: TrapDef[] }[]) =>
  buildLevel({
    id: 't',
    name: 't',
    stages: stages.map(({ rows, traps }) => ({ rows, traps: traps ?? [] })),
    maxFrames: 3600,
    parFrames: 100,
  } satisfies LevelDef);

const FLAT = ['..........', '.S......E.', '##########'];

const run = (
  lvl: ReturnType<typeof level>,
  state: ReturnType<typeof createState>,
  mask: number,
  frames: number,
) => {
  for (let i = 0; i < frames; i++) step(lvl, state, mask);
};

describe('step', () => {
  it('keeps an idle player standing on the ground', () => {
    const lvl = level(FLAT);
    const state = createState(lvl);

    run(lvl, state, 0, 30);

    expect(state.y).toBe(stageOf(lvl, 0).spawn.y);
    expect(state.x).toBe(stageOf(lvl, 0).spawn.x);
    expect(state.onGround).toBe(true);
    expect(state.tick).toBe(30);
  });

  it('moves horizontally by MOVE_SPEED per tick', () => {
    const lvl = level(FLAT);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 10);

    expect(state.x).toBe(stageOf(lvl, 0).spawn.x + 10 * MOVE_SPEED);
  });

  it('cancels out when left and right are held together', () => {
    const lvl = level(FLAT);
    const state = createState(lvl);

    run(lvl, state, Input.Left | Input.Right, 10);

    expect(state.x).toBe(stageOf(lvl, 0).spawn.x);
  });

  it('stops at the left level border', () => {
    const lvl = level(FLAT);
    const state = createState(lvl);

    run(lvl, state, Input.Left, 60);

    expect(state.x).toBe(0);
  });

  it('stops at the right level border', () => {
    const lvl = level(['...E', '.S..', '####']);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 120);

    expect(state.x + 24).toBe(4 * TILE_SIZE);
  });

  it('jumps with JUMP_VELOCITY and lands on the same ground height', () => {
    const lvl = level(['..........', '..........', '..........', '.S......E.', '##########']);
    const state = createState(lvl);

    step(lvl, state, Input.Jump);
    expect(state.vy).toBe(JUMP_VELOCITY + GRAVITY);
    expect(state.onGround).toBe(false);

    let apex = state.y;
    for (let i = 0; i < 200 && !state.onGround; i++) {
      step(lvl, state, 0);
      apex = Math.min(apex, state.y);
    }

    expect(apex).toBeLessThan(stageOf(lvl, 0).spawn.y - 2 * TILE_SIZE);
    expect(state.y).toBe(stageOf(lvl, 0).spawn.y);
    expect(state.onGround).toBe(true);
  });

  it('does not allow a second jump in mid-air', () => {
    const lvl = level(['..........', '..........', '..........', '.S......E.', '##########']);
    const single = createState(lvl);
    const spammed = createState(lvl);

    step(lvl, single, Input.Jump);
    step(lvl, spammed, Input.Jump);
    for (let i = 0; i < 20; i++) {
      step(lvl, single, 0);
      step(lvl, spammed, Input.Jump);
    }

    expect(spammed.y).toBe(single.y);
  });

  it('bumps the head on a ceiling', () => {
    const lvl = level(['##########', '..........', '.S......E.', '##########']);
    const state = createState(lvl);

    run(lvl, state, Input.Jump, 40);

    expect(state.y).toBeGreaterThanOrEqual(TILE_SIZE);
  });

  it('finishes the level when the player touches the exit and then freezes', () => {
    const lvl = level(FLAT);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 200);

    expect(state.finished).toBe(true);
    expect(state.tick).toBe(66);
    const x = state.x;
    step(lvl, state, Input.Right);
    expect(state.x).toBe(x);
    expect(state.tick).toBe(66);
  });
});

describe('hazards', () => {
  it('kills the player on spikes, resets the position and counts the death', () => {
    const lvl = level(['..........', '.S..^...E.', '##########']);
    const state = createState(lvl);

    for (let i = 0; i < 100 && state.deaths === 0; i++) step(lvl, state, Input.Right);

    expect(state.deaths).toBe(1);
    expect(state.x).toBe(stageOf(lvl, 0).spawn.x);
    expect(state.y).toBe(stageOf(lvl, 0).spawn.y);
    expect(state.finished).toBe(false);
  });

  it('kills the player when falling out of the level', () => {
    const lvl = level(['..........', '.S......E.', '###..#####']);
    const state = createState(lvl);

    for (let i = 0; i < 300 && state.deaths === 0; i++) step(lvl, state, Input.Right);

    expect(state.deaths).toBe(1);
  });

  it('keeps counting ticks across deaths', () => {
    const lvl = level(['..........', '.S..^...E.', '##########']);
    const state = createState(lvl);

    let ticks = 0;
    while (state.deaths === 0 && ticks < 100) {
      step(lvl, state, Input.Right);
      ticks++;
    }
    step(lvl, state, 0);

    expect(state.tick).toBe(ticks + 1);
  });
});

describe('traps', () => {
  const trigger = { x: 3, y: 1, width: 1, height: 1 };

  it('removes tiles once the player enters the trigger', () => {
    const lvl = level(FLAT, [{ id: 'floor', trigger, action: 'remove_tiles', tiles: [[6, 2]] }]);
    const state = createState(lvl);
    expect(state.tiles[2 * 10 + 6]).toBe(Tile.Solid);

    run(lvl, state, Input.Right, 20);

    expect(state.tiles[2 * 10 + 6]).toBe(Tile.Air);
    expect(state.fired.has('floor')).toBe(true);
  });

  it('adds spikes on air tiles', () => {
    const lvl = level(FLAT, [{ id: 'spike', trigger, action: 'add_spikes', tiles: [[6, 1]] }]);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 20);

    expect(state.tiles[1 * 10 + 6]).toBe(Tile.Spike);
  });

  it('adds solid tiles', () => {
    const lvl = level(FLAT, [{ id: 'wall', trigger, action: 'add_tiles', tiles: [[7, 1]] }]);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 60);

    expect(state.tiles[1 * 10 + 7]).toBe(Tile.Solid);
    expect(state.finished).toBe(false);
  });

  it('fires each trap only once per life', () => {
    const lvl = level(FLAT, [{ id: 'floor', trigger, action: 'remove_tiles', tiles: [[6, 2]] }]);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 20);
    state.tiles[2 * 10 + 6] = Tile.Solid;
    run(lvl, state, 0, 5);

    expect(state.tiles[2 * 10 + 6]).toBe(Tile.Solid);
  });

  it('re-arms every trap and restores the tiles after a death', () => {
    const lvl = level(
      ['..........', '.S.....^E.', '##########'],
      [{ id: 'floor', trigger, action: 'remove_tiles', tiles: [[5, 2]] }],
    );
    const state = createState(lvl);

    for (let i = 0; i < 200 && state.deaths === 0; i++) step(lvl, state, Input.Right);

    expect(state.deaths).toBe(1);
    expect(state.tiles[2 * 10 + 5]).toBe(Tile.Solid);
    expect(state.fired.size).toBe(0);
  });
});

describe('simulate', () => {
  it('reports a finished run with its frame count', () => {
    const lvl = level(FLAT);

    const result = simulate(lvl, new Array<number>(100).fill(Input.Right));

    expect(result).toEqual({ finished: true, frames: 66, deaths: 0 });
  });

  it('reports an unfinished run when the inputs run out', () => {
    const lvl = level(FLAT);

    const result = simulate(lvl, new Array<number>(10).fill(Input.Right));

    expect(result).toEqual({ finished: false, frames: 10, deaths: 0 });
  });

  it('is deterministic for identical inputs', () => {
    const lvl = level(
      ['..........', '.S.....^E.', '##########'],
      [
        {
          id: 'a',
          trigger: { x: 3, y: 1, width: 1, height: 1 },
          action: 'add_spikes',
          tiles: [[5, 1]],
        },
      ],
    );
    const inputs = Array.from(
      { length: 400 },
      (_, i) => (i % 7 < 4 ? Input.Right : 0) | (i % 11 === 0 ? Input.Jump : 0),
    );

    const first = simulate(lvl, inputs);
    const second = simulate(lvl, inputs);

    expect(second).toEqual(first);
  });
});

describe('stages', () => {
  const FIRST = ['..........', '.S......E.', '##########'];
  const SECOND = ['..........', '..S.....E.', '##########'];

  it('starts in the first stage', () => {
    const state = createState(multiStage([{ rows: FIRST }, { rows: SECOND }]));

    expect(state.stage).toBe(0);
  });

  it('loads the next stage when the exit of a non-final stage is reached', () => {
    const lvl = multiStage([{ rows: FIRST }, { rows: SECOND }]);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 66);

    expect(state.stage).toBe(1);
    expect(state.finished).toBe(false);
    expect(state.tick).toBe(66);
    expect(state.x).toBe(stageOf(lvl, 1).spawn.x);
    expect(state.y).toBe(stageOf(lvl, 1).spawn.y);
    expect(state.vx).toBe(0);
  });

  it('keeps counting ticks across stages and finishes at the last exit', () => {
    const lvl = multiStage([{ rows: FIRST }, { rows: SECOND }]);

    const result = simulate(lvl, new Array<number>(300).fill(Input.Right));

    expect(result).toEqual({ finished: true, frames: 66 + 55, deaths: 0 });
  });

  it('does not finish the run at the exit of a non-final stage', () => {
    const lvl = multiStage([{ rows: FIRST }, { rows: SECOND }, { rows: FIRST }]);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 66 + 55);

    expect(state.stage).toBe(2);
    expect(state.finished).toBe(false);
  });

  it('respawns in the current stage when dying and keeps earlier stages done', () => {
    const spiked = ['..........', '..S.^...E.', '##########'];
    const lvl = multiStage([{ rows: FIRST }, { rows: spiked }]);
    const state = createState(lvl);

    for (let i = 0; i < 200 && state.deaths === 0; i++) step(lvl, state, Input.Right);

    expect(state.deaths).toBe(1);
    expect(state.stage).toBe(1);
    expect(state.x).toBe(stageOf(lvl, 1).spawn.x);
    expect(state.finished).toBe(false);
  });

  it('restores the tiles and re-arms the traps of a later stage when dying in it', () => {
    const trap: TrapDef = {
      id: 'floor',
      trigger: { x: 3, y: 1, width: 1, height: 1 },
      action: 'remove_tiles',
      tiles: [[6, 2]],
    };
    const spiked = ['..........', '..S..^..E.', '##########'];
    const lvl = multiStage([{ rows: FIRST }, { rows: spiked, traps: [trap] }]);
    const state = createState(lvl);
    run(lvl, state, Input.Right, 66);

    for (let i = 0; i < 200 && state.deaths === 0; i++) step(lvl, state, Input.Right);

    expect(state.deaths).toBe(1);
    expect(state.stage).toBe(1);
    expect(state.fired.size).toBe(0);
    expect(Array.from(state.tiles)).toEqual(Array.from(stageOf(lvl, 1).tiles));
  });

  it('arrives in a fresh stage with its own tiles and re-armed traps', () => {
    const trap: TrapDef = {
      id: 'sky-spike',
      trigger: { x: 3, y: 1, width: 1, height: 1 },
      action: 'add_spikes',
      tiles: [[6, 0]],
    };
    const lvl = multiStage([{ rows: FIRST, traps: [trap] }, { rows: SECOND }]);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 20);
    expect(state.fired.has('sky-spike')).toBe(true);
    run(lvl, state, Input.Right, 46);

    expect(state.stage).toBe(1);
    expect(state.fired.size).toBe(0);
    expect(Array.from(state.tiles)).toEqual(Array.from(stageOf(lvl, 1).tiles));
  });
});
