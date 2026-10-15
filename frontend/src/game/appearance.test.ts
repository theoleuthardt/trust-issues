import { describe, expect, it } from 'vitest';
import { Tile } from '@trust-issues/sim';
import { appearanceOf } from './appearance';

describe('appearanceOf', () => {
  it('draws every kind as what it pretends to be', () => {
    expect(appearanceOf(Tile.Air)).toBe('air');
    expect(appearanceOf(Tile.Solid)).toBe('solid');
    expect(appearanceOf(Tile.Spike)).toBe('spike');
    expect(appearanceOf(Tile.Hidden)).toBe('air');
    expect(appearanceOf(Tile.Fake)).toBe('solid');
    expect(appearanceOf(Tile.FakeExit)).toBe('exit');
  });

  it('draws an unknown kind as air', () => {
    expect(appearanceOf(99)).toBe('air');
    expect(appearanceOf(undefined)).toBe('air');
  });
});
