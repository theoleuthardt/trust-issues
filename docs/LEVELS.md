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

| Char | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `.`  | air                                                            |
| `#`  | solid                                                          |
| `^`  | spike (deadly)                                                 |
| `h`  | hidden solid: collides like `#` but is drawn as air            |
| `f`  | fake solid: drawn like `#` but can be walked or fallen through |
| `X`  | fake exit: drawn like the exit, kills like a spike             |
| `S`  | spawn, exactly one. The player stands on the tile below it.    |
| `E`  | exit, exactly one                                              |

The last three are the visual lies. The real exit has a slowly pulsing halo behind it and a
fake exit does not, which is the one tell a careful player can use. A trap's `add_spikes`
only turns air into spikes, so it never changes a `h`, `f` or `X` tile.

Adding tile kinds does not change what any existing replay does, so it needs no
`SIM_VERSION` bump (see [VERSIONING.md](VERSIONING.md)); changing how an existing kind
behaves would.

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
- `delay` (0 to 600 ticks) puts the effect that many ticks after the trigger; a death in
  between cancels it and re-arms the trap.
- `rearm` (1 to 3600 ticks) undoes the effect that many ticks after it was applied (the tiles
  go back to what they were) and lets the trap fire again; if the player still stands in the
  trigger it fires again right away. Without it a trap is one-shot.
- The effect of `delay` and `rearm` is exact in ticks, so a trap can be timed against a jump.
- `remove_tiles` makes tiles air, `add_tiles` makes them solid, `add_spikes` turns **air**
  tiles into spikes (it never replaces solid tiles).
- Dying re-arms every trap of the stage and restores its tiles.

## Authoring stages

Stages are written with the small DSL in `packages/sim/src/levels/stage.ts` instead of by
hand-drawn ASCII. A stage is a two-row floor plus features; the spawn is in column 1 and the
exit in column 30 unless told otherwise.

| Feature                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `gap(x, w)`                      | permanent hole in the floor                                        |
| `spikes(x, w)`                   | permanent spikes on the floor                                      |
| `wall(x, h)`                     | permanent wall on the floor                                        |
| `block(x, y, w, h)`              | free-floating solid block                                          |
| `pop(at, x, w)`                  | spikes appear at `x` when the player reaches column `at`           |
| `drop(at, x, w)`                 | the floor vanishes at `x`                                          |
| `rise(at, x, h)`                 | a wall rises at `x`                                                |
| `sky(at, x, y)`                  | a spike appears in mid-air at (`x`, `y`)                           |
| `vanish(at, x, y, w)`            | tiles of a platform vanish                                         |
| `trap(action, rect, tiles)`      | raw trap with its own trigger rectangle (for platforms and stairs) |
| `timed(feature, {delay, rearm})` | gives the traps of `feature` a delay and/or a re-arm time          |
| `seal(at, x, y, h)`              | tiles appear at (`x`, `y`) downwards                               |
| `hidden(x, y, w, h)`             | invisible solid tiles, `y` is the top row                          |
| `fake(x, y, w, h)`               | tiles that look solid and are not, `y` is the top row              |
| `fakeExit(x, y)`                 | a deadly door that looks like the exit (row defaults to the floor) |

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

| #   | Id                    | Name                | Stages | Idea                                                         |
| --- | --------------------- | ------------------- | ------ | ------------------------------------------------------------ |
| 1   | `trust-nothing`       | Trust Nothing       | 3      | A spike appears, then the floor goes: the tutorial           |
| 2   | `ground-rules`        | Ground Rules        | 3      | Plain walls and gaps first, then traps in between            |
| 3   | `hole-punch`          | Hole Punch          | 4      | The floor drops away right in front of you                   |
| 4   | `spike-season`        | Spike Season        | 3      | Spikes pop up in rows and pairs                              |
| 5   | `wall-street`         | Wall Street         | 4      | Walls rise out of the floor, sometimes behind a hole         |
| 6   | `sky-is-falling`      | Sky Is Falling      | 4      | Spikes appear in mid-air, so jump late                       |
| 7   | `stairway-to-nowhere` | Stairway to Nowhere | 3      | Climb stairs while the steps turn on you                     |
| 8   | `low-ceiling`         | Low Ceiling         | 3      | Ceilings cut your jumps short                                |
| 9   | `domino-effect`       | Domino Effect       | 4      | One trap leads straight into the next                        |
| 10  | `fake-friends`        | Fake Friends        | 3      | Stepping stones that bite back                               |
| 11  | `needle-garden`       | Needle Garden       | 4      | Fields of spikes and the shortest safe ground                |
| 12  | `climb-every-wall`    | Climb Every Wall    | 4      | Walls too high to jump, with steps to build                  |
| 13  | `bait-and-switch`     | Bait and Switch     | 4      | The floor goes where you were about to land                  |
| 14  | `the-gauntlet`        | The Gauntlet        | 4      | Everything so far, back to back                              |
| 15  | `final-exam`          | Final Exam          | 4      | Stairs, pits, walls and mid-air spikes in one run            |
| 16  | `vertigo`             | Vertigo             | 4      | Towers: climb, and watch where the spikes come from          |
| 17  | `narrow-ledges`       | Narrow Ledges       | 3      | One-tile stones over wide gaps                               |
| 18  | `mind-games`          | Mind Games          | 4      | Traps that go off while you are in the air                   |
| 19  | `tunnel-vision`       | Tunnel Vision       | 3      | Long ceilings that cut every jump short                      |
| 20  | `trust-issues`        | Trust Issues        | 4      | The title level: nothing is what it seems                    |
| 21  | `paper-walls`         | Paper Walls         | 3      | Walls that look solid and let you walk through               |
| 22  | `invisible-man`       | Invisible Man       | 3      | Pits that have an invisible floor                            |
| 23  | `wrong-door`          | Wrong Door          | 3      | Exits that kill, and the real one a jump away                |
| 24  | `floor-is-fake`       | The Floor Is Fake   | 4      | Ground that looks solid and gives way                        |
| 25  | `everything-lies`     | Everything Lies     | 4      | All three lies in one level                                  |
| 26  | `second-thoughts`     | Second Thoughts     | 3      | Traps that wait a moment, and traps that put themselves back |

## Design guidance

- One idea per trap. The player should be able to explain what killed them.
- The first death should teach, the second should be avoidable.
- Keep the fair route possible: every trap must be survivable by a player who knows it.
  The reference solution proves it.
