import type { LevelContent } from '../level';
import { drop, gap, pop, rise, sky, spikes, stage, wall } from './stage';
import type { StageDef } from '../level';

const level = (id: string, name: string, stages: StageDef[], maxFrames = 3600): LevelContent => ({
  id,
  name,
  stages,
  maxFrames,
});

/** Levels 1 to 5: one idea at a time, traps reveal themselves at least three tiles ahead. */
export const PACK_1: LevelContent[] = [
  level('trust-nothing', 'Trust Nothing', [
    stage([pop(8, 12), drop(16, 19, 2)]),
    stage([spikes(7), pop(12, 16), drop(20, 24, 2)]),
    stage([drop(6, 9, 2), pop(14, 18), wall(24, 2)]),
  ]),
  level('ground-rules', 'Ground Rules', [
    stage([wall(8, 1), gap(14, 2), spikes(20, 2)]),
    stage([wall(6, 2), gap(11, 3), pop(17, 21), wall(26, 1)]),
    stage([pop(4, 7), drop(10, 13, 2), wall(19, 2), gap(23, 2), pop(26, 29)]),
  ]),
  level('hole-punch', 'Hole Punch', [
    stage([drop(5, 9, 2), drop(13, 17, 2), drop(21, 25, 2)]),
    stage([drop(4, 7, 3), pop(12, 15), drop(18, 22, 2), drop(25, 28, 2)]),
    stage([gap(6, 2), drop(11, 14, 3), pop(18, 21), drop(24, 27, 2)]),
    stage([drop(5, 8, 2), pop(10, 13), pop(15, 17), drop(20, 24, 3)]),
  ]),
  level('spike-season', 'Spike Season', [
    stage([pop(6, 10), pop(13, 17), pop(20, 24)]),
    stage([pop(5, 9, 2), spikes(15), pop(19, 23, 2), pop(26, 29)]),
    stage([spikes(5), pop(8, 12), spikes(15, 2), pop(19, 22), pop(22, 26), wall(28, 1)]),
  ]),
  level('wall-street', 'Wall Street', [
    stage([rise(8, 12, 2), rise(16, 20, 2)]),
    stage([rise(5, 9, 2), gap(13, 2), rise(17, 21, 2), pop(24, 27)]),
    stage([rise(4, 8, 2), rise(10, 14, 2), drop(17, 20, 2), rise(23, 26, 2)]),
    stage([pop(5, 8), rise(9, 13, 2), drop(16, 19, 3), rise(22, 25, 2), sky(24, 28, 12)]),
  ]),
];
