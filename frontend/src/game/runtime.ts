import Phaser from 'phaser';
import { PALETTE } from '../theme';
import { GameScene, SCENE_KEY } from './GameScene';

export { GameScene, SCENE_KEY };

/** The view is one screen of 32 by 18 tiles; levels may be larger and scroll within it. */
const VIEW_WIDTH_TILES = 32;
const VIEW_HEIGHT_TILES = 18;
const TILE_PX = 32;

/**
 * Entry of the lazily loaded game chunk: Phaser and the scene live behind this module, so
 * the menus and everything else load without them.
 */
export function createGame(): Phaser.Game {
  const created = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_WIDTH_TILES * TILE_PX,
    height: VIEW_HEIGHT_TILES * TILE_PX,
    backgroundColor: PALETTE.paper,
    banner: false,
    audio: { noAudio: true },
    fps: { smoothStep: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
  });
  created.scene.add(SCENE_KEY, GameScene, false);
  created.canvas.setAttribute('role', 'img');
  created.canvas.setAttribute('aria-label', 'The game. Progress is announced as text.');
  return created;
}
