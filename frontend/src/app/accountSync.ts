import type { RunResult, ServerRun } from '../api/client';
import type { ProgressStore } from './progress';
import type { RunRecord } from './progress';

export interface SyncDeps {
  fetchServer: () => Promise<ServerRun[]>;
  submit: (levelId: string, replay: number[]) => Promise<RunResult>;
  guest: ProgressStore;
  account: ProgressStore;
}

export interface SyncOutcome {
  reachable: boolean;
  submitted: number;
  failed: number;
}

function beats(candidate: RunRecord, other: RunRecord | undefined): boolean {
  if (!other) return true;
  if (candidate.score !== other.score) return candidate.score > other.score;
  return candidate.frames < other.frames;
}

/**
 * Brings the progress of a signed-in player together: what the server knows, what the
 * account kept locally and what was played as a guest. Guest runs with a replay that beat the
 * server are sent; all guest progress then moves into the account. Without a reachable
 * server nothing changes.
 */
export async function syncAccount(deps: SyncDeps): Promise<SyncOutcome> {
  let server: ServerRun[];
  try {
    server = await deps.fetchServer();
  } catch {
    return { reachable: false, submitted: 0, failed: 0 };
  }

  const known = new Map<string, RunRecord>();
  for (const run of server) {
    const record = { score: run.score, frames: run.frames, deaths: run.deaths };
    known.set(run.levelId, record);
    deps.account.record(run.levelId, record);
  }

  let submitted = 0;
  let failed = 0;
  for (const [levelId, record] of Object.entries(deps.guest.load())) {
    deps.account.record(levelId, record);
    if (!record.replay || !beats(record, known.get(levelId))) continue;
    try {
      await deps.submit(levelId, record.replay);
      submitted += 1;
    } catch {
      failed += 1;
    }
  }
  deps.guest.clear();
  return { reachable: true, submitted, failed };
}
