import { describe, expect, it } from 'vitest';
import { submissionText } from './submission';

describe('submissionText', () => {
  it('shows rank and score', () => {
    expect(
      submissionText({ frames: 900, deaths: 0, score: 1000, personalBest: false, rank: 7 }),
    ).toBe('Rank 7 · 1000 pts');
  });

  it('calls out a new personal best', () => {
    expect(
      submissionText({ frames: 900, deaths: 0, score: 1000, personalBest: true, rank: 1 }),
    ).toBe('New personal best · rank 1 · 1000 pts');
  });
});
