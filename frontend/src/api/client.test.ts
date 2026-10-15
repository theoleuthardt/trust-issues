import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError } from './client';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const target = new URL(request.url);
    const text = await request.clone().text();
    calls.push({
      url: `${target.pathname}${target.search}`,
      init: {
        method: request.method,
        body: text === '' ? undefined : text,
        headers: request.headers,
      },
    });
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
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

    const result = await client.submitRun('trust-nothing', [2, 62, 6, 1], {
      simVersion: 2,
      levelRevision: 3,
    });

    expect(result).toEqual({ frames: 903, deaths: 1, score: 934, personalBest: true, rank: 4 });
    expect(calls[0]?.url).toBe('/api/runs');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      level_id: 'trust-nothing',
      replay: [2, 62, 6, 1],
      sim_version: 2,
      level_revision: 3,
    });
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('reports a rejected run with the reason of the server', async () => {
    const { fetchFn } = fakeFetch(422, { detail: 'replay does not finish the level' });
    const client = new ApiClient(fetchFn, () => 'tok');

    await expect(
      client.submitRun('trust-nothing', [2, 5], { simVersion: 1, levelRevision: 1 }),
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/not accepted.*does not finish/i),
    });
  });

  it('loads the progress of the player', async () => {
    const { fetchFn, calls } = fakeFetch(200, [
      {
        level_id: 'trust-nothing',
        score: 993,
        frames: 909,
        deaths: 0,
        completed_at: '2026-10-15T00:00:00Z',
      },
    ]);
    const client = new ApiClient(fetchFn, () => 'tok');

    const progress = await client.progress();

    expect(progress).toEqual([{ levelId: 'trust-nothing', score: 993, frames: 909, deaths: 0 }]);
    expect(calls[0]?.url).toBe('/api/progress');
  });

  it('loads the leaderboard of a level without a token', async () => {
    const { fetchFn, calls } = fakeFetch(200, [
      { rank: 1, run_id: 11, username: 'alice', score: 1010, frames: 890, deaths: 0 },
      { rank: 2, run_id: 12, username: 'bob', score: 940, frames: 960, deaths: 2 },
    ]);
    const client = new ApiClient(fetchFn, () => undefined);

    const rows = await client.leaderboard('trust-nothing', 20);

    expect(rows).toEqual([
      { rank: 1, runId: 11, username: 'alice', score: 1010, frames: 890, deaths: 0 },
      { rank: 2, runId: 12, username: 'bob', score: 940, frames: 960, deaths: 2 },
    ]);
    expect(calls[0]?.url).toBe('/api/leaderboard/trust-nothing?limit=20');
  });

  it('loads the replay of a run without a token', async () => {
    const { fetchFn, calls } = fakeFetch(200, {
      run_id: 11,
      level_id: 'trust-nothing',
      username: 'alice',
      score: 1010,
      frames: 890,
      deaths: 0,
      replay: [2, 60],
      sim_version: 1,
      level_revision: 2,
    });
    const client = new ApiClient(fetchFn, () => undefined);

    const replay = await client.replay(11);

    expect(replay).toEqual({
      runId: 11,
      levelId: 'trust-nothing',
      username: 'alice',
      score: 1010,
      frames: 890,
      deaths: 0,
      replay: [2, 60],
      versions: { simVersion: 1, levelRevision: 2 },
    });
    expect(calls[0]?.url).toBe('/api/replays/11');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBeNull();
  });

  it('loads the profile of a player without a token', async () => {
    const { fetchFn, calls } = fakeFetch(200, {
      username: 'Alice',
      runs: [
        {
          run_id: 7,
          level_id: 'trust-nothing',
          score: 1010,
          frames: 890,
          deaths: 0,
          completed_at: '2026-10-14T20:00:00Z',
        },
      ],
    });
    const client = new ApiClient(fetchFn, () => undefined);

    const profile = await client.profile('Alice');

    expect(profile).toEqual({
      username: 'Alice',
      runs: [
        {
          runId: 7,
          levelId: 'trust-nothing',
          score: 1010,
          frames: 890,
          deaths: 0,
          completedAt: '2026-10-14T20:00:00Z',
        },
      ],
    });
    expect(calls[0]?.url).toBe('/api/players/Alice');
  });

  it('reports a profile that does not exist', async () => {
    const { fetchFn } = fakeFetch(404, { detail: 'unknown player' });
    const client = new ApiClient(fetchFn, () => undefined);

    await expect(client.profile('nobody')).rejects.toMatchObject({ status: 404 });
  });

  it('reports a run that cannot be watched', async () => {
    const { fetchFn } = fakeFetch(404, { detail: 'unknown run' });
    const client = new ApiClient(fetchFn, () => undefined);

    await expect(client.replay(5)).rejects.toMatchObject({ status: 404 });
  });

  it('encodes the level id in the leaderboard path', async () => {
    const { fetchFn, calls } = fakeFetch(200, []);
    const client = new ApiClient(fetchFn, () => undefined);

    await client.leaderboard('a/b c');

    expect(calls[0]?.url).toBe('/api/leaderboard/a%2Fb%20c?limit=50');
  });

  it('changes the password and returns the fresh token', async () => {
    const { fetchFn, calls } = fakeFetch(200, { access_token: 'fresh', token_type: 'bearer' });
    const client = new ApiClient(fetchFn, () => 'tok');

    const token = await client.changePassword('old-password-123', 'new-password-456');

    expect(token).toBe('fresh');
    expect(calls[0]?.url).toBe('/api/auth/password');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      current_password: 'old-password-123',
      new_password: 'new-password-456',
    });
  });

  it('signs out everywhere', async () => {
    const { fetchFn, calls } = fakeFetch(204, undefined);
    const client = new ApiClient(fetchFn, () => 'tok');

    await client.logoutAll();

    expect(calls[0]?.url).toBe('/api/auth/logout-all');
    expect(calls[0]?.init.method).toBe('POST');
  });

  it('deletes the account with the password', async () => {
    const { fetchFn, calls } = fakeFetch(204, undefined);
    const client = new ApiClient(fetchFn, () => 'tok');

    await client.deleteAccount('my-password-123');

    expect(calls[0]?.url).toBe('/api/auth/delete');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ password: 'my-password-123' });
  });

  it('reports a wrong password as such', async () => {
    const { fetchFn } = fakeFetch(403, { detail: 'wrong password' });
    const client = new ApiClient(fetchFn, () => 'tok');

    await expect(client.deleteAccount('nope')).rejects.toMatchObject({
      status: 403,
      message: 'Wrong password.',
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
