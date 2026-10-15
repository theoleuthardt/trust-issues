import { describe, expect, it } from 'vitest';
import { leaderboardRows } from './leaderboard';

const ENTRIES = [
  { rank: 1, runId: 11, username: 'alice', score: 1010, frames: 890, deaths: 0 },
  { rank: 2, runId: 12, username: 'Bob', score: 940, frames: 960, deaths: 2 },
  { rank: 3, runId: 13, username: 'carol', score: 900, frames: 1000, deaths: 5 },
];

describe('leaderboardRows', () => {
  it('formats rank, name, score, time and deaths', () => {
    const rows = leaderboardRows(ENTRIES, undefined);

    expect(rows[0]).toEqual({
      rank: '1',
      runId: 11,
      username: 'alice',
      score: '1010',
      time: '0:14.83',
      deaths: '0',
      isYou: false,
    });
  });

  it('marks the row of the signed-in player, ignoring case', () => {
    const rows = leaderboardRows(ENTRIES, 'bob');

    expect(rows.map((row) => row.isYou)).toEqual([false, true, false]);
  });

  it('marks nobody for a guest', () => {
    expect(leaderboardRows(ENTRIES, undefined).some((row) => row.isYou)).toBe(false);
  });

  it('returns no rows for an empty board', () => {
    expect(leaderboardRows([], 'bob')).toEqual([]);
  });
});
