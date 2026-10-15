// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
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
} from './screens';

const noop = () => undefined;
const never = () => Promise.resolve(undefined);

const CARDS = [
  {
    index: 0,
    id: 'a',
    number: 1,
    name: 'One',
    stages: 3,
    status: 'open' as const,
    best: undefined,
  },
  {
    index: 1,
    id: 'b',
    number: 2,
    name: 'Two',
    stages: 3,
    status: 'locked' as const,
    best: undefined,
  },
];

const ROWS = [
  {
    rank: '1',
    runId: 1,
    username: 'alice',
    score: '900',
    time: '0:10.00',
    deaths: '0',
    isYou: false,
  },
];

const SCREENS: [string, () => HTMLElement][] = [
  [
    'title',
    () =>
      titleScreen({
        signedInAs: undefined,
        onPlay: noop,
        onSignIn: noop,
        onRegister: noop,
        onSignOut: noop,
      }),
  ],
  [
    'sign in',
    () => authScreen({ mode: 'login', onSubmit: never, onSwitchMode: noop, onBack: noop }),
  ],
  [
    'register',
    () => authScreen({ mode: 'register', onSubmit: never, onSwitchMode: noop, onBack: noop }),
  ],
  [
    'menu',
    () =>
      mainMenu({
        accountLine: 'Playing as guest',
        continueLabel: 'Start',
        onContinue: noop,
        onLevels: noop,
        onLeaderboards: noop,
        onSettings: noop,
        onBack: noop,
      }),
  ],
  ['levels', () => levelSelect(CARDS, noop, noop)],
  [
    'leaderboard',
    () =>
      leaderboardScreen({
        title: '1. One',
        state: { kind: 'ready', rows: ROWS },
        onBack: noop,
        onWatch: noop,
      }),
  ],
  [
    'account',
    () =>
      accountScreen({
        username: 'mallory',
        onChangePassword: never,
        onLogoutAll: never,
        onDelete: never,
        onBack: noop,
      }),
  ],
  [
    'settings',
    () =>
      settingsScreen({
        settings: DEFAULT_SETTINGS,
        onRebind: () => undefined,
        onResetKeys: noop,
        onTouchSize: noop,
        onTouchSwapped: noop,
        onTouchOpacity: noop,
        onSoundMuted: noop,
        onSoundVolume: noop,
        onMusic: noop,
        onReducedMotion: noop,
        onBack: noop,
      }),
  ],
  [
    'pause',
    () => pauseScreen({ title: '1. One', onResume: noop, onRestart: noop, onLevels: noop }),
  ],
  ['load error', () => loadErrorScreen({ onRetry: noop, onBack: noop })],
];

function nameOf(element: Element): string {
  const label = element.getAttribute('aria-label')?.trim();
  if (label) return label;
  const id = element.getAttribute('id');
  if (id) {
    const explicit = element.ownerDocument.querySelector(`label[for="${id}"]`);
    if (explicit?.textContent?.trim()) return explicit.textContent.trim();
  }
  const wrapping = element.closest('label');
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
  const isField = ['input', 'select', 'textarea'].includes(element.tagName.toLowerCase());
  return isField ? '' : (element.textContent?.trim() ?? '');
}

describe('nameOf', () => {
  it('does not take the content of a field for its name', () => {
    document.body.innerHTML =
      '<select id="a"><option>One</option></select><textarea id="b">typed</textarea>';

    expect(nameOf(document.getElementById('a') as Element)).toBe('');
    expect(nameOf(document.getElementById('b') as Element)).toBe('');
  });

  it('takes the label of a field and the text of a button', () => {
    document.body.innerHTML =
      '<label for="c">Name</label><input id="c"><button>Go</button><input aria-label="Other">';

    expect(nameOf(document.getElementById('c') as Element)).toBe('Name');
    expect(nameOf(document.querySelector('button') as Element)).toBe('Go');
    expect(nameOf(document.querySelector('[aria-label]') as Element)).toBe('Other');
  });
});

describe.each(SCREENS)('the %s screen', (_name, build) => {
  it('has a heading', () => {
    const root = build();

    expect(root.querySelector('h1, h2')?.textContent?.trim()).toBeTruthy();
  });

  it('gives every button, link and field an accessible name', () => {
    const root = build();
    document.body.replaceChildren(root);

    const controls = Array.from(root.querySelectorAll('button, a, input, select, textarea'));

    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(nameOf(control), control.outerHTML).not.toBe('');
    }
  });

  it('uses no duplicate ids', () => {
    const root = build();
    const ids = Array.from(root.querySelectorAll('[id]')).map((element) => element.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('announces its errors as alerts', () => {
    const root = build();

    for (const message of root.querySelectorAll('.form-error')) {
      expect(message.getAttribute('role')).toBe('alert');
    }
  });

  it('keeps every control reachable by keyboard', () => {
    const root = build();

    for (const control of root.querySelectorAll('button, input, select, textarea')) {
      expect(control.getAttribute('tabindex')).not.toBe('-1');
    }
  });
});
