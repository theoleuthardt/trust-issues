import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SOLUTIONS } from '@trust-issues/sim/testing';
import { createVerifierServer } from './server';

const TOKEN = 'test-token-test-token-test-token-0123';
let base = '';
const logged: Record<string, unknown>[] = [];
const server = createVerifierServer({
  token: TOKEN,
  maxBodyBytes: 2048,
  log: (entry) => logged.push(entry),
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-verifier-token': TOKEN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('verifier server', () => {
  it('answers the health check without authentication', async () => {
    const response = await fetch(`${base}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('verifies a replay', async () => {
    const response = await post({
      levelId: 'trust-nothing',
      replay: SOLUTIONS['trust-nothing']?.replay,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      finished: true,
      frames: SOLUTIONS['trust-nothing']?.frames,
      deaths: 0,
      score: 1000,
    });
  });

  it('rejects a missing or wrong token', async () => {
    const wrong = await post(
      { levelId: 'trust-nothing', replay: [] },
      { 'x-verifier-token': 'nope' },
    );
    const missing = await fetch(`${base}/verify`, { method: 'POST', body: '{}' });

    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
  });

  it('rejects malformed JSON', async () => {
    const response = await post('{not json');

    expect(response.status).toBe(400);
  });

  it('rejects bodies over the size limit', async () => {
    const response = await post({
      levelId: 'trust-nothing',
      replay: new Array<number>(5000).fill(0),
    });

    expect(response.status).toBe(413);
  });

  it('answers 404 for unknown paths and 405 for wrong methods', async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/verify`)).status).toBe(405);
  });

  it('logs one entry per request with the request id of the caller', async () => {
    logged.length = 0;

    const response = await post(
      { levelId: 'trust-nothing', replay: [] },
      { 'x-request-id': 'trace-abcdef12' },
    );
    await response.text();

    expect(response.headers.get('x-request-id')).toBe('trace-abcdef12');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      requestId: 'trace-abcdef12',
      method: 'POST',
      path: '/verify',
      status: 200,
    });
    expect(typeof logged[0]?.durationMs).toBe('number');
  });

  it('only logs the fixed set of fields, never the token or the replay', async () => {
    logged.length = 0;

    await (await post({ levelId: 'trust-nothing', replay: [2, 61] })).text();

    expect(Object.keys(logged[0] ?? {}).sort()).toEqual([
      'durationMs',
      'method',
      'path',
      'requestId',
      'status',
      'time',
    ]);
    expect(JSON.stringify(logged)).not.toContain(TOKEN);
  });

  it('creates a request id when none was sent and logs rejected requests too', async () => {
    logged.length = 0;

    const response = await fetch(`${base}/verify`, { method: 'POST', body: '{}' });
    await response.text();

    expect(response.headers.get('x-request-id')).toMatch(/^[a-z0-9-]{16,}$/);
    expect(logged[0]).toMatchObject({ status: 401 });
  });
});
