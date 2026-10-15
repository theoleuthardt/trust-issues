import type { RunResult, RunVersions, ServerRun } from '../api/client';
import type { ProgressStore } from './progress';
import type { RunRecord } from './progress';

export interface SyncDeps {
  fetchServer: () => Promise<ServerRun[]>;
  submit: (levelId: string, replay: number[], versions: RunVersions) => Promise<RunResult>;
  guest: ProgressStore;
  account: ProgressStore;
}

export interface SyncOutcome {
  reachable: boolean;
  submitted: number;
  failed: number;
}

/** Runs stored before versions were recorded were all made with the first version of both. */
const FIRST_VERSIONS: RunVersions = { simVersion: 1, levelRevision: 1 };

function beats(candidate: RunRecord, other: RunRecord | undefined): boolean {
  if (!other) return true;
  if (candidate.score !== other.score) return candidate.score > other.score;
  return candidate.frames < other.frames;
}

/**
 * Brings the progress of a signed-in player together: what the server knows, what the
 * account kept locally and what was played as a guest. All guest progress moves into the
 * account, then every local run with a replay that beats the server is sent, so a run whose
 * sending failed is tried again at the next sync. Without a reachable server nothing changes.
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

  for (const [levelId, record] of Object.entries(deps.guest.load())) {
    deps.account.record(levelId, record);
  }
  deps.guest.clear();

  let submitted = 0;
  let failed = 0;
  for (const [levelId, record] of Object.entries(deps.account.load())) {
    if (!record.replay || !beats(record, known.get(levelId))) continue;
    try {
      await deps.submit(levelId, record.replay, record.versions ?? FIRST_VERSIONS);
      submitted += 1;
    } catch {
      failed += 1;
    }
  }
  return { reachable: true, submitted, failed };
}
