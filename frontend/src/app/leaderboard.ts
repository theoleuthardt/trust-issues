import type { LeaderboardEntry } from '../api/client';
import { formatTime } from '../format';

export interface LeaderboardRow {
  rank: string;
  username: string;
  score: string;
  time: string;
  deaths: string;
  isYou: boolean;
}

/** Display rows for a leaderboard; the signed-in player's own row is marked. */
export function leaderboardRows(
  entries: readonly LeaderboardEntry[],
  you: string | undefined,
): LeaderboardRow[] {
  const name = you?.trim().toLowerCase();
  return entries.map((entry) => ({
    rank: String(entry.rank),
    username: entry.username,
    score: String(entry.score),
    time: formatTime(entry.frames),
    deaths: String(entry.deaths),
    isYou: name !== undefined && entry.username.toLowerCase() === name,
  }));
}
