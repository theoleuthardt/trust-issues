import type Phaser from 'phaser';
import type * as RuntimeModule from './game/runtime';
import { LEVELS } from '@trust-issues/sim';
import { ApiClient, ApiError } from './api/client';
import type { AuthMode } from './api/credentials';
import { validateCredentials } from './api/credentials';
import { SessionStore } from './api/session';
import { syncAccount } from './app/accountSync';
import { SoundBoard } from './audio/SoundBoard';
import type { AudioLike } from './audio/SoundBoard';
import { ghostInputs } from './app/ghost';
import { SettingsStore, bindingsOf, rebind, resetKeys } from './app/settings';
import type { Settings } from './app/settings';
import { GhostPreference } from './app/ghostPreference';
import { ProgressStore, accountKey, firstOpenIndex, levelCards } from './app/progress';
import { finishAnnouncement, stageAnnouncement } from './app/announcement';
import { escapeAction } from './app/escape';
import { leaderboardRows } from './app/leaderboard';
import { playableInputs } from './app/replayPlayback';
import {
  accountScreen,
  authScreen,
  leaderboardScreen,
  levelSelect,
  loadErrorScreen,
  mainMenu,
  pauseScreen,
  settingsScreen,
  titleScreen,
} from './app/screens';
import { memoryStorage } from './app/storage';
import { RunSubmitter } from './app/submitter';
import type { StorageLike } from './app/storage';
import type { SoundName } from './audio/effects';
import type { GameScene, RunFinishedEvent } from './game/GameScene';
import { formatTime } from './format';
import { startIndex } from './game/progress';
import { InputState } from './input/InputState';
import './style.css';
import { applyPaletteToCss } from './theme';
import { mountTouchControls } from './touch/TouchControls';
import { shouldShowTouchControls } from './touch/touchMode';

type GameRuntime = typeof RuntimeModule;

type Screen =
  | 'title'
  | 'auth'
  | 'menu'
  | 'levels'
  | 'board'
  | 'account'
  | 'settings'
  | 'pause'
  | 'game'
  | 'replay';

applyPaletteToCss(document.documentElement);

if (LEVELS.length === 0) throw new Error('no levels defined');

const ui = document.getElementById('ui');
if (!ui) throw new Error('missing #ui container');

const input = new InputState();
const storage = browserStorage();
const guestStore = new ProgressStore(storage);
const accountStores = new Map<string, ProgressStore>();
const sessions = new SessionStore(storage);
const ghostPreference = new GhostPreference(storage);
const settings = new SettingsStore(
  storage,
  window.matchMedia('(prefers-reduced-motion: reduce)').matches,
);

const sounds = new SoundBoard(
  (): AudioLike | undefined => {
    const Context = window.AudioContext as typeof AudioContext | undefined;
    return Context ? new Context() : undefined;
  },
  () => settings.current().sound,
);

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

function unlockSoundOnGesture(): void {
  void sounds.unlock().then((unlocked) => {
    if (!unlocked) return;
    for (const type of GESTURES) window.removeEventListener(type, unlockSoundOnGesture, true);
  });
}

for (const type of GESTURES) window.addEventListener(type, unlockSoundOnGesture, true);

function applySettings(current: Settings): void {
  input.setBindings(bindingsOf(current.keys));
  document.body.dataset.touchSize = current.touch.size;
  document.body.dataset.touchSwapped = String(current.touch.swapped);
  document.documentElement.style.setProperty(
    '--touch-opacity',
    String(current.touch.opacity / 100),
  );
}
const api = new ApiClient(
  (...args) => window.fetch(...args),
  () => sessions.current()?.token,
);
let game: Phaser.Game | undefined;
let runtime: GameRuntime | undefined;
let runtimeLoading: Promise<GameRuntime> | undefined;

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
    if (action === 'close') closeReplay();
    return;
  }
  if (document.body.dataset.screen !== 'game' || !input.isBound(event.code)) return;
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

applySettings(settings.current());
settings.subscribe(applySettings);

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
    submit: (levelId, replay, versions) => api.submitRun(levelId, replay, versions),
    guest: guestStore,
    account: storeFor(username),
  });
}

/** Fetches the chunk with Phaser and the scene once; a failed fetch can be tried again. */
function loadRuntime(): Promise<GameRuntime> {
  runtimeLoading ??= import('./game/runtime').then(
    (loaded) => {
      runtime = loaded;
      return loaded;
    },
    (error: unknown) => {
      runtimeLoading = undefined;
      throw error;
    },
  );
  return runtimeLoading;
}

/** Starts fetching the game in the background shortly after the first screen is shown. */
function preloadRuntime(): void {
  window.setTimeout(() => void loadRuntime().catch(() => undefined), 300);
}

/** The running game scene, if the game was loaded and has one. */
function activeScene(): GameScene | undefined {
  if (!runtime || !game?.scene.isActive(runtime.SCENE_KEY)) return undefined;
  const scene = game.scene.getScene(runtime.SCENE_KEY);
  return scene instanceof runtime.GameScene ? scene : undefined;
}

/**
 * Shows the game screen and starts the scene with `data`, loading the game first when needed.
 * The player may have gone elsewhere while the chunk was fetched, in which case nothing starts.
 */
function launchScene(screen: 'game' | 'replay', data: Record<string, unknown>): void {
  const requested = navigation;
  loadRuntime()
    .then((loaded) => {
      if (navigation !== requested) return;
      setScreen(screen);
      if (ui) {
        ui.hidden = true;
        ui.replaceChildren();
      }
      game ??= loaded.createGame();
      game.scene.start(loaded.SCENE_KEY, data);
    })
    .catch(() => {
      if (navigation !== requested) return;
      show('menu', loadErrorScreen({ onRetry: () => launchScene(screen, data), onBack: showMenu }));
    });
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
      onSettings: showSettings,
      onAccount: account ? showAccount : undefined,
      onBack: showTitle,
    }),
  );
}

function showSettings(): void {
  show(
    'settings',
    settingsScreen({
      settings: settings.current(),
      onRebind: (action, code) => {
        const result = rebind(settings.current(), action, code);
        if (!result.ok) return result.reason;
        settings.update(() => result.settings);
        showSettings();
        return undefined;
      },
      onResetKeys: () => {
        settings.update(resetKeys);
        showSettings();
      },
      onTouchSize: (size) => {
        settings.update((current) => ({ ...current, touch: { ...current.touch, size } }));
        showSettings();
      },
      onTouchSwapped: (swapped) => {
        settings.update((current) => ({ ...current, touch: { ...current.touch, swapped } }));
        showSettings();
      },
      onTouchOpacity: (opacity) => {
        settings.update((current) => ({ ...current, touch: { ...current.touch, opacity } }));
      },
      onSoundMuted: (muted) => {
        settings.update((current) => ({ ...current, sound: { ...current.sound, muted } }));
      },
      onSoundVolume: (volume) => {
        settings.update((current) => ({ ...current, sound: { ...current.sound, volume } }));
        sounds.play('jump');
      },
      onReducedMotion: (reducedMotion) => {
        settings.update((current) => ({ ...current, reducedMotion }));
      },
      onBack: showMenu,
    }),
  );
}

function showLevels(): void {
  show('levels', levelSelect(levelCards(LEVELS, currentStore().load()), startLevel, showMenu));
}

const submitter = new RunSubmitter({
  signedIn: () => sessions.current() !== undefined,
  submit: (levelId, replay, versions) => api.submitRun(levelId, replay, versions),
  signOut: () => sessions.clear(),
  setStatus: (text) => activeScene()?.setStatus(text),
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
      const render = (notice?: string): void => {
        show(
          'board',
          leaderboardScreen({
            title,
            state: { kind: 'ready', rows },
            onBack: back,
            onWatch: (runId) => watchRun(runId, render, () => showLeaderboard(index, back)),
            ...(notice ? { notice } : {}),
          }),
        );
      };
      render();
    })
    .catch((error: unknown) => {
      if (navigation !== requested) return;
      const message = error instanceof ApiError ? error.message : 'Something went wrong.';
      show('board', leaderboardScreen({ title, state: { kind: 'error', message }, onBack: back }));
    });
}

/** Loads a stored run and plays it back; a run that cannot be shown is reported on the board. */
function watchRun(runId: number, report: (notice: string) => void, back: () => void): void {
  const requested = navigation;
  api
    .replay(runId)
    .then((stored) => {
      if (navigation !== requested) return;
      const index = LEVELS.findIndex((level) => level.id === stored.levelId);
      const level = LEVELS[index];
      if (!level) {
        report('This level is not part of this version of the game.');
        return;
      }
      const playable = playableInputs(level, stored.replay, stored.versions);
      if (!playable.ok) {
        report(playable.reason);
        return;
      }
      startReplay(
        index,
        playable.inputs,
        `${stored.username} · ${formatTime(stored.frames)}`,
        back,
      );
    })
    .catch((error: unknown) => {
      if (navigation !== requested) return;
      report(error instanceof ApiError ? error.message : 'Something went wrong.');
    });
}

let leaveReplay: (() => void) | undefined;

function startReplay(
  index: number,
  inputs: readonly number[],
  caption: string,
  back: () => void,
): void {
  leaveReplay = back;
  launchScene('replay', {
    levels: LEVELS,
    startIndex: index,
    input,
    replay: { inputs, caption },
    reducedMotion: () => settings.current().reducedMotion,
    onReplayFinished: () => announce('Replay finished'),
  });
}

function closeReplay(): void {
  if (document.body.dataset.screen !== 'replay') return;
  input.reset();
  stopScene();
  const back = leaveReplay ?? showLevels;
  leaveReplay = undefined;
  back();
}

document.querySelector('.replay-close')?.addEventListener('click', closeReplay);

function stopScene(): void {
  if (runtime) game?.scene.stop(runtime.SCENE_KEY);
}

function startLevel(index: number): void {
  launchScene('game', {
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
        versions: event.versions,
      });
      void submitter.send(event);
    },
    onRetrySubmit: () => submitter.retry(),
    ghostFor: (levelId: string) => {
      const level = LEVELS.find((candidate) => candidate.id === levelId);
      return level ? ghostInputs(currentStore().load()[levelId], level) : undefined;
    },
    ghostEnabled: ghostPreference.enabled(),
    sound: (name: SoundName) => sounds.play(name),
    reducedMotion: () => settings.current().reducedMotion,
    onGhostToggled: (on: boolean) => {
      ghostPreference.set(on);
      announce(on ? 'Ghost on' : 'Ghost off');
    },
    onShowLeaderboard: (levelId: string) => {
      const index = LEVELS.findIndex((level) => level.id === levelId);
      input.reset();
      stopScene();
      showLeaderboard(index, showLevels);
    },
  });
}

function pauseGame(): void {
  if (document.body.dataset.screen !== 'game' || !game || !runtime) return;
  const scene = game.scene.getScene(runtime.SCENE_KEY);
  if (!(scene instanceof runtime.GameScene)) return;
  input.reset();
  game.scene.pause(runtime.SCENE_KEY);
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
  if (runtime) game?.scene.resume(runtime.SCENE_KEY);
}

function leaveLevel(): void {
  input.reset();
  stopScene();
  showLevels();
}

void syncProgress();

if (new URLSearchParams(window.location.search).has('level')) {
  startLevel(startIndex(LEVELS, window.location.search));
} else {
  showTitle();
}

preloadRuntime();
