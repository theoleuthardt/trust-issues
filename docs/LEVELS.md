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

## Adding a level

1. Create `packages/sim/src/levels/<id>.ts` exporting a `LevelContent` (a level without its
   par time) with its stages.
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

## Design guidance

- One idea per trap. The player should be able to explain what killed them.
- The first death should teach, the second should be avoidable.
- Keep the fair route possible: every trap must be survivable by a player who knows it.
  The reference solution proves it.
