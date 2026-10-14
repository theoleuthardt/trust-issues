import type { LevelContent, StageDef } from '../level';
import { block, drop, gap, pop, rise, sky, spikes, stage, trap, wall } from './stage';

const level = (id: string, name: string, stages: StageDef[], maxFrames = 7200): LevelContent => ({
  id,
  name,
  stages,
  maxFrames,
});

/** Levels 16 to 20: towers, narrow ledges and traps that go off while you are in the air. */
export const PACK_4: LevelContent[] = [
  level('vertigo', 'Vertigo', [
    stage(
      [
        block(4, 14, 3, 2),
        block(8, 12, 3, 4),
        block(12, 10, 3, 6),
        block(16, 8, 3, 8),
        block(20, 6, 3, 10),
      ],
      { end: 21, endY: 5 },
    ),
    stage(
      [
        block(4, 14, 3, 2),
        spikes(5, 1, 13),
        block(8, 12, 3, 4),
        spikes(9, 1, 11),
        block(12, 10, 3, 6),
        spikes(13, 1, 9),
        block(16, 8, 3, 8),
      ],
      { end: 18, endY: 7 },
    ),
    stage(
      [
        block(4, 14, 3, 2),
        block(8, 12, 3, 4),
        block(12, 10, 3, 6),
        trap('remove_tiles', { x: 8, y: 9, width: 3, height: 3 }, [
          [4, 14],
          [5, 14],
          [6, 14],
        ]),
        block(16, 8, 3, 8),
        trap('add_spikes', { x: 12, y: 7, width: 3, height: 3 }, [[17, 7]]),
      ],
      { end: 18, endY: 7 },
    ),
    stage(
      [
        block(3, 14, 2, 2),
        block(6, 12, 2, 4),
        block(9, 10, 2, 6),
        block(12, 8, 3, 8),
        block(18, 8, 2, 1),
        block(23, 8, 2, 1),
        block(28, 8, 4, 8),
        trap('add_spikes', { x: 12, y: 5, width: 3, height: 3 }, [[19, 7]]),
      ],
      { end: 30, endY: 7 },
    ),
  ]),
  level('narrow-ledges', 'Narrow Ledges', [
    stage([gap(5, 22), block(7, 14), block(11, 14), block(15, 14), block(19, 14), block(23, 14)]),
    stage([gap(5, 22), block(7, 14), block(11, 13), block(15, 14), block(19, 12), block(23, 14)]),
    stage([
      gap(5, 22),
      block(6, 14, 2, 1),
      block(11, 14, 2, 1),
      block(16, 14, 2, 1),
      block(21, 14, 2, 1),
      trap('add_spikes', { x: 6, y: 11, width: 2, height: 3 }, [[11, 13]]),
      trap('add_spikes', { x: 11, y: 11, width: 2, height: 3 }, [[17, 13]]),
      trap('add_spikes', { x: 16, y: 11, width: 2, height: 3 }, [[21, 13]]),
    ]),
  ]),
  level('mind-games', 'Mind Games', [
    stage([
      spikes(8, 2),
      trap('add_spikes', { x: 9, y: 11, width: 2, height: 3 }, [
        [12, 15],
        [13, 15],
      ]),
      pop(18, 22),
    ]),
    stage([
      spikes(7),
      trap('add_spikes', { x: 7, y: 11, width: 2, height: 3 }, [[11, 15]]),
      spikes(14, 2),
      trap('add_spikes', { x: 14, y: 11, width: 2, height: 3 }, [[18, 15]]),
      drop(21, 25, 2),
    ]),
    stage([
      wall(7, 2),
      trap('add_spikes', { x: 7, y: 11, width: 2, height: 3 }, [
        [10, 15],
        [11, 15],
      ]),
      wall(15, 2),
      trap('remove_tiles', { x: 15, y: 11, width: 2, height: 3 }, [
        [18, 16],
        [18, 17],
        [19, 16],
        [19, 17],
      ]),
      pop(22, 26),
    ]),
    stage([
      spikes(5),
      trap('add_spikes', { x: 5, y: 11, width: 2, height: 3 }, [[9, 15]]),
      wall(12, 2),
      trap('add_spikes', { x: 12, y: 11, width: 2, height: 3 }, [[15, 15]]),
      spikes(18, 2),
      trap('remove_tiles', { x: 18, y: 11, width: 2, height: 3 }, [
        [22, 16],
        [22, 17],
        [23, 16],
        [23, 17],
      ]),
      pop(26, 29),
    ]),
  ]),
  level('tunnel-vision', 'Tunnel Vision', [
    stage([block(3, 12, 26, 1), spikes(7), pop(10, 14), spikes(18), pop(22, 26)]),
    stage([block(3, 12, 26, 1), pop(5, 9), spikes(12), pop(16, 20), drop(22, 26, 2)]),
    stage([
      block(3, 12, 12, 1),
      spikes(6),
      pop(8, 12),
      block(17, 12, 12, 1),
      spikes(20),
      pop(24, 27),
    ]),
  ]),
  level(
    'trust-issues',
    'Trust Issues',
    [
      stage([
        pop(4, 8),
        spikes(11, 2),
        drop(14, 18, 2),
        rise(20, 24, 2),
        sky(23, 27, 13),
        spikes(29),
      ]),
      stage([
        block(4, 14, 3, 2),
        block(8, 12, 3, 4),
        trap('add_spikes', { x: 8, y: 9, width: 3, height: 3 }, [[9, 11]]),
        drop(13, 17, 2),
        block(20, 14, 3, 2),
        pop(24, 27),
      ]),
      stage([
        block(3, 12, 14, 1),
        spikes(6),
        pop(9, 13),
        gap(18, 3),
        trap('add_spikes', { x: 17, y: 11, width: 2, height: 3 }, [[22, 15]]),
        rise(24, 27, 2),
      ]),
      stage([
        spikes(4),
        trap('add_spikes', { x: 4, y: 11, width: 2, height: 3 }, [[8, 15]]),
        pop(10, 14),
        rise(15, 19, 2),
        drop(21, 25, 3),
        spikes(28),
      ]),
    ],
    9000,
  ),
];
