import { describe, expect, it } from 'vitest';
import { Input, LEVELS, SIM_VERSION, encodeReplay } from '@trust-issues/sim';
import { ghostInputs } from './ghost';

const level = LEVELS[0];
if (!level) throw new Error('no level');
const record = (extra: object) => ({ score: 900, frames: 3, deaths: 0, ...extra });

describe('ghostInputs', () => {
  it('is the best run of the player when it has a replay', () => {
    const replay = encodeReplay([Input.Right, Input.Right, Input.Jump]);

    expect(ghostInputs(record({ replay }), level)).toEqual([Input.Right, Input.Right, Input.Jump]);
  });

  it('treats a run stored before versions were recorded as version 1', () => {
    const replay = encodeReplay([Input.Right]);

    expect(ghostInputs(record({ replay }), level)).toEqual([Input.Right]);
  });

  it('has no ghost without a record or a replay', () => {
    expect(ghostInputs(undefined, level)).toBeUndefined();
    expect(ghostInputs(record({}), level)).toBeUndefined();
  });

  it('has no ghost for a run of another version', () => {
    const replay = encodeReplay([Input.Right]);
    const versions = { simVersion: SIM_VERSION + 1, levelRevision: level.revision };

    expect(ghostInputs(record({ replay, versions }), level)).toBeUndefined();
  });

  it('has no ghost for a damaged replay', () => {
    expect(ghostInputs(record({ replay: [9, 2] }), level)).toBeUndefined();
  });
});
