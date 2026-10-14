import { ReplayError, decodeReplay, getLevel, simulate } from '@trust-issues/sim';
import type { RunResult } from '@trust-issues/sim';

export type VerifyOutcome =
  { status: 200; body: RunResult } | { status: 400 | 404; body: { error: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Replays an untrusted submission against the server-side level and reports how it ended.
 * The level is always looked up by id here; nothing level-related is taken from the request.
 */
export function verifyRun(body: unknown): VerifyOutcome {
  if (!isRecord(body)) return { status: 400, body: { error: 'body must be an object' } };
  const { levelId, replay } = body;
  if (typeof levelId !== 'string')
    return { status: 400, body: { error: 'levelId must be a string' } };
  if (!Array.isArray(replay) || !replay.every((value) => typeof value === 'number')) {
    return { status: 400, body: { error: 'replay must be an array of numbers' } };
  }

  const level = getLevel(levelId);
  if (!level) return { status: 404, body: { error: `unknown level ${levelId}` } };

  try {
    const inputs = decodeReplay(replay as number[], level.maxFrames);
    return { status: 200, body: simulate(level, inputs) };
  } catch (error) {
    if (error instanceof ReplayError) return { status: 400, body: { error: error.message } };
    throw error;
  }
}
