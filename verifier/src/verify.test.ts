import { describe, expect, it } from 'vitest';
import { Input, SIM_VERSION, getLevel } from '@trust-issues/sim';
import { SOLUTIONS } from '@trust-issues/sim/testing';
import { verifyRun } from './verify';

const solution = SOLUTIONS['trust-nothing'];
const levelRevision = getLevel('trust-nothing')?.revision ?? 0;
const versions = { simVersion: SIM_VERSION, levelRevision };

describe('verifyRun', () => {
  it('accepts the reference solution and reports frames and deaths', () => {
    const outcome = verifyRun({ levelId: 'trust-nothing', replay: solution?.replay, ...versions });

    expect(outcome).toEqual({
      status: 200,
      body: { finished: true, frames: solution?.frames, deaths: 0, score: 1000, flags: [] },
    });
  });

  it('reports an unfinished run as not finished', () => {
    const outcome = verifyRun({ levelId: 'trust-nothing', replay: [Input.Right, 30], ...versions });

    expect(outcome).toEqual({
      status: 200,
      body: { finished: false, frames: 30, deaths: 0, score: 0, flags: [] },
    });
  });

  it('flags a finished run that repeats one input pattern exactly many times', () => {
    const wobble = Array.from({ length: 12 }, () => [Input.Left, 1, Input.Right, 1]).flat();
    const outcome = verifyRun({
      levelId: 'trust-nothing',
      replay: [...wobble, ...(solution?.replay ?? [])],
      ...versions,
    });

    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ finished: true, flags: ['repetitive-input'] });
  });

  it('never flags a run that did not finish', () => {
    const wobble = Array.from({ length: 12 }, () => [Input.Left, 1, Input.Right, 1]).flat();
    const outcome = verifyRun({ levelId: 'trust-nothing', replay: wobble, ...versions });

    expect(outcome.body).toMatchObject({ finished: false, flags: [] });
  });

  it('answers 404 for an unknown level', () => {
    const outcome = verifyRun({ levelId: 'nope', replay: [], ...versions });

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
    expect(verifyRun(body === null ? body : { ...versions, ...body }).status).toBe(400);
  });

  it.each([
    ['missing simulation version', { levelId: 'trust-nothing', replay: [], levelRevision }],
    [
      'non-integer simulation version',
      { levelId: 'trust-nothing', replay: [], simVersion: '1', levelRevision },
    ],
    ['missing level revision', { levelId: 'trust-nothing', replay: [], simVersion: SIM_VERSION }],
    [
      'non-integer level revision',
      { levelId: 'trust-nothing', replay: [], simVersion: SIM_VERSION, levelRevision: 1.5 },
    ],
  ])('answers 400 for %s', (_name, body) => {
    expect(verifyRun(body).status).toBe(400);
  });

  it('answers 409 for a simulation version it does not run', () => {
    const outcome = verifyRun({
      levelId: 'trust-nothing',
      replay: solution?.replay,
      simVersion: SIM_VERSION + 1,
      levelRevision,
    });

    expect(outcome.status).toBe(409);
  });

  it('answers 409 for a retired level revision', () => {
    const outcome = verifyRun({
      levelId: 'trust-nothing',
      replay: solution?.replay,
      simVersion: SIM_VERSION,
      levelRevision: levelRevision + 1,
    });

    expect(outcome.status).toBe(409);
  });
});
