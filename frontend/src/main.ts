import Phaser from 'phaser';
import { LEVELS } from '@trust-issues/sim';
import { ApiClient, ApiError } from './api/client';
import type { AuthMode } from './api/credentials';
import { validateCredentials } from './api/credentials';
import { SessionStore } from './api/session';
import { ProgressStore, firstOpenIndex, levelCards } from './app/progress';
import { authScreen, levelSelect, mainMenu, titleScreen } from './app/screens';
import { memoryStorage } from './app/storage';
import { RunSubmitter } from './app/submitter';
import type { StorageLike } from './app/storage';
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

type Screen = 'title' | 'auth' | 'menu' | 'levels' | 'game';

applyPaletteToCss(document.documentElement);

if (LEVELS.length === 0) throw new Error('no levels defined');

const ui = document.getElementById('ui');
if (!ui) throw new Error('missing #ui container');

const input = new InputState();
const storage = browserStorage();
const store = new ProgressStore(storage);
const sessions = new SessionStore(storage);
const api = new ApiClient(
  (...args) => window.fetch(...args),
  () => sessions.current()?.token,
);
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

function browserStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return memoryStorage();
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
  element.querySelector<HTMLElement>('input, button:not(:disabled)')?.focus();
}

function showTitle(): void {
  show(
    'title',
    titleScreen({
      signedInAs: sessions.current()?.username,
      onPlay: showMenu,
      onSignIn: () => showAuth('login'),
      onRegister: () => showAuth('register'),
      onSignOut: () => {
        sessions.clear();
        showTitle();
      },
    }),
  );
}

function showAuth(mode: AuthMode, notice?: string): void {
  show(
    'auth',
    authScreen({
      mode,
      notice,
      onSwitchMode: () => showAuth(mode === 'login' ? 'register' : 'login'),
      onBack: showTitle,
      onSubmit: async (username, password) => {
        const problem = validateCredentials(mode, username, password);
        if (problem) return problem;
        const name = username.trim();
        let registered = false;
        try {
          if (mode === 'register') {
            await api.register(name, password);
            registered = true;
          }
          sessions.save(await api.login(name, password), name);
          showMenu();
          return undefined;
        } catch (error) {
          if (registered) {
            showAuth('login', 'Your account was created, but signing in failed. Please sign in.');
            return undefined;
          }
          return error instanceof ApiError ? error.message : 'Something went wrong.';
        }
      },
    }),
  );
}

function showMenu(): void {
  const progress = store.load();
  const next = firstOpenIndex(LEVELS, progress);
  const started = Object.keys(progress).length > 0;
  const account = sessions.current();
  show(
    'menu',
    mainMenu({
      accountLine: account ? `Signed in as ${account.username}` : 'Playing as guest',
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

const submitter = new RunSubmitter({
  signedIn: () => sessions.current() !== undefined,
  submit: (levelId, replay) => api.submitRun(levelId, replay),
  signOut: () => sessions.clear(),
  setStatus: (text) => {
    if (!game?.scene.isActive(SCENE_KEY)) return;
    const scene = game.scene.getScene(SCENE_KEY);
    if (scene instanceof GameScene) scene.setStatus(text);
  },
});

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
      void submitter.send(event);
    },
    onRetrySubmit: () => submitter.retry(),
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
