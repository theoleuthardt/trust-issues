# Levels

Levels are plain TypeScript objects in `packages/sim/src/levels/`. They are validated by
`buildLevel` when the module loads, so a malformed level fails fast and loudly.

## Format

A level is a chapter of one to four **stages** (Teillevel) that are played back to back in
one continuous run. Reaching the exit of a stage loads the next one; the exit of the last
stage finishes the level. Shipped levels have three or four stages.

```ts
export const trustNothing: LevelDef = {
  id: 'trust-nothing', // lower case letters, digits and '-', used in URLs and the database
  name: 'Trust Nothing', // shown in the HUD
  maxFrames: 3600, // frame budget for the whole level, replays above it are rejected
  stages: [
    { rows: ['....', '.S.E', '####'], traps: [] },
    { rows: ['....', '..SE', '####'], traps: [/* see below */] },
  ],
};
```

- All stages of a level have the same size.
- The tick counter and the death counter run across stages. Dying resets only the stage you
  are in, finished stages stay finished.
- A stage's traps are armed when the stage is entered and re-armed when you die in it.

### Rows

All rows of a stage must have the same width. One character is one 32 px tile.

| Char | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| `.`  | air                                                         |
| `#`  | solid                                                       |
| `^`  | spike (deadly)                                              |
| `S`  | spawn, exactly one. The player stands on the tile below it. |
| `E`  | exit, exactly one                                           |

The game canvas is currently 32 x 18 tiles (1024 x 576 px); levels should use that size
until scrolling cameras are implemented.

### Traps

```ts
{
  id: 'floor-gone',                             // unique within the level
  trigger: { x: 16, y: 15, width: 2, height: 1 }, // in tiles
  action: 'remove_tiles',                       // 'remove_tiles' | 'add_tiles' | 'add_spikes'
  tiles: [[19, 16], [20, 16]],                  // [x, y] in tiles
}
```

- A trap fires once per life, the moment the player's box overlaps the trigger.
- `remove_tiles` makes tiles air, `add_tiles` makes them solid, `add_spikes` turns **air**
  tiles into spikes (it never replaces solid tiles).
- Dying re-arms every trap of the stage and restores its tiles.

## Authoring stages

Stages are written with the small DSL in `packages/sim/src/levels/stage.ts` instead of by
hand-drawn ASCII. A stage is a two-row floor plus features; the spawn is in column 1 and the
exit in column 30 unless told otherwise.

| Feature                     | Effect                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| `gap(x, w)`                 | permanent hole in the floor                                        |
| `spikes(x, w)`              | permanent spikes on the floor                                      |
| `wall(x, h)`                | permanent wall on the floor                                        |
| `block(x, y, w, h)`         | free-floating solid block                                          |
| `pop(at, x, w)`             | spikes appear at `x` when the player reaches column `at`           |
| `drop(at, x, w)`            | the floor vanishes at `x`                                          |
| `rise(at, x, h)`            | a wall rises at `x`                                                |
| `sky(at, x, y)`             | a spike appears in mid-air at (`x`, `y`)                           |
| `vanish(at, x, y, w)`       | tiles of a platform vanish                                         |
| `trap(action, rect, tiles)` | raw trap with its own trigger rectangle (for platforms and stairs) |
| `seal(at, x, y, h)`         | tiles appear at (`x`, `y`) downwards                               |

A trap fires when the player overlaps columns `at` and `at + 1` within three tiles above
the floor. Reference: a jump clears a wall of 2 tiles and a gap of 3 tiles.

## Adding a level

1. Write a `LevelContent` (a level without its par time) with its stages, for example in a
   pack file under `packages/sim/src/levels/`.
2. Register it in `packages/sim/src/levels/content.ts`; the order is the play order.
3. Run `task levels:solve` (or `task levels:solve -- <level-id>` for one level). The solver
   finds a zero-death solution for every stage, checks the combined replay in the
   simulation and writes the level's par time (`levels/pars.json`) and its reference
   solution (`solutions.json`). A stage it cannot solve is reported with its number: that
   stage is not beatable and has to be fixed.
4. Run `task test`. The level tests check that ids are unique, the level builds, the
   solution finishes it with the recorded frame count, that the par time equals it, and
   that simply holding "right" does not beat it.

The solver searches in macro steps (hold a direction, optionally jump, for 1 to 20 ticks),
so its solutions are near-optimal rather than perfect. The par time is therefore a fair
target that skilled players can beat; beating it scores more than 1000 points (see
[SCORING.md](SCORING.md)).

## The levels

| #   | Id                    | Name                | Stages | Idea                                                 |
| --- | --------------------- | ------------------- | ------ | ---------------------------------------------------- |
| 1   | `trust-nothing`       | Trust Nothing       | 3      | A spike appears, then the floor goes: the tutorial   |
| 2   | `ground-rules`        | Ground Rules        | 3      | Plain walls and gaps first, then traps in between    |
| 3   | `hole-punch`          | Hole Punch          | 4      | The floor drops away right in front of you           |
| 4   | `spike-season`        | Spike Season        | 3      | Spikes pop up in rows and pairs                      |
| 5   | `wall-street`         | Wall Street         | 4      | Walls rise out of the floor, sometimes behind a hole |
| 6   | `sky-is-falling`      | Sky Is Falling      | 4      | Spikes appear in mid-air, so jump late               |
| 7   | `stairway-to-nowhere` | Stairway to Nowhere | 3      | Climb stairs while the steps turn on you             |
| 8   | `low-ceiling`         | Low Ceiling         | 3      | Ceilings cut your jumps short                        |
| 9   | `domino-effect`       | Domino Effect       | 4      | One trap leads straight into the next                |
| 10  | `fake-friends`        | Fake Friends        | 3      | Stepping stones that bite back                       |

## Design guidance

- One idea per trap. The player should be able to explain what killed them.
- The first death should teach, the second should be avoidable.
- Keep the fair route possible: every trap must be survivable by a player who knows it.
  The reference solution proves it.
