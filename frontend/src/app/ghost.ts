import type { Level } from '@trust-issues/sim';
import { FIRST_VERSIONS } from './progress';
import type { RunRecord } from './progress';
import { playableInputs } from './replayPlayback';

/**
 * The inputs of the player's own best run on `level`, to be raced as a ghost. Nothing when
 * there is no stored replay or it was recorded with another version of the game.
 */
export function ghostInputs(record: RunRecord | undefined, level: Level): number[] | undefined {
  if (!record?.replay) return undefined;
  const result = playableInputs(level, record.replay, record.versions ?? FIRST_VERSIONS);
  return result.ok ? result.inputs : undefined;
}
