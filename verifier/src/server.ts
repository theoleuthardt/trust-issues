import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { verifyRun } from './verify';

export interface VerifierServerOptions {
  token: string;
  maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

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

  return createServer((request, response) => {
    const url = request.url ?? '/';
    if (url === '/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (url !== '/verify') {
      sendJson(response, 404, { error: 'not found' });
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method not allowed' });
      return;
    }
    const header = request.headers['x-verifier-token'];
    if (!tokenMatches(Array.isArray(header) ? header[0] : header, options.token)) {
      sendJson(response, 401, { error: 'unauthorized' });
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
