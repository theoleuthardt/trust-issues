import { ReplayError, decodeReplay, runVersions } from '@trust-issues/sim';
import type { Level, RunVersions } from '@trust-issues/sim';

/** Playback speeds of the replay viewer, slowest first. */
export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

const NORMAL_SPEED_INDEX = SPEEDS.indexOf(1);

function indexOfSpeed(speed: number): number {
  const index = SPEEDS.findIndex((candidate) => candidate === speed);
  return index === -1 ? NORMAL_SPEED_INDEX : index;
}

/** The next faster speed, or the same one at the end of the list. */
export function faster(speed: number): number {
  return SPEEDS[Math.min(SPEEDS.length - 1, indexOfSpeed(speed) + 1)] ?? 1;
}

/** The next slower speed, or the same one at the start of the list. */
export function slower(speed: number): number {
  return SPEEDS[Math.max(0, indexOfSpeed(speed) - 1)] ?? 1;
}

/** Hands out the recorded input of one tick at a time; after the end the player stands still. */
export class ReplayCursor {
  private index = 0;

  constructor(private readonly inputs: readonly number[]) {}

  get done(): boolean {
    return this.index >= this.inputs.length;
  }

  next(): number {
    const mask = this.inputs[this.index] ?? 0;
    this.index += 1;
    return mask;
  }

  reset(): void {
    this.index = 0;
  }
}

export type PlayableInputs = { ok: true; inputs: number[] } | { ok: false; reason: string };

/**
 * Expands a stored replay for playback. A replay only means something under the simulation
 * version and level revision it was recorded with, so any other one is refused, as is a
 * damaged or overlong list.
 */
export function playableInputs(
  level: Level,
  replay: readonly number[],
  versions: RunVersions,
): PlayableInputs {
  const current = runVersions(level);
  if (
    versions.simVersion !== current.simVersion ||
    versions.levelRevision !== current.levelRevision
  ) {
    return { ok: false, reason: 'This run was recorded with another version of the game.' };
  }
  try {
    return { ok: true, inputs: decodeReplay(replay, level.maxFrames) };
  } catch (error) {
    if (error instanceof ReplayError) return { ok: false, reason: 'This replay is damaged.' };
    throw error;
  }
}
