import Phaser from 'phaser';
import { LEVELS } from '@trust-issues/sim';
import { ApiClient, ApiError } from './api/client';
import type { AuthMode } from './api/credentials';
import { validateCredentials } from './api/credentials';
import { SessionStore } from './api/session';
import { syncAccount } from './app/accountSync';
import { ProgressStore, accountKey, firstOpenIndex, levelCards } from './app/progress';
import { finishAnnouncement, stageAnnouncement } from './app/announcement';
import { escapeAction } from './app/escape';
import { leaderboardRows } from './app/leaderboard';
import {
  accountScreen,
  authScreen,
  leaderboardScreen,
  levelSelect,
  mainMenu,
  pauseScreen,
  titleScreen,
} from './app/screens';
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

type Screen = 'title' | 'auth' | 'menu' | 'levels' | 'board' | 'account' | 'pause' | 'game';

applyPaletteToCss(document.documentElement);

if (LEVELS.length === 0) throw new Error('no levels defined');

const ui = document.getElementById('ui');
if (!ui) throw new Error('missing #ui container');

const input = new InputState();
const storage = browserStorage();
const guestStore = new ProgressStore(storage);
const accountStores = new Map<string, ProgressStore>();
const sessions = new SessionStore(storage);
const api = new ApiClient(
  (...args) => window.fetch(...args),
  () => sessions.current()?.token,
);
let game: Phaser.Game | undefined;

let navigation = 0;

function announce(text: string): void {
  const region = document.getElementById('status');
  if (region) region.textContent = text;
}

const setScreen = (screen: Screen) => {
  navigation += 1;
  document.body.dataset.screen = screen;
};

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    const action = escapeAction(document.body.dataset.screen, event.repeat);
    if (action === 'pause') pauseGame();
    if (action === 'resume') resumeGame();
    return;
  }
  if (document.body.dataset.screen !== 'game' || !InputState.isBound(event.code)) return;
  event.preventDefault();
  input.setKey(event.code, true);
});
window.addEventListener('keyup', (event) => {
  input.setKey(event.code, false);
});
window.addEventListener('blur', () => {
  input.reset();
  pauseGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

const coarse = window.matchMedia('(pointer: coarse)').matches;
if (shouldShowTouchControls(window.location.search, coarse)) {
  mountTouchControls(document.body, input, pauseGame);
}

function browserStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

function storeFor(username: string): ProgressStore {
  const key = accountKey(username);
  let store = accountStores.get(key);
  if (!store) {
    store = new ProgressStore(storage, key);
    accountStores.set(key, store);
  }
  return store;
}

/** The progress of the signed-in player, or the guest progress of this browser. */
function currentStore(): ProgressStore {
  const username = sessions.current()?.username;
  return username ? storeFor(username) : guestStore;
}

async function syncProgress(): Promise<void> {
  const username = sessions.current()?.username;
  if (!username) return;
  await syncAccount({
    fetchServer: () => api.progress(),
    submit: (levelId, replay) => api.submitRun(levelId, replay),
    guest: guestStore,
    account: storeFor(username),
  });
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
          await syncProgress();
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
  const progress = currentStore().load();
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
      onLeaderboards: showLeaderboardPicker,
      onAccount: account ? showAccount : undefined,
      onBack: showTitle,
    }),
  );
}

function showLevels(): void {
  show('levels', levelSelect(levelCards(LEVELS, currentStore().load()), startLevel, showMenu));
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

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong.';
}

function showAccount(): void {
  const username = sessions.current()?.username;
  if (!username) {
    showTitle();
    return;
  }
  show(
    'account',
    accountScreen({
      username,
      onBack: showMenu,
      onChangePassword: async (current, next) => {
        try {
          sessions.save(await api.changePassword(current, next), username);
          return 'Password changed. Other devices were signed out.';
        } catch (error) {
          return messageOf(error);
        }
      },
      onLogoutAll: async () => {
        try {
          await api.logoutAll();
          sessions.clear();
          showTitle();
          return undefined;
        } catch (error) {
          return messageOf(error);
        }
      },
      onDelete: async (password) => {
        try {
          await api.deleteAccount(password);
          storeFor(username).clear();
          sessions.clear();
          showTitle();
          return undefined;
        } catch (error) {
          return messageOf(error);
        }
      },
    }),
  );
}

function showLeaderboardPicker(): void {
  const cards = levelCards(LEVELS, currentStore().load()).map((card) =>
    card.status === 'locked' ? { ...card, status: 'open' as const } : card,
  );
  show('levels', levelSelect(cards, showLeaderboard, showMenu, 'Leaderboards'));
}

function showLeaderboard(index: number, back: () => void = showLeaderboardPicker): void {
  const level = LEVELS[index];
  if (!level) return;
  const title = `${index + 1}. ${level.name}`;
  show('board', leaderboardScreen({ title, state: { kind: 'loading' }, onBack: back }));
  const requested = navigation;
  api
    .leaderboard(level.id)
    .then((entries) => {
      if (navigation !== requested) return;
      const rows = leaderboardRows(entries, sessions.current()?.username);
      show('board', leaderboardScreen({ title, state: { kind: 'ready', rows }, onBack: back }));
    })
    .catch((error: unknown) => {
      if (navigation !== requested) return;
      const message = error instanceof ApiError ? error.message : 'Something went wrong.';
      show('board', leaderboardScreen({ title, state: { kind: 'error', message }, onBack: back }));
    });
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
    onStage: (stage: number, total: number) => announce(stageAnnouncement(stage, total)),
    onFinished: (event: RunFinishedEvent) => {
      const position = LEVELS.findIndex((level) => level.id === event.levelId);
      announce(
        finishAnnouncement(`${position + 1}. ${LEVELS[position]?.name ?? event.levelId}`, event),
      );
      currentStore().record(event.levelId, {
        score: event.score,
        frames: event.frames,
        deaths: event.deaths,
        replay: event.replay,
      });
      void submitter.send(event);
    },
    onRetrySubmit: () => submitter.retry(),
    onShowLeaderboard: (levelId: string) => {
      const index = LEVELS.findIndex((level) => level.id === levelId);
      input.reset();
      game?.scene.stop(SCENE_KEY);
      showLeaderboard(index, showLevels);
    },
  });
}

function pauseGame(): void {
  if (document.body.dataset.screen !== 'game' || !game) return;
  const scene = game.scene.getScene(SCENE_KEY);
  if (!(scene instanceof GameScene)) return;
  input.reset();
  game.scene.pause(SCENE_KEY);
  show(
    'pause',
    pauseScreen({
      title: scene.title,
      onResume: resumeGame,
      onRestart: () => {
        resumeGame();
        scene.restartRun();
      },
      onLevels: leaveLevel,
    }),
  );
}

function resumeGame(): void {
  setScreen('game');
  if (ui) {
    ui.hidden = true;
    ui.replaceChildren();
  }
  game?.scene.resume(SCENE_KEY);
}

function leaveLevel(): void {
  input.reset();
  game?.scene.stop(SCENE_KEY);
  showLevels();
}

void syncProgress();

if (new URLSearchParams(window.location.search).has('level')) {
  startLevel(startIndex(LEVELS, window.location.search));
} else {
  showTitle();
}
