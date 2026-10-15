import { describe, expect, it } from 'vitest';
import { profileRows, profileSummary } from './profile';

const LEVELS = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
];

const profile = {
  username: 'alice',
  runs: [
    {
      runId: 11,
      levelId: 'c',
      score: 800,
      frames: 650,
      deaths: 3,
      completedAt: '2026-10-15T01:00:00Z',
    },
    {
      runId: 7,
      levelId: 'a',
      score: 1010,
      frames: 890,
      deaths: 0,
      completedAt: '2026-10-14T20:00:00Z',
    },
  ],
};

describe('profileRows', () => {
  it('lists every level in play order, with the run of the player where there is one', () => {
    const rows = profileRows(profile, LEVELS);

    expect(rows.map((row) => [row.number, row.name, row.completed])).toEqual([
      [1, 'Alpha', true],
      [2, 'Beta', false],
      [3, 'Gamma', true],
    ]);
    expect(rows[0]).toMatchObject({ score: '1010', time: '0:14.83', deaths: '0', runId: 7 });
    expect(rows[2]).toMatchObject({ score: '800', time: '0:10.83', deaths: '3', runId: 11 });
  });

  it('shows dashes for a level that was not completed', () => {
    const [, missing] = profileRows(profile, LEVELS);

    expect(missing).toMatchObject({
      score: '–',
      time: '–',
      deaths: '–',
      runId: undefined,
      completed: false,
    });
  });

  it('ignores runs of levels the game no longer has', () => {
    const rows = profileRows(
      {
        username: 'alice',
        runs: [{ runId: 1, levelId: 'gone', score: 1, frames: 1, deaths: 0, completedAt: 'x' }],
      },
      LEVELS,
    );

    expect(rows.every((row) => !row.completed)).toBe(true);
  });
});

describe('profileSummary', () => {
  it('counts completed levels and sums their time', () => {
    expect(profileSummary(profile, LEVELS)).toBe('2 of 3 levels · 0:25.66 total');
  });

  it('says so for a player without runs', () => {
    expect(profileSummary({ username: 'new', runs: [] }, LEVELS)).toBe('No level completed yet');
  });
});
