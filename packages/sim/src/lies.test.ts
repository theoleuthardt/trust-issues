import { describe, expect, it } from 'vitest';
import {
  Input,
  PLAYER_WIDTH,
  TILE_SIZE,
  Tile,
  buildLevel,
  createState,
  stageOf,
  step,
} from './index';
import type { TrapDef } from './index';
import { block, fake, fakeExit, hidden, stage } from './levels/stage';

const level = (rows: string[], traps: TrapDef[] = []) =>
  buildLevel({
    id: 't',
    name: 't',
    stages: [{ rows, traps }],
    maxFrames: 3600,
    parFrames: 100,
  });

const run = (
  lvl: ReturnType<typeof level>,
  state: ReturnType<typeof createState>,
  mask: number,
  frames: number,
) => {
  for (let i = 0; i < frames; i++) step(lvl, state, mask);
};

describe('tile kinds', () => {
  it('parse hidden, fake and fake exit tiles from the stage rows', () => {
    const { tiles, width } = stageOf(level(['.hfX.', '.S..E', '#####']), 0);

    expect(tiles[1]).toBe(Tile.Hidden);
    expect(tiles[2]).toBe(Tile.Fake);
    expect(tiles[3]).toBe(Tile.FakeExit);
    expect(width).toBe(5);
  });

  it('are distinct from the existing kinds', () => {
    const kinds = [Tile.Air, Tile.Solid, Tile.Spike, Tile.Hidden, Tile.Fake, Tile.FakeExit];

    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe('hidden tiles', () => {
  it('stop the player like a wall although nothing is drawn', () => {
    const lvl = level(['.......', '.S..h.E', '#######']);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 60);

    expect(state.x).toBe(4 * TILE_SIZE - PLAYER_WIDTH);
    expect(state.deaths).toBe(0);
  });

  it('can be stood on', () => {
    const lvl = level(['.........', '.S.......', '.........', '..hhh.E..', '#########']);
    const state = createState(lvl);
    state.x = 3 * TILE_SIZE;
    state.y = 1 * TILE_SIZE;
    state.onGround = false;

    run(lvl, state, 0, 60);

    expect(state.onGround).toBe(true);
    expect(state.y).toBe(3 * TILE_SIZE - 28);
  });

  it('count as ground under the spawn', () => {
    const lvl = level(['.......', '.S....E', '.h.....']);
    const state = createState(lvl);

    expect(state.onGround).toBe(true);
  });
});

describe('fake tiles', () => {
  it('let the player walk through a wall that looks solid', () => {
    const lvl = level(['.........', '.S..f..E.', '#########']);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 60);

    expect(state.x).toBeGreaterThan(4 * TILE_SIZE);
  });

  it('give way under a floor that looks solid', () => {
    const lvl = level(['.........', '.S.......', '.ffff..E.', '.........']);
    const state = createState(lvl);
    state.x = 2 * TILE_SIZE;
    state.y = 0;

    run(lvl, state, 0, 40);

    expect(state.deaths).toBe(1);
  });

  it('stay fake when a trap adds spikes onto air next to them', () => {
    const traps: TrapDef[] = [
      {
        id: 'a',
        trigger: { x: 1, y: 0, width: 1, height: 2 },
        action: 'add_spikes',
        tiles: [
          [2, 1],
          [3, 1],
        ],
      },
    ];
    const lvl = level(['.....', '.S.fE', '#####'], traps);
    const state = createState(lvl);

    run(lvl, state, 0, 2);

    expect(state.tiles[1 * 5 + 2]).toBe(Tile.Spike);
    expect(state.tiles[1 * 5 + 3]).toBe(Tile.Fake);
  });
});

describe('fake exits', () => {
  it('kill the player instead of finishing the level', () => {
    const lvl = level(['.........', '.S..X..E.', '#########']);
    const state = createState(lvl);

    run(lvl, state, Input.Right, 40);

    expect(state.deaths).toBe(1);
    expect(state.finished).toBe(false);
  });

  it('do not kill a player who is not touching them', () => {
    const lvl = level(['.........', '.S..X..E.', '#########']);
    const state = createState(lvl);

    run(lvl, state, 0, 40);

    expect(state.deaths).toBe(0);
  });
});

describe('stage features', () => {
  it('hidden, fake and fakeExit write their characters', () => {
    const { rows } = stage([hidden(5, 12, 3), fake(10, 13, 1, 2), fakeExit(20, 15)]);

    expect(rows[12]?.slice(5, 8)).toBe('hhh');
    expect(rows[13]?.charAt(10)).toBe('f');
    expect(rows[14]?.charAt(10)).toBe('f');
    expect(rows[15]?.charAt(20)).toBe('X');
  });

  it('build into a valid level together with the other features', () => {
    const def = stage([block(3, 12, 2), hidden(8, 12), fake(12, 15), fakeExit(16, 15)]);

    expect(() =>
      buildLevel({ id: 't', name: 't', stages: [def], maxFrames: 3600, parFrames: 100 }),
    ).not.toThrow();
  });
});
