import Phaser from 'phaser';
import { LEVELS } from '@trust-issues/sim';
import { ProgressStore, firstOpenIndex, levelCards } from './app/progress';
import { levelSelect, mainMenu, titleScreen } from './app/screens';
import { GameScene, SCENE_KEY } from './game/GameScene';
import type { RunFinishedEvent } from './game/GameScene';
import { startIndex } from './game/progress';
import { InputState } from './input/InputState';
import './style.css';
import { PALETTE, applyPaletteToCss } from './theme';
import { mountTouchControls } from './touch/TouchControls';
import { shouldShowTouchControls } from './touch/touchMode';

const LEVEL_WIDTH_TILES = 32;
const LEVEL_HEIGHT_TILES = 18;
const TILE_PX = 32;

type Screen = 'title' | 'menu' | 'levels' | 'game';

applyPaletteToCss(document.documentElement);

if (LEVELS.length === 0) throw new Error('no levels defined');

const ui = document.getElementById('ui');
if (!ui) throw new Error('missing #ui container');

const input = new InputState();
const store = new ProgressStore(browserStorage());
let game: Phaser.Game | undefined;

const setScreen = (screen: Screen) => {
  document.body.dataset.screen = screen;
};

window.addEventListener('keydown', (event) => {
  if (document.body.dataset.screen !== 'game' || !InputState.isBound(event.code)) return;
  event.preventDefault();
  input.setKey(event.code, true);
});
window.addEventListener('keyup', (event) => {
  input.setKey(event.code, false);
});
window.addEventListener('blur', () => input.reset());

const coarse = window.matchMedia('(pointer: coarse)').matches;
if (shouldShowTouchControls(window.location.search, coarse)) {
  mountTouchControls(document.body, input, leaveLevel);
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined };
  }
}

function createGame(): Phaser.Game {
  const created = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: LEVEL_WIDTH_TILES * TILE_PX,
    height: LEVEL_HEIGHT_TILES * TILE_PX,
    backgroundColor: PALETTE.paper,
    banner: false,
    audio: { noAudio: true },
    fps: { smoothStep: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
  });
  created.scene.add(SCENE_KEY, GameScene, false);
  return created;
}

function show(screen: Screen, element: HTMLElement): void {
  setScreen(screen);
  ui?.replaceChildren(element);
  if (ui) ui.hidden = false;
}

function showTitle(): void {
  show('title', titleScreen(showMenu));
}

function showMenu(): void {
  const progress = store.load();
  const next = firstOpenIndex(LEVELS, progress);
  const started = Object.keys(progress).length > 0;
  show(
    'menu',
    mainMenu({
      continueLabel: started ? `Continue · Level ${next + 1}` : 'Start',
      onContinue: () => startLevel(next),
      onLevels: showLevels,
      onBack: showTitle,
    }),
  );
}

function showLevels(): void {
  show('levels', levelSelect(levelCards(LEVELS, store.load()), startLevel, showMenu));
}

function startLevel(index: number): void {
  setScreen('game');
  if (ui) {
    ui.hidden = true;
    ui.replaceChildren();
  }
  game ??= createGame();
  game.scene.start(SCENE_KEY, {
    levels: LEVELS,
    startIndex: index,
    input,
    onFinished: (event: RunFinishedEvent) => {
      store.record(event.levelId, {
        score: event.score,
        frames: event.frames,
        deaths: event.deaths,
      });
    },
    onExit: leaveLevel,
  });
}

function leaveLevel(): void {
  input.reset();
  game?.scene.stop(SCENE_KEY);
  showLevels();
}

if (new URLSearchParams(window.location.search).has('level')) {
  startLevel(startIndex(LEVELS, window.location.search));
} else {
  showTitle();
}
