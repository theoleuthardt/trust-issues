import type { PlayerProfile } from '../api/client';
import { formatTime } from '../format';

export interface ProfileRow {
  number: number;
  name: string;
  completed: boolean;
  score: string;
  time: string;
  deaths: string;
  /** The run to watch, when the level was completed. */
  runId: number | undefined;
}

const NONE = '–';

/** One row per level of the game in play order; levels the player has not completed show dashes. */
export function profileRows(
  profile: PlayerProfile,
  levels: readonly { id: string; name: string }[],
): ProfileRow[] {
  const byLevel = new Map(profile.runs.map((run) => [run.levelId, run]));
  return levels.map((level, index) => {
    const run = byLevel.get(level.id);
    return {
      number: index + 1,
      name: level.name,
      completed: run !== undefined,
      score: run ? String(run.score) : NONE,
      time: run ? formatTime(run.frames) : NONE,
      deaths: run ? String(run.deaths) : NONE,
      runId: run?.runId,
    };
  });
}

/** A line under the name: how many levels are done and the time they took together. */
export function profileSummary(profile: PlayerProfile, levels: readonly { id: string }[]): string {
  const ids = new Set(levels.map((level) => level.id));
  const counted = profile.runs.filter((run) => ids.has(run.levelId));
  if (counted.length === 0) return 'No level completed yet';
  const frames = counted.reduce((sum, run) => sum + run.frames, 0);
  return `${counted.length} of ${levels.length} levels · ${formatTime(frames)} total`;
}
