import type { LevelContent, StageDef } from '../level';
import { block, drop, gap, pop, rise, sky, spikes, stage, trap, wall } from './stage';

const level = (id: string, name: string, stages: StageDef[], maxFrames = 6000): LevelContent => ({
  id,
  name,
  stages,
  maxFrames,
});

/** Levels 11 to 15: dense, long, and mixing everything learned so far. */
export const PACK_3: LevelContent[] = [
  level('needle-garden', 'Needle Garden', [
    stage([spikes(6, 2), spikes(11, 2), pop(14, 18), spikes(22, 2), pop(24, 27)]),
    stage([spikes(5), spikes(8), spikes(11), spikes(14), pop(16, 20, 2), spikes(24, 2)]),
    stage([spikes(5, 2), pop(8, 11, 2), spikes(14, 2), pop(18, 22), spikes(25, 2), pop(27, 29)]),
    stage([
      spikes(4),
      spikes(7, 2),
      pop(10, 13),
      spikes(16, 2),
      pop(18, 22, 2),
      spikes(25),
      spikes(27, 2),
    ]),
  ]),
  level('climb-every-wall', 'Climb Every Wall', [
    stage([block(8, 14, 2, 2), wall(11, 3), spikes(15), pop(19, 23)]),
    stage([block(6, 14, 2, 2), block(9, 12, 2, 4), wall(12, 4), pop(17, 21), drop(23, 26, 2)]),
    stage([
      block(5, 14, 2, 2),
      wall(8, 3),
      spikes(11, 2),
      block(14, 14, 2, 2),
      wall(17, 3),
      pop(21, 25),
    ]),
    stage([
      block(5, 14, 2, 2),
      block(8, 12, 2, 4),
      wall(11, 4),
      gap(14, 3),
      rise(18, 22, 2),
      pop(24, 27),
    ]),
  ]),
  level('bait-and-switch', 'Bait and Switch', [
    stage([spikes(8), drop(7, 11, 2), pop(14, 18), spikes(22)]),
    stage([pop(5, 9), drop(8, 12, 2), pop(13, 17), drop(16, 20, 2), spikes(24)]),
    stage([
      spikes(6, 2),
      drop(5, 10, 2),
      spikes(14),
      rise(13, 17, 2),
      pop(19, 23),
      drop(22, 26, 2),
    ]),
    stage([wall(6, 2), drop(4, 9, 2), wall(14, 2), drop(12, 18, 3), pop(21, 25), spikes(28)]),
  ]),
  level('the-gauntlet', 'The Gauntlet', [
    stage([
      pop(3, 6),
      spikes(9),
      drop(10, 14, 2),
      rise(16, 20, 2),
      sky(19, 23, 13),
      pop(24, 27),
      spikes(29),
    ]),
    stage([
      wall(5, 2),
      pop(7, 11),
      drop(12, 16, 2),
      spikes(19, 2),
      rise(21, 25, 2),
      sky(25, 29, 13),
    ]),
    stage([
      pop(3, 6),
      pop(5, 8),
      drop(9, 13, 2),
      wall(16, 2),
      pop(18, 22),
      rise(23, 27, 2),
      spikes(29),
    ]),
    stage([
      spikes(4),
      pop(6, 9),
      drop(10, 14, 3),
      rise(17, 21, 2),
      sky(20, 24, 12),
      pop(23, 27),
      spikes(29),
    ]),
  ]),
  level(
    'final-exam',
    'Final Exam',
    [
      stage([pop(4, 8), drop(9, 13, 2), wall(16, 2), sky(15, 20, 13), pop(21, 25), spikes(27, 2)]),
      stage([
        block(5, 14, 3, 2),
        block(9, 12, 3, 4),
        trap('add_spikes', { x: 9, y: 9, width: 3, height: 3 }, [[10, 11]]),
        drop(14, 18, 2),
        pop(21, 25),
        rise(24, 28, 2),
      ]),
      stage([gap(6, 3), pop(11, 15), rise(16, 20, 2), drop(23, 27, 2), sky(25, 29, 13)]),
      stage([
        pop(3, 6),
        pop(6, 9),
        drop(8, 12, 2),
        rise(13, 17, 2),
        block(19, 14, 3, 2),
        sky(19, 23, 12),
        drop(24, 27, 2),
        pop(27, 29),
      ]),
    ],
    7200,
  ),
];
