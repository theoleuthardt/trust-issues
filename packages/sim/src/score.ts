/** Time score of a run that takes exactly the par time. */
export const PAR_TIME_SCORE = 1000;
/** Highest time score; reached by finishing in half the par time or faster. */
export const MAX_TIME_SCORE = 2000;
/** Points taken off for every death. */
export const DEATH_PENALTY = 25;

/**
 * Score of a finished run: the time score scales inversely with the frames relative to the
 * level's par time (par gives `PAR_TIME_SCORE`, capped at `MAX_TIME_SCORE`), minus a penalty
 * per death, never below zero. Integer math only, so it is the same everywhere.
 */
export function scoreRun(parFrames: number, run: { frames: number; deaths: number }): number {
  if (!Number.isInteger(parFrames) || parFrames < 1) {
    throw new RangeError('parFrames must be a positive integer');
  }
  if (!Number.isInteger(run.frames) || run.frames < 1) {
    throw new RangeError('frames must be a positive integer');
  }
  const timeScore = Math.min(MAX_TIME_SCORE, Math.floor((PAR_TIME_SCORE * parFrames) / run.frames));
  return Math.max(0, timeScore - DEATH_PENALTY * run.deaths);
}
