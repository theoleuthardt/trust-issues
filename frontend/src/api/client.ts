import type { RunVersions } from '@trust-issues/sim';
import { messageFor } from './errors';
import type { ErrorContext } from './errors';

export type { RunVersions };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface User {
  id: number;
  username: string;
}

export interface ServerRun {
  levelId: string;
  score: number;
  frames: number;
  deaths: number;
}

export interface LeaderboardEntry {
  rank: number;
  runId: number;
  username: string;
  score: number;
  frames: number;
  deaths: number;
}

export interface StoredReplay {
  runId: number;
  levelId: string;
  username: string;
  score: number;
  frames: number;
  deaths: number;
  replay: number[];
  versions: RunVersions;
}

export interface RunResult {
  frames: number;
  deaths: number;
  score: number;
  personalBest: boolean;
  rank: number;
}

/** Typed access to the REST API under `/api`; errors come back as `ApiError`. */
export class ApiClient {
  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly token: () => string | undefined,
    private readonly base = '/api',
  ) {}

  register(username: string, password: string): Promise<User> {
    return this.request<User>('POST', '/auth/register', { username, password });
  }

  async login(username: string, password: string): Promise<string> {
    const body = await this.request<{ access_token: string }>('POST', '/auth/login', {
      username,
      password,
    });
    return body.access_token;
  }

  me(): Promise<User> {
    return this.request<User>('GET', '/auth/me');
  }

  /** Changes the password; every older token stops working, the answer is a fresh one. */
  async changePassword(current: string, next: string): Promise<string> {
    const body = await this.request<{ access_token: string }>(
      'POST',
      '/auth/password',
      { current_password: current, new_password: next },
      'account',
    );
    return body.access_token;
  }

  /** Revokes every token of the player, on all devices. */
  async logoutAll(): Promise<void> {
    await this.request<undefined>('POST', '/auth/logout-all', undefined, 'account');
  }

  /** Deletes the account with all its runs after confirming the password. */
  async deleteAccount(password: string): Promise<void> {
    await this.request<undefined>('POST', '/auth/delete', { password }, 'account');
  }

  /** The best verified runs on a level, best score first; public. */
  async leaderboard(levelId: string, limit = 50): Promise<LeaderboardEntry[]> {
    const rows = await this.request<
      {
        rank: number;
        run_id: number;
        username: string;
        score: number;
        frames: number;
        deaths: number;
      }[]
    >('GET', `/leaderboard/${encodeURIComponent(levelId)}?limit=${limit}`, undefined, 'run');
    return rows.map((row) => ({
      rank: row.rank,
      runId: row.run_id,
      username: row.username,
      score: row.score,
      frames: row.frames,
      deaths: row.deaths,
    }));
  }

  /** The stored replay of a run on the leaderboard; public. */
  async replay(runId: number): Promise<StoredReplay> {
    const body = await this.request<{
      run_id: number;
      level_id: string;
      username: string;
      score: number;
      frames: number;
      deaths: number;
      replay: number[];
      sim_version: number;
      level_revision: number;
    }>('GET', `/replays/${runId}`, undefined, 'run');
    return {
      runId: body.run_id,
      levelId: body.level_id,
      username: body.username,
      score: body.score,
      frames: body.frames,
      deaths: body.deaths,
      replay: body.replay,
      versions: { simVersion: body.sim_version, levelRevision: body.level_revision },
    };
  }

  /** The best verified run of the signed-in player on every level they cleared. */
  async progress(): Promise<ServerRun[]> {
    const rows = await this.request<
      { level_id: string; score: number; frames: number; deaths: number }[]
    >('GET', '/progress', undefined, 'run');
    return rows.map((row) => ({
      levelId: row.level_id,
      score: row.score,
      frames: row.frames,
      deaths: row.deaths,
    }));
  }

  /** Sends a recorded run; the server replays it and answers with what it derived. */
  async submitRun(levelId: string, replay: number[], versions: RunVersions): Promise<RunResult> {
    const body = await this.request<{
      frames: number;
      deaths: number;
      score: number;
      personal_best: boolean;
      rank: number;
    }>(
      'POST',
      '/runs',
      {
        level_id: levelId,
        replay,
        sim_version: versions.simVersion,
        level_revision: versions.levelRevision,
      },
      'run',
    );
    return {
      frames: body.frames,
      deaths: body.deaths,
      score: body.score,
      personalBest: body.personal_best,
      rank: body.rank,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    context: ErrorContext = 'credentials',
  ): Promise<T> {
    const headers = new Headers({ accept: 'application/json' });
    if (body !== undefined) headers.set('content-type', 'application/json');
    const token = this.token();
    if (token) headers.set('authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Could not reach the server.');
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new ApiError(0, 'Could not reach the server.');
    }
    let parsed: unknown;
    try {
      parsed = text === '' ? undefined : JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (!response.ok) {
      const errorBody = typeof parsed === 'object' && parsed !== null ? parsed : undefined;
      throw new ApiError(response.status, messageFor(response.status, errorBody, context));
    }
    return parsed as T;
  }
}
