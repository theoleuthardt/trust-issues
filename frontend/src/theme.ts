/**
 * "Dusk Sticker": flat shapes with a dark outline on a deep violet night. Every colour of the
 * game, canvas and DOM, comes from here; see docs/DESIGN.md.
 */
export const PALETTE = {
  night: '#1b1633',
  nightFar: '#2a2250',
  star: '#5b4fa0',
  ground: '#22355a',
  groundLine: '#162340',
  groundTop: '#2ee6a6',
  spike: '#ff4d8d',
  spikeShade: '#c42a64',
  player: '#ffe8a3',
  playerShade: '#d9b95e',
  eye: '#1b1633',
  door: '#ffb347',
  doorInside: '#0e0a1f',
  glow: '#ffd98a',
  text: '#f4efff',
  textDim: '#a79bd8',
  outline: '#0e0a1f',
  panel: '#2a2250cc',
} as const;

export type PaletteColor = keyof typeof PALETTE;

/** Converts a palette entry to the 0xRRGGBB number Phaser expects. */
export function colorNumber(name: PaletteColor): number {
  return Number.parseInt(PALETTE[name].slice(1, 7), 16);
}

/** Exposes the palette to CSS as `--ti-<name>` custom properties. */
export function applyPaletteToCss(root: HTMLElement): void {
  for (const [name, value] of Object.entries(PALETTE)) {
    root.style.setProperty(`--ti-${name}`, value);
  }
}
