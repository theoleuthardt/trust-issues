import { describe, expect, it } from 'vitest';
import { nextLevel, stageDots, startIndex } from './progress';

const LEVELS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('stageDots', () => {
  it('marks finished stages, the current one and the stages to come', () => {
    expect(stageDots(1, 4)).toEqual(['done', 'current', 'todo', 'todo']);
  });

  it('starts with the first stage current', () => {
    expect(stageDots(0, 3)).toEqual(['current', 'todo', 'todo']);
  });

  it('shows the last stage as current', () => {
    expect(stageDots(2, 3)).toEqual(['done', 'done', 'current']);
  });

  it('shows a single stage', () => {
    expect(stageDots(0, 1)).toEqual(['current']);
  });
});

describe('nextLevel', () => {
  it('returns the level after the current one', () => {
    expect(nextLevel(LEVELS, 'a')).toEqual({ id: 'b' });
    expect(nextLevel(LEVELS, 'b')).toEqual({ id: 'c' });
  });

  it('returns undefined after the last level', () => {
    expect(nextLevel(LEVELS, 'c')).toBeUndefined();
  });

  it('returns undefined for an unknown level', () => {
    expect(nextLevel(LEVELS, 'zzz')).toBeUndefined();
  });
});

describe('startIndex', () => {
  it('starts with the first level by default', () => {
    expect(startIndex(LEVELS, '')).toBe(0);
  });

  it('can start at a level given in the address', () => {
    expect(startIndex(LEVELS, '?level=b')).toBe(1);
  });

  it('falls back to the first level for an unknown id', () => {
    expect(startIndex(LEVELS, '?level=nope')).toBe(0);
  });
});
