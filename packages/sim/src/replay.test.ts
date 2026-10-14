import { describe, expect, it } from 'vitest';
import { Input, MAX_RUN_LENGTH, ReplayError, decodeReplay, encodeReplay } from './index';

describe('encodeReplay', () => {
  it('run-length encodes consecutive identical inputs as mask/count pairs', () => {
    const inputs = [Input.Right, Input.Right, Input.Right, 0, 0, Input.Right | Input.Jump];

    expect(encodeReplay(inputs)).toEqual([2, 3, 0, 2, 6, 1]);
  });

  it('encodes an empty run as an empty replay', () => {
    expect(encodeReplay([])).toEqual([]);
  });

  it('splits runs longer than the maximum run length', () => {
    const inputs = new Array<number>(MAX_RUN_LENGTH + 5).fill(Input.Left);

    expect(encodeReplay(inputs)).toEqual([Input.Left, MAX_RUN_LENGTH, Input.Left, 5]);
  });
});

describe('decodeReplay', () => {
  it('round-trips with encodeReplay', () => {
    const inputs = [0, 0, 1, 1, 1, 2, 6, 6, 4, 0];

    expect(decodeReplay(encodeReplay(inputs), 100)).toEqual(inputs);
  });

  it('accepts an empty replay', () => {
    expect(decodeReplay([], 100)).toEqual([]);
  });

  it('rejects an odd number of values', () => {
    expect(() => decodeReplay([2, 3, 1], 100)).toThrow(ReplayError);
  });

  it('rejects input masks outside the valid bit set', () => {
    expect(() => decodeReplay([8, 1], 100)).toThrow(ReplayError);
    expect(() => decodeReplay([-1, 1], 100)).toThrow(ReplayError);
  });

  it('rejects non-integer values', () => {
    expect(() => decodeReplay([1.5, 1], 100)).toThrow(ReplayError);
    expect(() => decodeReplay([1, 1.5], 100)).toThrow(ReplayError);
  });

  it('rejects counts outside 1..MAX_RUN_LENGTH', () => {
    expect(() => decodeReplay([1, 0], 100)).toThrow(ReplayError);
    expect(() => decodeReplay([1, MAX_RUN_LENGTH + 1], MAX_RUN_LENGTH * 2)).toThrow(ReplayError);
  });

  it('rejects replays longer than the level allows', () => {
    expect(() => decodeReplay([1, 60, 2, 41], 100)).toThrow(ReplayError);
    expect(decodeReplay([1, 60, 2, 40], 100)).toHaveLength(100);
  });
});
