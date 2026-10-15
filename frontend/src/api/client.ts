import type { RunVersions } from '@trust-issues/sim';
import createClient from 'openapi-fetch';
import { messageFor } from './errors';
import type { ErrorContext } from './errors';
import type { paths } from './schema';

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

export interface ProfileRun {
  runId: number;
  levelId: string;
  score: number;
  frames: number;
  deaths: number;
  completedAt: string;
}

export interface PlayerProfile {
  username: string;
  runs: ProfileRun[];
}

export interface RunResult {
  frames: number;
  deaths: number;
  score: number;
  personalBest: boolean;
  rank: number;
}

interface Answer<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function origin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
}

/**
 * Access to the REST API. Requests and answers are typed by the client generated from the
 * OpenAPI schema of the backend (`schema.d.ts`, see docs/ARCHITECTURE.md); this class maps them
 * to the shapes of the game and failures to `ApiError` with a message a player can act on.
 */
export class ApiClient {
  private readonly http: ReturnType<typeof createClient<paths>>;

  constructor(fetchFn: typeof fetch, token: () => string | undefined, baseUrl: string = origin()) {
    this.http = createClient<paths>({ baseUrl, fetch: (request) => fetchFn(request) });
    this.http.use({
      onRequest: ({ request }) => {
        const bearer = token();
        if (bearer) request.headers.set('authorization', `Bearer ${bearer}`);
        return request;
      },
    });
  }

  register(username: string, password: string): Promise<User> {
    return this.call(this.http.POST('/api/auth/register', { body: { username, password } }));
  }

  async login(username: string, password: string): Promise<string> {
    const body = await this.call(
      this.http.POST('/api/auth/login', { body: { username, password } }),
    );
    return body.access_token;
  }

  me(): Promise<User> {
    return this.call(this.http.GET('/api/auth/me'));
  }

  /** Changes the password; every older token stops working, the answer is a fresh one. */
  async changePassword(current: string, next: string): Promise<string> {
    const body = await this.call(
      this.http.POST('/api/auth/password', {
        body: { current_password: current, new_password: next },
      }),
      'account',
    );
    return body.access_token;
  }

  /** Revokes every token of the player, on all devices. */
  async logoutAll(): Promise<void> {
    await this.call(this.http.POST('/api/auth/logout-all'), 'account');
  }

  /** Deletes the account with all its runs after confirming the password. */
  async deleteAccount(password: string): Promise<void> {
    await this.call(this.http.POST('/api/auth/delete', { body: { password } }), 'account');
  }

  /** The best verified runs on a level, best score first; public. */
  async leaderboard(levelId: string, limit = 50): Promise<LeaderboardEntry[]> {
    const rows = await this.call(
      this.http.GET('/api/leaderboard/{level_id}', {
        params: { path: { level_id: levelId }, query: { limit } },
      }),
      'run',
    );
    return rows.map((row) => ({
      rank: row.rank,
      runId: row.run_id,
      username: row.username,
      score: row.score,
      frames: row.frames,
      deaths: row.deaths,
    }));
  }

  /** What a player shows on the leaderboards: their best run per level; public. */
  async profile(username: string): Promise<PlayerProfile> {
    const body = await this.call(
      this.http.GET('/api/players/{username}', { params: { path: { username } } }),
      'profile',
    );
    return {
      username: body.username,
      runs: body.runs.map((run) => ({
        runId: run.run_id,
        levelId: run.level_id,
        score: run.score,
        frames: run.frames,
        deaths: run.deaths,
        completedAt: run.completed_at,
      })),
    };
  }

  /** The stored replay of a run on the leaderboard; public. */
  async replay(runId: number): Promise<StoredReplay> {
    const body = await this.call(
      this.http.GET('/api/replays/{run_id}', { params: { path: { run_id: runId } } }),
      'run',
    );
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
    const rows = await this.call(this.http.GET('/api/progress'), 'run');
    return rows.map((row) => ({
      levelId: row.level_id,
      score: row.score,
      frames: row.frames,
      deaths: row.deaths,
    }));
  }

  /** Sends a recorded run; the server replays it and answers with what it derived. */
  async submitRun(levelId: string, replay: number[], versions: RunVersions): Promise<RunResult> {
    const body = await this.call(
      this.http.POST('/api/runs', {
        body: {
          level_id: levelId,
          replay,
          sim_version: versions.simVersion,
          level_revision: versions.levelRevision,
        },
      }),
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

  private async call<T>(
    pending: Promise<Answer<T>>,
    context: ErrorContext = 'credentials',
  ): Promise<T> {
    let answer: Answer<T>;
    try {
      answer = await pending;
    } catch {
      throw new ApiError(0, 'Could not reach the server.');
    }
    if (!answer.response.ok) {
      const body =
        typeof answer.error === 'object' && answer.error !== null ? answer.error : undefined;
      throw new ApiError(answer.response.status, messageFor(answer.response.status, body, context));
    }
    return answer.data as T;
  }
}
