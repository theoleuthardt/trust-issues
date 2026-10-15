import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { RunResult } from '../api/client';
import { RunSubmitter } from './submitter';

const RESULT: RunResult = { frames: 900, deaths: 0, score: 1000, personalBest: true, rank: 2 };
const VERSIONS = { simVersion: 2, levelRevision: 3 };
const RUN = { levelId: 'trust-nothing', replay: [2, 60], versions: VERSIONS };

function setup(
  options: { signedIn?: boolean; submit?: (...a: unknown[]) => Promise<RunResult> } = {},
) {
  const statuses: string[] = [];
  const signOut = vi.fn();
  const submit = vi.fn(options.submit ?? (() => Promise.resolve(RESULT)));
  const submitter = new RunSubmitter({
    signedIn: () => options.signedIn ?? true,
    submit,
    signOut,
    setStatus: (text) => statuses.push(text),
  });
  return { submitter, statuses, signOut, submit };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('RunSubmitter', () => {
  it('points players without an account to signing in and sends nothing', async () => {
    const { submitter, statuses, submit } = setup({ signedIn: false });

    await submitter.send(RUN);

    expect(statuses).toEqual(['Sign in to put your runs on the leaderboard.']);
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows progress and then the result the server derived', async () => {
    const { submitter, statuses, submit } = setup();

    await submitter.send(RUN);

    expect(submit).toHaveBeenCalledWith('trust-nothing', [2, 60], VERSIONS);
    expect(statuses).toEqual(['Sending the run…', 'New personal best · rank 2 · 1000 pts']);
  });

  it('offers to try again after a failure and sends the same run again', async () => {
    let calls = 0;
    const { submitter, statuses } = setup({
      submit: () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new ApiError(503, 'The server is busy, please try again later.'))
          : Promise.resolve(RESULT);
      },
    });

    await submitter.send(RUN);
    expect(statuses.at(-1)).toBe(
      'The server is busy, please try again later. Press S to try again.',
    );

    submitter.retry();
    await vi.waitFor(() => expect(statuses.at(-1)).toMatch(/rank 2/));
  });

  it('does not offer a retry after a success', async () => {
    const { submitter, submit } = setup();
    await submitter.send(RUN);

    submitter.retry();

    expect(submit).toHaveBeenCalledOnce();
  });

  it('signs out when the server says the session ended and does not offer a retry', async () => {
    const { submitter, statuses, signOut, submit } = setup({
      submit: () => Promise.reject(new ApiError(401, 'Your session ended, please sign in again.')),
    });

    await submitter.send(RUN);
    submitter.retry();

    expect(signOut).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toBe('Your session ended, please sign in again.');
    expect(submit).toHaveBeenCalledOnce();
  });

  it('says something went wrong for errors that are not API errors', async () => {
    const { submitter, statuses } = setup({ submit: () => Promise.reject(new Error('boom')) });

    await submitter.send(RUN);

    expect(statuses.at(-1)).toBe('Something went wrong. Press S to try again.');
  });

  it('ignores the answer of an older run once a newer one was sent', async () => {
    const first = deferred<RunResult>();
    const second = deferred<RunResult>();
    const answers = [first.promise, second.promise];
    const { submitter, statuses } = setup({ submit: () => answers.shift() as Promise<RunResult> });

    const older = submitter.send({ ...RUN, levelId: 'a', replay: [1, 1] });
    const newer = submitter.send({ ...RUN, levelId: 'b', replay: [2, 2] });
    second.resolve({ ...RESULT, rank: 1 });
    await newer;
    first.resolve({ ...RESULT, rank: 9 });
    await older;

    expect(statuses.filter((text) => text.includes('rank'))).toEqual([
      'New personal best · rank 1 · 1000 pts',
    ]);
  });
});
