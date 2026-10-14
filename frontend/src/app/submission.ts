import type { RunResult } from '../api/client';

/** One line for the finish screen after the server accepted a run. */
export function submissionText(result: RunResult): string {
  const rank = `rank ${result.rank} · ${result.score} pts`;
  return result.personalBest
    ? `New personal best · ${rank}`
    : `Rank ${result.rank} · ${result.score} pts`;
}
