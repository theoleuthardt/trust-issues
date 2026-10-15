import { describe, expect, it } from 'vitest';
import { contrastRatio as contrast } from './contrast';
import { PALETTE, colorNumber } from './theme';

describe('palette', () => {
  it('stays minimal: at most eight colours', () => {
    expect(Object.keys(PALETTE).length).toBeLessThanOrEqual(8);
  });

  it('only contains #rrggbb or #rrggbbaa colours', () => {
    for (const value of Object.values(PALETTE)) {
      expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
    }
  });

  it('keeps text and blocks readable on the paper', () => {
    expect(contrast(PALETTE.ink, PALETTE.paper)).toBeGreaterThanOrEqual(12);
    expect(contrast(PALETTE.inkSoft, PALETTE.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.ink, PALETTE.paperShade)).toBeGreaterThanOrEqual(7);
  });

  it('keeps hazards visible on the paper and apart from solid ground', () => {
    expect(contrast(PALETTE.accent, PALETTE.paper)).toBeGreaterThanOrEqual(3);
    expect(contrast(PALETTE.accent, PALETTE.ink)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the shading roles close to the colour they shade', () => {
    expect(contrast(PALETTE.inkLift, PALETTE.ink)).toBeGreaterThan(1.1);
    expect(contrast(PALETTE.inkLift, PALETTE.ink)).toBeLessThan(2);
    expect(contrast(PALETTE.accentDark, PALETTE.accent)).toBeGreaterThan(1.2);
    expect(contrast(PALETTE.accentDark, PALETTE.paper)).toBeGreaterThanOrEqual(3);
  });

  it('converts a palette role to the number Phaser expects', () => {
    expect(colorNumber('ink')).toBe(Number.parseInt(PALETTE.ink.slice(1, 7), 16));
  });
});
