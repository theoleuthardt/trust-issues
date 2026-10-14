import Phaser from 'phaser';
import { LEVELS } from '@trust-issues/sim';
import { GameScene, SCENE_KEY } from './game/GameScene';
import { InputState } from './input/InputState';
import './style.css';
import { PALETTE, applyPaletteToCss } from './theme';
import { mountTouchControls } from './touch/TouchControls';
import { shouldShowTouchControls } from './touch/touchMode';

const LEVEL_WIDTH_TILES = 32;
const LEVEL_HEIGHT_TILES = 18;
const TILE_PX = 32;

applyPaletteToCss(document.documentElement);

const level = LEVELS[0];
if (!level) throw new Error('no levels defined');

const input = new InputState();

window.addEventListener('keydown', (event) => {
  if (!InputState.isBound(event.code)) return;
  event.preventDefault();
  input.setKey(event.code, true);
});
window.addEventListener('keyup', (event) => {
  input.setKey(event.code, false);
});
window.addEventListener('blur', () => input.reset());

const coarse = window.matchMedia('(pointer: coarse)').matches;
if (shouldShowTouchControls(window.location.search, coarse)) {
  mountTouchControls(document.body, input);
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: LEVEL_WIDTH_TILES * TILE_PX,
  height: LEVEL_HEIGHT_TILES * TILE_PX,
  backgroundColor: PALETTE.paper,
  banner: false,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [],
});
game.scene.add(SCENE_KEY, GameScene, true, { level, input });
