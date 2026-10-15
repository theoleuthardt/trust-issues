import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { LEVELS } from '@trust-issues/sim';
import { verifyRun } from './verify';

export interface VerifierServerOptions {
  token: string;
  maxBodyBytes?: number;
  /** Receives one structured entry per request; defaults to a JSON line on stdout. */
  log?: (entry: Record<string, unknown>) => void;
}

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

class BodyTooLargeError extends Error {}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function tokenMatches(provided: string | undefined, expected: string): boolean {
  return timingSafeEqual(sha256(provided ?? ''), sha256(expected));
}

function readBody(request: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        request.pause();
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

/**
 * HTTP front of the verifier. It is meant to be reachable from the backend only and still
 * requires a shared token, caps the body size and never trusts level data from the caller.
 */
export function createVerifierServer(options: VerifierServerOptions): Server {
  const limit = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));

  return createServer((request, response) => {
    const url = request.url ?? '/';
    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const started = performance.now();
    response.setHeader('x-request-id', requestId);
    response.once('finish', () => {
      log({
        time: new Date().toISOString(),
        requestId,
        method: request.method,
        path: url.split('?')[0],
        status: response.statusCode,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      });
    });
    if (url === '/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (url !== '/verify' && url !== '/levels') {
      sendJson(response, 404, { error: 'not found' });
      return;
    }
    if (request.method !== (url === '/levels' ? 'GET' : 'POST')) {
      sendJson(response, 405, { error: 'method not allowed' });
      return;
    }
    const header = request.headers['x-verifier-token'];
    if (!tokenMatches(Array.isArray(header) ? header[0] : header, options.token)) {
      sendJson(response, 401, { error: 'unauthorized' });
      return;
    }
    if (url === '/levels') {
      sendJson(response, 200, { levels: LEVELS.map((level) => level.id) });
      return;
    }

    readBody(request, limit)
      .then((raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          sendJson(response, 400, { error: 'invalid JSON' });
          return;
        }
        const outcome = verifyRun(parsed);
        sendJson(response, outcome.status, outcome.body);
      })
      .catch((error: unknown) => {
        if (error instanceof BodyTooLargeError) {
          response.once('finish', () => request.socket.destroy());
          sendJson(response, 413, { error: 'body too large' }, { connection: 'close' });
          return;
        }
        sendJson(response, 500, { error: 'internal error' });
      });
  });
}
