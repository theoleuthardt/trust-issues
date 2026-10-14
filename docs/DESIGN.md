# Design

The look recalls the stripped-down clarity of _Level Devil_: flat shapes, no gradients, one
screen, instantly readable hazards. The identity is its own, a night sky with sticker-like
characters: "Dusk Sticker".

## Screenshots

Start of level 1 (desktop), and a moment later: the spike popped out of the ground.

![Start of level 1](images/start.png)
![Running, trap fired](images/running.png)

Touch mode on a phone in landscape (`?touch=1`):

![Touch controls](images/touch.png)

![Palette](images/palette.png)

## Principles

- **Readability first.** Solid ground, hazards, the player and the exit must be told apart
  at a glance, on a phone in sunlight.
- **Flat shapes, one outline.** Everything is a simple shape with at most one darker
  outline or shade. No textures.
- **Few colours, fixed roles.** Every colour has one job (below). A new colour needs a new
  job.
- **Shape carries meaning too.** Hazards are triangles, goals are arches, so the game stays
  readable for colour-blind players.

## Palette

The single source of truth is `frontend/src/theme.ts`. It feeds Phaser (as numbers) and CSS
(as `--ti-*` custom properties).

| Role             | Name              | Colour               |
| ---------------- | ----------------- | -------------------- |
| Sky              | `night`           | `#1b1633`            |
| Far band         | `nightFar`        | `#2a2250`            |
| Stars            | `star`            | `#5b4fa0`            |
| Ground           | `ground`          | `#22355a`            |
| Ground tile line | `groundLine`      | `#162340`            |
| Ground top edge  | `groundTop`       | `#2ee6a6`            |
| Spike            | `spike`           | `#ff4d8d`            |
| Spike shade      | `spikeShade`      | `#c42a64`            |
| Player           | `player`          | `#ffe8a3`            |
| Player shade     | `playerShade`     | `#d9b95e`            |
| Eye / outline    | `eye`, `outline`  | `#1b1633`, `#0e0a1f` |
| Exit door        | `door`            | `#ffb347`            |
| Exit inside      | `doorInside`      | `#0e0a1f`            |
| Exit glow        | `glow`            | `#ffd98a`            |
| Text             | `text`, `textDim` | `#f4efff`, `#a79bd8` |

## The player

A cream-coloured rounded block with two eyes that look in the direction of travel. It
stretches vertically while moving fast through the air and squashes back on landing. No
animation frames, just geometry, which keeps the game fast and the sprites free of assets.

## UI

- HUD at the top: time on the left, level name in the middle, deaths on the right,
  monospace.
- Finish screen: dimmed scene, the time and deaths, a hint to retry.
- Touch controls: two circular buttons left (move), one right (jump), 64 px, semi
  transparent, placed over the lower corners so the play field stays full size.

## Changing the look

Change colours in `theme.ts` only. Drawing code must use `colorNumber('<role>')`; CSS must
use `var(--ti-<role>)`. Hard-coded colours in components are a review finding.
