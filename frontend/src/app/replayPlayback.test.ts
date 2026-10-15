import { describe, expect, it } from 'vitest';
import { Input, LEVELS, SIM_VERSION, encodeReplay } from '@trust-issues/sim';
import { ReplayCursor, SPEEDS, faster, playableInputs, slower } from './replayPlayback';

const level = LEVELS[0];
if (!level) throw new Error('no level');
const current = { simVersion: SIM_VERSION, levelRevision: level.revision };

describe('speeds', () => {
  it('steps through the speed list and stops at its ends', () => {
    expect(faster(1)).toBe(2);
    expect(faster(4)).toBe(4);
    expect(slower(1)).toBe(0.5);
    expect(slower(0.25)).toBe(0.25);
  });

  it('knows normal speed', () => {
    expect(SPEEDS).toContain(1);
  });

  it('treats an unknown speed as normal speed', () => {
    expect(faster(3)).toBe(2);
    expect(slower(3)).toBe(0.5);
  });
});

describe('ReplayCursor', () => {
  it('hands out one input per tick and then stands still', () => {
    const cursor = new ReplayCursor([Input.Right, Input.Right, Input.Jump]);

    expect([cursor.next(), cursor.next(), cursor.next()]).toEqual([
      Input.Right,
      Input.Right,
      Input.Jump,
    ]);
    expect(cursor.done).toBe(true);
    expect(cursor.next()).toBe(0);
  });

  it('is not done before the last input was handed out', () => {
    const cursor = new ReplayCursor([Input.Left]);

    expect(cursor.done).toBe(false);
  });

  it('starts over', () => {
    const cursor = new ReplayCursor([Input.Left, Input.Right]);
    cursor.next();
    cursor.next();

    cursor.reset();

    expect(cursor.done).toBe(false);
    expect(cursor.next()).toBe(Input.Left);
  });
});

describe('playableInputs', () => {
  const replay = encodeReplay([Input.Right, Input.Right, Input.Jump]);

  it('expands a replay recorded with the versions of this build', () => {
    expect(playableInputs(level, replay, current)).toEqual({
      ok: true,
      inputs: [Input.Right, Input.Right, Input.Jump],
    });
  });

  it('refuses a replay of another simulation version or level revision', () => {
    expect(
      playableInputs(level, replay, { ...current, simVersion: SIM_VERSION + 1 }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      playableInputs(level, replay, { ...current, levelRevision: level.revision + 1 }),
    ).toMatchObject({ ok: false });
  });

  it('refuses a damaged replay instead of throwing', () => {
    expect(playableInputs(level, [9, 3], current)).toMatchObject({ ok: false });
    expect(playableInputs(level, [2], current)).toMatchObject({ ok: false });
  });

  it('refuses a replay longer than the level allows', () => {
    expect(playableInputs(level, [Input.Right, level.maxFrames + 1], current)).toMatchObject({
      ok: false,
    });
  });
});
