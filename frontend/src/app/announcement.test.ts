import { describe, expect, it } from 'vitest';
import { finishAnnouncement, stageAnnouncement } from './announcement';

describe('finishAnnouncement', () => {
  it('reads out level, time, deaths and score', () => {
    expect(finishAnnouncement('3. Hole Punch', { frames: 930, deaths: 2, score: 944 })).toBe(
      'Level 3. Hole Punch cleared in 0:15.50 with 2 deaths, 944 points.',
    );
  });

  it('uses the singular for one death', () => {
    expect(
      finishAnnouncement('1. Trust Nothing', { frames: 900, deaths: 1, score: 975 }),
    ).toContain('with 1 death,');
  });
});

describe('stageAnnouncement', () => {
  it('says which stage began', () => {
    expect(stageAnnouncement(1, 4)).toBe('Stage 2 of 4.');
  });
});
