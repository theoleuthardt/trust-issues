/** The best result of a player on one level; the replay is kept to be sent after signing in. */
export interface RunRecord {
  score: number;
  frames: number;
  deaths: number;
  replay?: number[];
}

export type Progress = Readonly<Record<string, RunRecord>>;

export type CardStatus = 'locked' | 'open' | 'cleared';

export interface LevelCard {
  index: number;
  id: string;
  number: number;
  name: string;
  stages: number;
  status: CardStatus;
  best: RunRecord | undefined;
}

interface LevelInfo {
  id: string;
  name: string;
  stages: readonly unknown[];
}

export const PROGRESS_KEY = 'trust-issues.progress.v1';

/** Storage key of a signed-in player's progress; usernames are case-insensitive. */
export function accountKey(username: string): string {
  return `${PROGRESS_KEY}.${username.trim().toLowerCase()}`;
}

function isBetter(candidate: RunRecord, current: RunRecord): boolean {
  if (candidate.score !== current.score) return candidate.score > current.score;
  return candidate.frames < current.frames;
}

/** Returns the progress with the run recorded if it beats the stored best of that level. */
export function recordRun(progress: Progress, levelId: string, run: RunRecord): Progress {
  const current = progress[levelId];
  if (current && !isBetter(run, current)) return progress;
  return { ...progress, [levelId]: run };
}

/** Levels open one after the other: a level is playable once the one before it is cleared. */
export function isUnlocked(
  levels: readonly LevelInfo[],
  progress: Progress,
  index: number,
): boolean {
  if (index <= 0) return true;
  const previous = levels[index - 1];
  return previous !== undefined && progress[previous.id] !== undefined;
}

/** The first level without a cleared run, or the last level when everything is cleared. */
export function firstOpenIndex(levels: readonly LevelInfo[], progress: Progress): number {
  const index = levels.findIndex((level) => progress[level.id] === undefined);
  return index === -1 ? Math.max(0, levels.length - 1) : index;
}

export function levelCards(levels: readonly LevelInfo[], progress: Progress): LevelCard[] {
  return levels.map((level, index) => {
    const best = progress[level.id];
    let status: CardStatus = 'locked';
    if (best) status = 'cleared';
    else if (isUnlocked(levels, progress, index)) status = 'open';
    return {
      index,
      id: level.id,
      number: index + 1,
      name: level.name,
      stages: level.stages.length,
      status,
      best,
    };
  });
}

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return ['score', 'frames', 'deaths'].every((key) => Number.isFinite(record[key]));
}

function replayOf(value: unknown): number[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const replay = (value as Record<string, unknown>).replay;
  if (!Array.isArray(replay)) return undefined;
  return replay.every((entry) => Number.isInteger(entry)) ? (replay as number[]) : undefined;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Local progress of a player, kept in the browser. Damaged data is ignored, and when the
 * storage cannot be read or written (private mode, quota) the progress lives in memory for
 * the session so playing keeps working.
 */
export class ProgressStore {
  private memory: Progress | undefined;
  private unreadable = false;

  constructor(
    private readonly storage: StorageLike,
    private readonly key: string = PROGRESS_KEY,
  ) {}

  load(): Progress {
    if (this.memory) return this.memory;
    try {
      const progress = this.parse(this.storage.getItem(this.key));
      this.unreadable = false;
      return progress;
    } catch {
      this.unreadable = true;
      return {};
    }
  }

  record(levelId: string, run: RunRecord): Progress {
    const next = recordRun(this.load(), levelId, run);
    this.memory = next;
    if (this.unreadable) return next;
    try {
      this.storage.setItem(this.key, JSON.stringify(next));
      this.memory = undefined;
    } catch {
      return next;
    }
    return next;
  }

  /** Forgets all progress under this key, for example after it was merged into an account. */
  clear(): void {
    this.memory = {};
    if (this.unreadable) return;
    try {
      this.storage.setItem(this.key, '{}');
      this.memory = undefined;
    } catch {
      return;
    }
  }

  private parse(raw: string | null): Progress {
    if (raw === null) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      const progress: Record<string, RunRecord> = {};
      for (const [id, value] of Object.entries(parsed)) {
        if (isRunRecord(value)) {
          const replay = replayOf(value);
          progress[id] = {
            score: value.score,
            frames: value.frames,
            deaths: value.deaths,
            ...(replay ? { replay } : {}),
          };
        }
      }
      return progress;
    } catch {
      return {};
    }
  }
}
