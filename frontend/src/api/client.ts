import { messageFor } from './errors';
import type { ErrorContext } from './errors';

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

  /** Sends a recorded run; the server replays it and answers with what it derived. */
  async submitRun(levelId: string, replay: number[]): Promise<RunResult> {
    const body = await this.request<{
      frames: number;
      deaths: number;
      score: number;
      personal_best: boolean;
      rank: number;
    }>('POST', '/runs', { level_id: levelId, replay }, 'run');
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
