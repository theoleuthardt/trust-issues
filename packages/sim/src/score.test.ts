import { describe, expect, it } from 'vitest';
import { DEATH_PENALTY, MAX_TIME_SCORE, PAR_TIME_SCORE, scoreRun } from './index';

const PAR = 600;

describe('scoreRun', () => {
  it('awards the par score for a par time without deaths', () => {
    expect(scoreRun(PAR, { frames: PAR, deaths: 0 })).toBe(PAR_TIME_SCORE);
  });

  it('scores a time twice as slow as par at half the par score', () => {
    expect(scoreRun(PAR, { frames: PAR * 2, deaths: 0 })).toBe(PAR_TIME_SCORE / 2);
  });

  it('rewards faster times and caps the time score', () => {
    expect(scoreRun(PAR, { frames: PAR / 2, deaths: 0 })).toBe(MAX_TIME_SCORE);
    expect(scoreRun(PAR, { frames: 10, deaths: 0 })).toBe(MAX_TIME_SCORE);
    expect(scoreRun(PAR, { frames: PAR - 60, deaths: 0 })).toBeGreaterThan(PAR_TIME_SCORE);
  });

  it('subtracts a penalty for every death', () => {
    const clean = scoreRun(PAR, { frames: PAR, deaths: 0 });

    expect(scoreRun(PAR, { frames: PAR, deaths: 1 })).toBe(clean - DEATH_PENALTY);
    expect(scoreRun(PAR, { frames: PAR, deaths: 4 })).toBe(clean - 4 * DEATH_PENALTY);
  });

  it('never goes below zero', () => {
    expect(scoreRun(PAR, { frames: PAR * 50, deaths: 100 })).toBe(0);
  });

  it('is a whole number', () => {
    for (const frames of [601, 777, 1234, 4321]) {
      expect(Number.isInteger(scoreRun(PAR, { frames, deaths: 0 }))).toBe(true);
    }
  });

  it('never rewards slower runs or more deaths', () => {
    let previous = Infinity;
    for (let frames = 100; frames <= 3000; frames += 50) {
      const score = scoreRun(PAR, { frames, deaths: 0 });
      expect(score).toBeLessThanOrEqual(previous);
      previous = score;
    }
    expect(scoreRun(PAR, { frames: 700, deaths: 3 })).toBeLessThan(
      scoreRun(PAR, { frames: 700, deaths: 2 }),
    );
  });

  it('rejects a run without frames or a level without par', () => {
    expect(() => scoreRun(PAR, { frames: 0, deaths: 0 })).toThrow(RangeError);
    expect(() => scoreRun(0, { frames: 10, deaths: 0 })).toThrow(RangeError);
  });
});
