import type { LevelContent, StageDef } from '../level';
import { block, drop, gap, pop, rise, sky, spikes, stage, trap, wall } from './stage';

const level = (id: string, name: string, stages: StageDef[], maxFrames = 4800): LevelContent => ({
  id,
  name,
  stages,
  maxFrames,
});

/** Levels 6 to 10: platforms, ceilings and chains, traps that cover where you land. */
export const PACK_2: LevelContent[] = [
  level('sky-is-falling', 'Sky Is Falling', [
    stage([pop(7, 11), sky(13, 17, 13), sky(19, 23, 13)]),
    stage([sky(5, 9, 13), pop(11, 15), sky(17, 21, 12), drop(22, 26, 2)]),
    stage([pop(4, 8), sky(10, 14, 13), wall(17, 2), sky(15, 21, 12), drop(23, 27, 3)]),
    stage([
      sky(4, 8, 13),
      sky(9, 12, 13),
      pop(14, 18),
      sky(19, 23, 12),
      drop(24, 27, 2),
      pop(27, 29),
    ]),
  ]),
  level('stairway-to-nowhere', 'Stairway to Nowhere', [
    stage(
      [
        block(5, 14, 3, 2),
        block(9, 12, 3, 4),
        block(13, 10, 3, 6),
        block(17, 8, 3, 8),
        trap('add_spikes', { x: 9, y: 9, width: 3, height: 3 }, [[14, 9]]),
      ],
      { end: 18, endY: 7 },
    ),
    stage([
      block(4, 14, 3, 2),
      block(8, 12, 3, 4),
      spikes(14, 3),
      block(15, 12, 3, 4),
      block(19, 14, 3, 2),
      gap(23, 2),
    ]),
    stage([
      block(5, 14, 3, 2),
      block(9, 12, 3, 4),
      block(13, 10, 3, 6),
      block(17, 12, 3, 4),
      block(21, 14, 3, 2),
      trap('add_spikes', { x: 13, y: 7, width: 3, height: 3 }, [[18, 11]]),
      pop(24, 27),
      drop(25, 28, 2),
    ]),
  ]),
  level('low-ceiling', 'Low Ceiling', [
    stage([block(7, 12, 7, 1), spikes(10), pop(15, 19), drop(22, 26, 2)]),
    stage([
      block(6, 12, 5, 1),
      spikes(8),
      pop(13, 17),
      block(19, 12, 6, 1),
      spikes(22),
      pop(26, 29),
    ]),
    stage([
      block(5, 12, 5, 1),
      spikes(7),
      drop(11, 14, 2),
      block(16, 12, 6, 1),
      pop(18, 22),
      spikes(25),
    ]),
  ]),
  level('domino-effect', 'Domino Effect', [
    stage([pop(4, 7), pop(8, 11), pop(12, 15), pop(16, 19), pop(20, 23), pop(24, 27)]),
    stage([pop(4, 7), drop(8, 11, 2), pop(13, 16), drop(17, 20, 2), pop(22, 25), pop(26, 29)]),
    stage([
      rise(4, 8, 2),
      pop(9, 12),
      drop(13, 16, 2),
      rise(18, 22, 2),
      pop(23, 26),
      sky(25, 28, 13),
    ]),
    stage([
      pop(3, 6),
      pop(6, 9),
      pop(9, 12),
      drop(13, 16, 3),
      pop(18, 21),
      pop(21, 24),
      rise(25, 28, 2),
    ]),
  ]),
  level('fake-friends', 'Fake Friends', [
    stage([
      gap(6, 17),
      block(7, 14, 3, 1),
      block(12, 14, 3, 1),
      block(17, 14, 3, 1),
      trap('add_spikes', { x: 7, y: 11, width: 3, height: 3 }, [[13, 13]]),
      trap('add_spikes', { x: 12, y: 11, width: 3, height: 3 }, [[18, 13]]),
    ]),
    stage([
      gap(5, 19),
      block(6, 14, 3, 1),
      block(11, 14, 3, 1),
      block(16, 14, 3, 1),
      block(21, 14, 2, 1),
      trap('remove_tiles', { x: 6, y: 11, width: 3, height: 3 }, [[11, 14]]),
      trap('add_spikes', { x: 16, y: 11, width: 3, height: 3 }, [[21, 13]]),
    ]),
    stage([
      gap(5, 20),
      block(6, 14, 2, 1),
      block(10, 12, 2, 1),
      block(14, 14, 2, 1),
      block(18, 12, 2, 1),
      block(22, 14, 2, 1),
      trap('remove_tiles', { x: 10, y: 9, width: 2, height: 3 }, [[14, 14]]),
      trap('add_spikes', { x: 14, y: 11, width: 2, height: 3 }, [[18, 11]]),
    ]),
  ]),
];
