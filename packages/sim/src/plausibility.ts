/** A run is faster than this share of the par time, in percent, only with help from a tool. */
export const MIN_FRAMES_PERCENT_OF_PAR = 70;

/** How often a pattern of two to four input entries may repeat exactly before it is flagged. */
export const REPETITION_LIMIT = 10;

const LONGEST_PERIOD = 4;

export type RunFlag = 'faster-than-possible' | 'repetitive-input';

/** The most times an exact pattern of `period` entries repeats back to back in `entries`. */
function longestRepeat(entries: readonly string[], period: number): number {
  let run = 0;
  let longest = 0;
  for (let i = 0; i + period < entries.length; i++) {
    run = entries[i] === entries[i + period] ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest === 0 ? 1 : Math.floor((longest + period) / period);
}

/**
 * Marks a finished run that is valid but looks made by a tool: faster than a human can
 * plausibly beat the reference solution of the level, or built from a short input pattern
 * repeated with identical timing. The run still counts; the flags are for moderation.
 * `replay` is the run-length encoded input list and `frames` the verified duration.
 */
export function assessRun(
  level: { parFrames: number },
  replay: readonly number[],
  frames: number,
): RunFlag[] {
  const flags: RunFlag[] = [];
  if (frames * 100 < level.parFrames * MIN_FRAMES_PERCENT_OF_PAR) {
    flags.push('faster-than-possible');
  }

  const entries: string[] = [];
  for (let i = 0; i + 1 < replay.length; i += 2) entries.push(`${replay[i]}:${replay[i + 1]}`);
  for (let period = 2; period <= LONGEST_PERIOD; period++) {
    if (longestRepeat(entries, period) >= REPETITION_LIMIT) {
      flags.push('repetitive-input');
      break;
    }
  }
  return flags;
}
