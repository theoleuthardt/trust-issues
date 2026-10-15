import {
  ReplayError,
  SIM_VERSION,
  assessRun,
  decodeReplay,
  getLevel,
  scoreRun,
  simulate,
} from '@trust-issues/sim';
import type { RunFlag, RunResult } from '@trust-issues/sim';

export type VerifyOutcome =
  | { status: 200; body: RunResult & { score: number; flags: RunFlag[] } }
  | { status: 400 | 404 | 409; body: { error: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Replays an untrusted submission against the server-side level and reports how it ended.
 * The level is always looked up by id here; nothing level-related is taken from the request
 * except the versions the replay was recorded with, which must match the ones running here
 * (409 otherwise): a replay of a retired simulation or level revision means something else.
 */
export function verifyRun(body: unknown): VerifyOutcome {
  if (!isRecord(body)) return { status: 400, body: { error: 'body must be an object' } };
  const { levelId, replay, simVersion, levelRevision } = body;
  if (typeof levelId !== 'string')
    return { status: 400, body: { error: 'levelId must be a string' } };
  if (!Array.isArray(replay) || !replay.every((value) => typeof value === 'number')) {
    return { status: 400, body: { error: 'replay must be an array of numbers' } };
  }

  if (!Number.isInteger(simVersion) || !Number.isInteger(levelRevision)) {
    return {
      status: 400,
      body: { error: 'simVersion and levelRevision must be integers' },
    };
  }

  const level = getLevel(levelId);
  if (!level) return { status: 404, body: { error: `unknown level ${levelId}` } };
  if (simVersion !== SIM_VERSION || levelRevision !== level.revision) {
    return { status: 409, body: { error: 'this version of the game is no longer accepted' } };
  }

  try {
    const inputs = decodeReplay(replay as number[], level.maxFrames);
    const result = simulate(level, inputs);
    const score = result.finished ? scoreRun(level.parFrames, result) : 0;
    const flags = result.finished ? assessRun(level, replay as number[], result.frames) : [];
    return { status: 200, body: { ...result, score, flags } };
  } catch (error) {
    if (error instanceof ReplayError) return { status: 400, body: { error: error.message } };
    throw error;
  }
}
