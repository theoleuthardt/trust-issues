import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError } from './client';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchFn = (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { fetchFn: fetchFn as typeof fetch, calls };
}

describe('ApiClient', () => {
  it('registers with a JSON body and returns the user', async () => {
    const { fetchFn, calls } = fakeFetch(201, { id: 3, username: 'mallory' });
    const client = new ApiClient(fetchFn, () => undefined);

    const user = await client.register('mallory', 'correct-horse-battery');

    expect(user).toEqual({ id: 3, username: 'mallory' });
    expect(calls[0]?.url).toBe('/api/auth/register');
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      username: 'mallory',
      password: 'correct-horse-battery',
    });
  });

  it('logs in and returns the access token', async () => {
    const { fetchFn } = fakeFetch(200, { access_token: 'abc', token_type: 'bearer' });
    const client = new ApiClient(fetchFn, () => undefined);

    expect(await client.login('mallory', 'pw')).toBe('abc');
  });

  it('sends the bearer token when there is one', async () => {
    const { fetchFn, calls } = fakeFetch(200, { id: 1, username: 'mallory' });
    const client = new ApiClient(fetchFn, () => 'tok');

    await client.me();

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('authorization')).toBe('Bearer tok');
  });

  it('throws an ApiError with a friendly message for error responses', async () => {
    const { fetchFn } = fakeFetch(409, { detail: 'username already taken' });
    const client = new ApiClient(fetchFn, () => undefined);

    await expect(client.register('mallory', 'correct-horse-battery')).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/taken/i),
    });
  });

  it('turns a network failure into an ApiError', async () => {
    const fetchFn = (() => Promise.reject(new TypeError('failed to fetch'))) as typeof fetch;
    const client = new ApiClient(fetchFn, () => undefined);

    const error = await client.login('a', 'b').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toMatch(/reach the server/i);
  });

  it('submits a run and maps the answer', async () => {
    const { fetchFn, calls } = fakeFetch(201, {
      frames: 903,
      deaths: 1,
      score: 934,
      personal_best: true,
      rank: 4,
    });
    const client = new ApiClient(fetchFn, () => 'tok');

    const result = await client.submitRun('trust-nothing', [2, 62, 6, 1]);

    expect(result).toEqual({ frames: 903, deaths: 1, score: 934, personalBest: true, rank: 4 });
    expect(calls[0]?.url).toBe('/api/runs');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      level_id: 'trust-nothing',
      replay: [2, 62, 6, 1],
    });
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('reports a rejected run with the reason of the server', async () => {
    const { fetchFn } = fakeFetch(422, { detail: 'replay does not finish the level' });
    const client = new ApiClient(fetchFn, () => 'tok');

    await expect(client.submitRun('trust-nothing', [2, 5])).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/not accepted.*does not finish/i),
    });
  });

  it('turns a failure while reading the body into an ApiError', async () => {
    const broken = {
      ok: true,
      status: 200,
      text: () => Promise.reject(new TypeError('connection reset')),
    } as unknown as Response;
    const client = new ApiClient((() => Promise.resolve(broken)) as typeof fetch, () => undefined);

    await expect(client.me()).rejects.toMatchObject({ status: 0 });
  });

  it('survives an error body that is not JSON', async () => {
    const fetchFn = (() =>
      Promise.resolve(new Response('<html>bad gateway</html>', { status: 502 }))) as typeof fetch;
    const client = new ApiClient(fetchFn, () => undefined);

    await expect(client.me()).rejects.toMatchObject({ status: 502 });
  });
});
