# Levels

Levels are plain TypeScript objects in `packages/sim/src/levels/`. They are validated by
`buildLevel` when the module loads, so a malformed level fails fast and loudly.

## Format

```ts
export const trustNothing: LevelDef = {
  id: 'trust-nothing', // lower case letters, digits and '-', used in URLs and the database
  name: 'Trust Nothing', // shown in the HUD
  maxFrames: 3600, // frame budget: 60 seconds, replays above it are rejected
  rows: ['....', '.S.E', '####'],
  traps: [/* see below */],
};
```

### Rows

All rows must have the same width. One character is one 32 px tile.

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
- Dying re-arms every trap and restores the level.

## Adding a level

1. Create `packages/sim/src/levels/<id>.ts` exporting a `LevelDef`.
2. Register it in `packages/sim/src/levels/index.ts` (order is play order).
3. Add a reference solution for it to `SOLUTIONS` in `packages/sim/src/testing.ts`.
   A throwaway search script that tries input sequences is the easiest way to find one.
4. Run `task test`. The level tests check that ids are unique, the level builds, the
   solution finishes it with the recorded frame count, and that simply holding "right" does
   not beat it.

## Design guidance

- One idea per trap. The player should be able to explain what killed them.
- The first death should teach, the second should be avoidable.
- Keep the fair route possible: every trap must be survivable by a player who knows it.
  The reference solution proves it.
