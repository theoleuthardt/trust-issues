# Design

The look is "Paper & Ink", inspired by the stripped-down clarity of _Level Devil_: a flat
paper background, solid ink shapes, and a single accent colour that means danger. There is
nothing to look at that is not either the way forward or a way to die.

![Start of level 1](images/start.png)
![A trap has fired](images/running.png)

## Principles

- **Minimal on purpose.** Six colours in total, no gradients, no outlines, no glow, no
  decoration. If a shape does not carry gameplay information, it is not drawn.
- **Readability first.** Ground, hazard, player and exit must be told apart at a glance, on
  a phone in sunlight.
- **The accent means danger.** Red-orange appears on things that kill and nowhere else.
- **Shape carries meaning too.** Hazards are triangles, goals are arches, so the game stays
  readable without colour perception.

## Palette

The single source of truth is `frontend/src/theme.ts`. It feeds Phaser (as numbers) and CSS
(as `--ti-*` custom properties). A test keeps it at six colours and checks contrast.

![Palette](images/palette.png)

| Role        | Name         | Colour      | Used for                                |
| ----------- | ------------ | ----------- | --------------------------------------- |
| Background  | `paper`      | `#f4f1ea`   | Canvas, page, door interior, overlays   |
| Shade       | `paperShade` | `#e7e2d6`   | Reserved for panels and secondary areas |
| Ink         | `ink`        | `#14141c`   | Solid tiles, player, door, main text    |
| Soft ink    | `inkSoft`    | `#6b675c`   | Level name, hints                       |
| Accent      | `accent`     | `#ff3d2e`   | Spikes and the finish title             |
| Touch panel | `panel`      | `#f4f1eacc` | Background of the on-screen buttons     |

Contrast (enforced in `theme.test.ts`): ink on paper at least 12:1, soft ink on paper at
least 4.5:1, accent against paper and against ink at least 3:1.

## Elements

| Element       | Drawing                                                  |
| ------------- | -------------------------------------------------------- |
| Solid tile    | Full ink square, no seams, no outline                    |
| Spike         | Accent triangle standing on its tile                     |
| Exit          | Ink arch with a paper opening                            |
| Player        | Ink figure that looks in the direction of travel         |
| HUD           | Time left, level name middle, deaths right, monospace    |
| Finish screen | Paper veil, accent title, ink time and deaths, soft hint |

## Touch

Two circular buttons left (move) and one right (jump), 64 px, semi-transparent paper with an
ink ring. Pressed buttons invert to ink. Touch controls appear on touch devices and with
`?touch=1`.

![Touch controls](images/touch.png)

## Changing the look

Change colours in `theme.ts` only. Drawing code uses `colorNumber('<role>')`, CSS uses
`var(--ti-<role>)`. Hard-coded colours in components are a review finding, and so is a
seventh colour.
