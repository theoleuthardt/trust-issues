import { describe, expect, it } from 'vitest';
import { Input } from '@trust-issues/sim';
import { SOLUTIONS } from '@trust-issues/sim/testing';
import { verifyRun } from './verify';

const solution = SOLUTIONS['trust-nothing'];

describe('verifyRun', () => {
  it('accepts the reference solution and reports frames and deaths', () => {
    const outcome = verifyRun({ levelId: 'trust-nothing', replay: solution?.replay });

    expect(outcome).toEqual({
      status: 200,
      body: { finished: true, frames: 290, deaths: 0, score: 1000 },
    });
  });

  it('reports an unfinished run as not finished', () => {
    const outcome = verifyRun({ levelId: 'trust-nothing', replay: [Input.Right, 30] });

    expect(outcome).toEqual({
      status: 200,
      body: { finished: false, frames: 30, deaths: 0, score: 0 },
    });
  });

  it('answers 404 for an unknown level', () => {
    const outcome = verifyRun({ levelId: 'nope', replay: [] });

    expect(outcome.status).toBe(404);
  });

  it.each([
    ['null body', null],
    ['missing level id', { replay: [] }],
    ['non-string level id', { levelId: 3, replay: [] }],
    ['missing replay', { levelId: 'trust-nothing' }],
    ['non-array replay', { levelId: 'trust-nothing', replay: 'abc' }],
    ['non-numeric replay entries', { levelId: 'trust-nothing', replay: ['a', 'b'] }],
    ['odd replay length', { levelId: 'trust-nothing', replay: [2, 3, 1] }],
    ['invalid mask', { levelId: 'trust-nothing', replay: [9, 3] }],
    ['replay longer than the frame budget', { levelId: 'trust-nothing', replay: [2, 60000] }],
  ])('answers 400 for %s', (_name, body) => {
    expect(verifyRun(body).status).toBe(400);
  });
});
