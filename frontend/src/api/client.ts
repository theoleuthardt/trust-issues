import { messageFor } from './errors';

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

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text === '' ? undefined : JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (!response.ok) {
      const errorBody = typeof parsed === 'object' && parsed !== null ? parsed : undefined;
      throw new ApiError(response.status, messageFor(response.status, errorBody));
    }
    return parsed as T;
  }
}
