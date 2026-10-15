import { describe, expect, it } from 'vitest';
import { PALETTE } from './theme';
import { contrastRatio, relativeLuminance } from './contrast';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
  });
});

describe('contrastRatio', () => {
  it('is 21 between black and white, in either order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1 for the same colour', () => {
    expect(contrastRatio('#6b675c', '#6b675c')).toBeCloseTo(1, 5);
  });

  it('ignores a trailing alpha channel', () => {
    expect(contrastRatio('#f4f1eacc', '#14141c')).toBeCloseTo(
      contrastRatio('#f4f1ea', '#14141c'),
      5,
    );
  });
});

describe('palette contrast against WCAG AA', () => {
  const AA_TEXT = 4.5;
  const AA_GRAPHIC = 3;

  it.each([
    ['ink on paper', PALETTE.ink, PALETTE.paper],
    ['ink on the shaded paper', PALETTE.ink, PALETTE.paperShade],
    ['soft ink on paper', PALETTE.inkSoft, PALETTE.paper],
    ['paper on ink', PALETTE.paper, PALETTE.ink],
    ['shaded paper on ink', PALETTE.paperShade, PALETTE.ink],
  ])('keeps text readable: %s', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each([
    ['spikes on paper', PALETTE.accent, PALETTE.paper],
    ['spike shade on paper', PALETTE.accentDark, PALETTE.paper],
    ['ink tiles on paper', PALETTE.ink, PALETTE.paper],
    ['the skyline behind the player', PALETTE.ink, PALETTE.paperShade],
  ])('keeps shapes visible: %s', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('keeps a hazard recognisable without relying on colour: spikes also differ in shape and in lightness from the ground', () => {
    const spike = relativeLuminance(PALETTE.accent);
    const ground = relativeLuminance(PALETTE.ink);

    expect(Math.abs(spike - ground)).toBeGreaterThan(0.1);
  });
});
