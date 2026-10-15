import { Tile } from '@trust-issues/sim';

export type Appearance = 'air' | 'solid' | 'spike' | 'exit';

/**
 * What a tile looks like, which is not always what it is: hidden tiles are drawn as air, fake
 * tiles as solid ones and fake exits as the exit.
 */
export function appearanceOf(tile: number | undefined): Appearance {
  switch (tile) {
    case Tile.Solid:
    case Tile.Fake:
      return 'solid';
    case Tile.Spike:
      return 'spike';
    case Tile.FakeExit:
      return 'exit';
    default:
      return 'air';
  }
}
