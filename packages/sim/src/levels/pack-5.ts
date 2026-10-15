import type { LevelContent, StageDef } from '../level';
import {
  block,
  drop,
  fake,
  fakeExit,
  floatZone,
  gap,
  hidden,
  invertZone,
  movingPlatform,
  pop,
  rise,
  timed,
  spikes,
  stage,
  trap,
  wall,
} from './stage';

const level = (id: string, name: string, stages: StageDef[], maxFrames = 7200): LevelContent => ({
  id,
  name,
  stages,
  maxFrames,
});

/**
 * Levels 21 to 25: walls you can walk through, floors that are not there, doors that kill.
 * Level 26 adds traps with a delay and traps that put themselves back, level 27 zones that
 * swap the controls or take the weight off, level 28 platforms that carry you over the gaps.
 */
export const PACK_5: LevelContent[] = [
  level('paper-walls', 'Paper Walls', [
    stage([fake(9, 14, 1, 2), spikes(14, 2)]),
    stage([wall(6, 2), fake(12, 13, 1, 3), pop(15, 19, 2), fake(24, 14, 1, 2)]),
    stage([fake(7, 14, 1, 2), fake(13, 14, 1, 2), wall(19, 2), gap(24, 2), pop(27, 29)]),
  ]),
  level('invisible-man', 'Invisible Man', [
    stage([gap(9, 6), hidden(9, 16, 6)]),
    stage([gap(7, 4), hidden(7, 16, 4), gap(14, 6), hidden(14, 16, 6), pop(23, 26)]),
    stage([gap(6, 5), hidden(6, 16, 5), rise(13, 16, 2), gap(19, 7), hidden(19, 16, 7)]),
  ]),
  level('wrong-door', 'Wrong Door', [
    stage([fakeExit(14), spikes(22)]),
    stage([block(26, 14, 4, 1), fakeExit(20), fakeExit(24)], { end: 28, endY: 13 }),
    stage([pop(5, 9), fakeExit(15), drop(18, 21, 2), fakeExit(26), fakeExit(28)]),
  ]),
  level('floor-is-fake', 'The Floor Is Fake', [
    stage([fake(10, 16, 4, 2), spikes(18)]),
    stage([wall(5, 1), fake(11, 16, 3, 2), pop(16, 20, 2), fake(24, 16, 3, 2)]),
    stage([fake(7, 16, 3, 2), drop(12, 15, 2), fake(19, 16, 3, 2), wall(26, 2)]),
    stage([gap(6, 3), fake(11, 16, 3, 2), pop(16, 19), fake(22, 16, 4, 2), spikes(28)]),
  ]),
  level('everything-lies', 'Everything Lies', [
    stage([fake(8, 14, 1, 2), gap(11, 4), hidden(11, 16, 4), fakeExit(19)]),
    stage([fake(7, 16, 3, 2), gap(13, 5), hidden(13, 16, 5), fake(21, 14, 1, 2), fakeExit(26)]),
    stage(
      [
        block(5, 14, 3, 1),
        hidden(9, 12, 3, 1),
        block(13, 10, 3, 1),
        fake(16, 10, 2, 1),
        block(20, 10, 3, 1),
        trap('add_spikes', { x: 9, y: 9, width: 3, height: 3 }, [[14, 9]]),
      ],
      { end: 21, endY: 9 },
    ),
    stage([
      fake(6, 14, 1, 2),
      gap(9, 3),
      hidden(9, 16, 3),
      pop(14, 17),
      fakeExit(20),
      fake(23, 16, 3, 2),
      fakeExit(28),
    ]),
  ]),
  level('second-thoughts', 'Second Thoughts', [
    stage([timed(pop(8, 11), { delay: 25 }), timed(drop(16, 19, 2), { delay: 20 })]),
    stage([
      timed(pop(6, 9, 2), { delay: 20, rearm: 90 }),
      timed(drop(14, 17, 3), { delay: 15, rearm: 120 }),
    ]),
    stage([
      timed(pop(5, 8), { delay: 22 }),
      timed(rise(11, 14, 2), { delay: 10, rearm: 80 }),
      timed(drop(18, 21, 2), { delay: 15, rearm: 100 }),
      pop(24, 27),
    ]),
  ]),
  level('looking-glass', 'Looking Glass', [
    stage([invertZone(8, 8, 6, 8), spikes(10), gap(17, 2)]),
    stage([floatZone(6, 0, 8, 16), block(14, 12, 4, 1), gap(15, 4)], { end: 29 }),
    stage([invertZone(5, 8, 5, 8), pop(7, 12), floatZone(16, 0, 7, 16), gap(18, 5), wall(26, 2)]),
  ]),
  level('ferryman', 'The Ferryman', [
    stage([gap(8, 8), movingPlatform(7, 14, 3, { axis: 'x', distance: 5, period: 80 })]),
    stage([
      gap(7, 9),
      movingPlatform(6, 14, 3, { axis: 'x', distance: 6, period: 100 }),
      pop(25, 28),
    ]),
    stage([
      gap(6, 8),
      movingPlatform(5, 14, 3, { axis: 'x', distance: 5, period: 80 }),
      gap(17, 7),
      movingPlatform(16, 14, 3, { axis: 'x', distance: 5, period: 80, phase: 40 }),
      pop(27, 29),
    ]),
  ]),
];
