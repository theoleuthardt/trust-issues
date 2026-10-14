import { describe, expect, it } from 'vitest';
import { PALETTE, colorNumber } from './theme';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe('palette', () => {
  it('stays minimal: at most six colours', () => {
    expect(Object.keys(PALETTE).length).toBeLessThanOrEqual(6);
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

  it('converts a palette role to the number Phaser expects', () => {
    expect(colorNumber('ink')).toBe(Number.parseInt(PALETTE.ink.slice(1, 7), 16));
  });
});
