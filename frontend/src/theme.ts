/**
 * "Paper & Ink": a flat paper background, solid ink shapes with a lighter ink for seams, and one
 * accent colour (plus its shade) that means danger. Every colour of the game, canvas and DOM, comes from here; see docs/DESIGN.md.
 */
export const PALETTE = {
  paper: '#f4f1ea',
  paperShade: '#e7e2d6',
  ink: '#14141c',
  inkLift: '#262633',
  inkSoft: '#6b675c',
  accent: '#ff3d2e',
  accentDark: '#c92a1d',
  panel: '#f4f1eacc',
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
