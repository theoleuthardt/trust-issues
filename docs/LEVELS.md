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

### Zones

A stage may list rectangles in tile units that change how the player moves while the centre of
their box is inside:

```ts
zones: [{ x: 8, y: 8, width: 6, height: 8, effect: 'invert' }]; // or 'low_gravity'
```

- `invert` swaps left and right.
- `low_gravity` pulls with 0.2 instead of 0.5 per tick and caps the fall at 4, so a jump
  carries more than twice as high and the fall is slow.
- The zone a player is in is read at the start of a tick, so entering mid-jump changes the
  next tick and leaving gives the normal physics back on the very next one. Zones may overlap.
- Zones are drawn as a faint tint with arrows (inverted) or chevrons (low gravity); they are
  not traps and do not reset on death.
- The DSL has `invertZone(x, y, w, h)` and `floatZone(x, y, w, h)`.

### Platforms

A stage may list platforms that move back and forth on a fixed schedule:

```ts
platforms: [{ x: 8, y: 14, width: 3, axis: 'x', distance: 5, period: 80 }];
```

- A platform is one tile high, starts at tile (`x`, `y`) and travels `distance` tiles along
  `axis` and back; `period` is the number of ticks for the way out and back (an even number from
  20 to 1200), `phase` shifts the schedule by that many ticks.
- Its place is a pure function of the ticks since the stage was entered or the player last
  died in it, so every attempt meets it in the same state and a replay always sees it where it was.
- The player stands on it and is carried; jumping or walking off lets go; it can be jumped
  through from below and does not block sideways movement.
- Whole numbers only; the whole path has to lie inside the stage.
- The solver search grows with the period, so keep periods short (around 80 to 120 ticks) in
  levels you want solved automatically.
- The DSL has `movingPlatform(x, y, width, { axis, distance, period, phase? })`.

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
- A trap with `rearm` must be the only one that changes its tiles: undoing it would otherwise
  also undo what another trap did to the same tile, and `buildLevel` rejects the stage.
- `remove_tiles` makes tiles air, `add_tiles` makes them solid, `add_spikes` turns **air**
  tiles into spikes (it never replaces solid tiles).
- Dying re-arms every trap of the stage and restores its tiles.

## Authoring stages

Stages are written with the small DSL in `packages/sim/src/levels/stage.ts` instead of by
hand-drawn ASCII. A stage is a two-row floor plus features; the spawn is in column 1 and the
exit in column 30 unless told otherwise.

| Feature                                             | Effect                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `gap(x, w)`                                         | permanent hole in the floor                                        |
| `spikes(x, w)`                                      | permanent spikes on the floor                                      |
| `wall(x, h)`                                        | permanent wall on the floor                                        |
| `block(x, y, w, h)`                                 | free-floating solid block                                          |
| `pop(at, x, w)`                                     | spikes appear at `x` when the player reaches column `at`           |
| `drop(at, x, w)`                                    | the floor vanishes at `x`                                          |
| `rise(at, x, h)`                                    | a wall rises at `x`                                                |
| `sky(at, x, y)`                                     | a spike appears in mid-air at (`x`, `y`)                           |
| `vanish(at, x, y, w)`                               | tiles of a platform vanish                                         |
| `trap(action, rect, tiles)`                         | raw trap with its own trigger rectangle (for platforms and stairs) |
| `timed(feature, {delay, rearm})`                    | gives the traps of `feature` a delay and/or a re-arm time          |
| `invertZone(x, y, w, h)`                            | area where left and right are swapped                              |
| `floatZone(x, y, w, h)`                             | area with low gravity                                              |
| `movingPlatform(x, y, w, {axis, distance, period})` | a platform that moves back and forth                               |
| `seal(at, x, y, h)`                                 | tiles appear at (`x`, `y`) downwards                               |
| `hidden(x, y, w, h)`                                | invisible solid tiles, `y` is the top row                          |
| `fake(x, y, w, h)`                                  | tiles that look solid and are not, `y` is the top row              |
| `fakeExit(x, y)`                                    | a deadly door that looks like the exit (row defaults to the floor) |

A trap fires when the player overlaps columns `at` and `at + 1` within three tiles above
the floor. Reference: a jump clears a wall of 2 tiles and a gap of 3 tiles.

## Looking at a level

`task levels:preview -- <level-id>` prints every stage as text: a column ruler, the tiles
(`#` solid, `^` spike, `h` hidden, `f` fake, `X` fake exit, `S` spawn, `E` exit), a digit on the
air tile each trap changes, and a list of the traps with their triggers, delays and re-arm
times. With `--solve` it also runs the solver on every stage and reports the frames of a way
through, or why there is none; the command fails when a stage cannot be solved. The same
search is part of `task levels:solve`, which also writes the result to the reference
solutions.

## Adding a level

1. Write a `LevelContent` (a level without its par time) with its stages, for example in a
   pack file under `packages/sim/src/levels/`.
2. Register it in `packages/sim/src/levels/content.ts`; the order is the play order.
3. Look at it with `task levels:preview -- <id> --solve`, then run `task levels:solve` (or `task levels:solve -- <level-id>` for one level). The solver
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
| 27  | `looking-glass`       | Looking Glass       | 3      | Zones that swap the controls or take the weight off          |
| 28  | `ferryman`            | The Ferryman        | 3      | Platforms that carry you over the gaps                       |

## Design guidance

- One idea per trap. The player should be able to explain what killed them.
- The first death should teach, the second should be avoidable.
- Keep the fair route possible: every trap must be survivable by a player who knows it.
  The reference solution proves it.
