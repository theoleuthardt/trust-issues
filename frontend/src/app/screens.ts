import { formatTime } from '../format';
import type { AuthMode } from '../api/credentials';
import { validateNewPassword } from '../api/credentials';
import { h } from './dom';
import type { LeaderboardRow } from './leaderboard';
import type { LevelCard } from './progress';
import { ACTIONS, MAX_OPACITY, MIN_OPACITY, TOUCH_SIZES } from './settings';
import type { Action, Settings, TouchSize } from './settings';

const button = (label: string, onClick: () => void, primary = false) =>
  h('button', {
    class: primary ? 'button button-primary' : 'button',
    type: 'button',
    onClick,
    text: label,
  });

export interface TitleOptions {
  signedInAs: string | undefined;
  onPlay: () => void;
  onSignIn: () => void;
  onRegister: () => void;
  onSignOut: () => void;
}

/** The first screen: the name of the game and the way in. */
export function titleScreen(options: TitleOptions): HTMLElement {
  const actions = options.signedInAs
    ? [
        h('p', { class: 'account-line', text: `Signed in as ${options.signedInAs}` }),
        button('Play', options.onPlay, true),
        button('Sign out', options.onSignOut),
      ]
    : [
        button('Play as guest', options.onPlay, true),
        button('Sign in', options.onSignIn),
        button('Register', options.onRegister),
      ];
  return h(
    'section',
    { class: 'screen screen-title' },
    h('h1', { class: 'logo', text: 'Trust Issues' }),
    h('p', { class: 'tagline', text: 'Nothing is what it seems.' }),
    h('div', { class: 'stack' }, ...actions),
  );
}

export interface AuthScreenOptions {
  mode: AuthMode;
  /** Resolves to an error message to show, or undefined when the attempt worked. */
  onSubmit: (username: string, password: string) => Promise<string | undefined>;
  onSwitchMode: () => void;
  onBack: () => void;
  /** Shown in the message area when the screen opens. */
  notice?: string;
}

function field(label: string, input: HTMLInputElement): HTMLElement {
  const id = `field-${input.name}`;
  input.id = id;
  const caption = h('label', { class: 'field-label', text: label });
  caption.htmlFor = id;
  return h('div', { class: 'field' }, caption, input);
}

export function authScreen(options: AuthScreenOptions): HTMLElement {
  const registering = options.mode === 'register';
  const username = h('input', { class: 'input' });
  username.name = 'username';
  username.type = 'text';
  username.autocomplete = 'username';
  username.autocapitalize = 'none';
  username.spellcheck = false;
  username.required = true;

  const password = h('input', { class: 'input' });
  password.name = 'password';
  password.type = 'password';
  password.autocomplete = registering ? 'new-password' : 'current-password';
  password.required = true;

  const error = h('p', { class: 'form-error', text: options.notice ?? '' });
  error.setAttribute('role', 'alert');
  const submit = h('button', {
    class: 'button button-primary',
    type: 'submit',
    text: registering ? 'Create account' : 'Sign in',
  });

  const form = h(
    'form',
    { class: 'stack' },
    field('Username', username),
    field('Password', password),
    error,
    submit,
  );
  form.noValidate = true;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.disabled = true;
    error.textContent = '';
    options
      .onSubmit(username.value, password.value)
      .then((message) => {
        if (message) error.textContent = message;
      })
      .catch(() => {
        error.textContent = 'Something went wrong.';
      })
      .finally(() => {
        submit.disabled = false;
      });
  });

  return h(
    'section',
    { class: 'screen' },
    h('h2', { class: 'heading', text: registering ? 'Register' : 'Sign in' }),
    form,
    h(
      'div',
      { class: 'stack' },
      button(registering ? 'I have an account' : 'Create an account', options.onSwitchMode),
      button('Back', options.onBack),
    ),
  );
}

export interface MainMenuOptions {
  accountLine: string;
  continueLabel: string;
  onContinue: () => void;
  onLevels: () => void;
  onLeaderboards: () => void;
  onSettings: () => void;
  onAccount?: () => void;
  onBack: () => void;
}

export function mainMenu(options: MainMenuOptions): HTMLElement {
  return h(
    'section',
    { class: 'screen' },
    h('h2', { class: 'heading', text: 'Trust Issues' }),
    h('p', { class: 'account-line', text: options.accountLine }),
    h(
      'div',
      { class: 'stack' },
      button(options.continueLabel, options.onContinue, true),
      button('Levels', options.onLevels),
      button('Leaderboards', options.onLeaderboards),
      ...(options.onAccount ? [button('Account', options.onAccount)] : []),
      button('Settings', options.onSettings),
      button('Back', options.onBack),
    ),
  );
}

function cardDetail(card: LevelCard): string {
  if (card.status === 'locked') return 'Locked';
  if (!card.best) return `${card.stages} stages`;
  return `${card.best.score} pts · ${formatTime(card.best.frames)}`;
}

function cardLabel(card: LevelCard): string {
  if (card.status === 'locked') return `Level ${card.number}, locked`;
  const result = card.best
    ? `cleared, ${card.best.score} points in ${formatTime(card.best.frames)}`
    : `${card.stages} stages`;
  return `Level ${card.number}, ${card.name}, ${result}`;
}

export function levelSelect(
  cards: readonly LevelCard[],
  onPick: (index: number) => void,
  onBack: () => void,
  heading = 'Levels',
): HTMLElement {
  const grid = h('div', { class: 'cards' });
  for (const card of cards) {
    const element = h(
      'button',
      {
        class: `card card-${card.status}`,
        type: 'button',
        disabled: card.status === 'locked',
        onClick: () => onPick(card.index),
      },
      h('span', { class: 'card-number', text: String(card.number) }),
      h('span', { class: 'card-name', text: card.status === 'locked' ? '???' : card.name }),
      h('span', { class: 'card-detail', text: cardDetail(card) }),
    );
    element.setAttribute('aria-label', cardLabel(card));
    grid.append(element);
  }
  return h(
    'section',
    { class: 'screen screen-levels' },
    h('h2', { class: 'heading', text: heading }),
    grid,
    h('div', { class: 'stack' }, button('Back', onBack)),
  );
}

export type LeaderboardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: readonly LeaderboardRow[] };

export interface LeaderboardScreenOptions {
  title: string;
  state: LeaderboardState;
  onBack: () => void;
  /** Opens the replay of the run with this id. */
  onWatch?: (runId: number) => void;
  /** A problem with the last replay the player tried to open. */
  notice?: string;
}

function alertLine(text: string): HTMLElement {
  const line = h('p', { class: 'form-error', text });
  line.setAttribute('role', 'alert');
  return line;
}

function watchButton(row: LeaderboardRow, onWatch: ((runId: number) => void) | undefined): Node {
  const watch = h('button', {
    class: 'button button-small',
    type: 'button',
    text: 'Watch',
    onClick: () => onWatch?.(row.runId),
  });
  watch.setAttribute('aria-label', `Watch the run of ${row.username}`);
  return watch;
}

export function leaderboardScreen(options: LeaderboardScreenOptions): HTMLElement {
  const { state } = options;
  let content: HTMLElement;
  if (state.kind === 'loading') {
    content = h('p', { class: 'account-line', text: 'Loading…' });
  } else if (state.kind === 'error') {
    content = h('p', { class: 'form-error', text: state.message });
    content.setAttribute('role', 'alert');
  } else if (state.rows.length === 0) {
    content = h('p', { class: 'account-line', text: 'Nobody has finished this level yet.' });
  } else {
    const head = h(
      'tr',
      {},
      ...['#', 'Player', 'Score', 'Time', 'Deaths', ''].map((label) => h('th', { text: label })),
    );
    const body = state.rows.map((row) =>
      h(
        'tr',
        { class: row.isYou ? 'row-you' : '' },
        h('td', { text: row.rank }),
        h('td', { text: row.username }),
        h('td', { text: row.score }),
        h('td', { text: row.time }),
        h('td', { text: row.deaths }),
        h('td', {}, watchButton(row, options.onWatch)),
      ),
    );
    content = h(
      'div',
      { class: 'table-wrap' },
      h('table', { class: 'board' }, h('thead', {}, head), h('tbody', {}, ...body)),
    );
  }
  return h(
    'section',
    { class: 'screen screen-board' },
    h('h2', { class: 'heading', text: `Leaderboard · ${options.title}` }),
    ...(options.notice ? [alertLine(options.notice)] : []),
    content,
    h('div', { class: 'stack' }, button('Back', options.onBack)),
  );
}

export interface AccountScreenOptions {
  username: string;
  /** Each action resolves to an error message, or undefined when it worked. */
  onChangePassword: (current: string, next: string) => Promise<string | undefined>;
  onLogoutAll: () => Promise<string | undefined>;
  onDelete: (password: string) => Promise<string | undefined>;
  onBack: () => void;
}

function passwordInput(
  name: string,
  label: string,
  autocomplete: 'current-password' | 'new-password',
): HTMLElement {
  const input = h('input', { class: 'input' });
  input.name = name;
  input.type = 'password';
  input.autocomplete = autocomplete;
  input.required = true;
  return field(label, input);
}

function message(name: string): HTMLParagraphElement {
  const element = h('p', { class: 'form-error' });
  element.dataset.message = name;
  element.setAttribute('role', 'alert');
  return element;
}

function runAction(
  action: () => Promise<string | undefined>,
  target: HTMLElement,
  controls: HTMLElement[],
): void {
  for (const control of controls) control.setAttribute('disabled', '');
  target.textContent = '';
  action()
    .then((problem) => {
      if (problem) target.textContent = problem;
    })
    .catch(() => {
      target.textContent = 'Something went wrong.';
    })
    .finally(() => {
      for (const control of controls) control.removeAttribute('disabled');
    });
}

export function accountScreen(options: AccountScreenOptions): HTMLElement {
  const passwordMessage = message('password');
  const passwordSubmit = h('button', {
    class: 'button button-primary',
    type: 'submit',
    text: 'Change password',
  });
  const passwordForm = h(
    'form',
    { class: 'stack' },
    passwordInput('current', 'Current password', 'current-password'),
    passwordInput('next', 'New password', 'new-password'),
    passwordInput('again', 'New password again', 'new-password'),
    passwordMessage,
    passwordSubmit,
  );
  passwordForm.dataset.form = 'password';
  passwordForm.noValidate = true;
  passwordForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const [current, next, again] = Array.from(passwordForm.querySelectorAll('input')).map(
      (input) => input.value,
    ) as [string, string, string];
    const problem = validateNewPassword(current, next, again);
    if (problem) {
      passwordMessage.textContent = problem;
      return;
    }
    runAction(() => options.onChangePassword(current, next), passwordMessage, [passwordSubmit]);
  });

  const sessionMessage = message('session');
  const logoutConfirm = h('button', {
    class: 'button button-primary',
    type: 'button',
    text: 'Yes, sign out everywhere',
  });
  logoutConfirm.dataset.action = 'logout-all-confirm';
  logoutConfirm.hidden = true;
  logoutConfirm.addEventListener('click', () =>
    runAction(options.onLogoutAll, sessionMessage, [logoutConfirm]),
  );
  const logoutStart = h('button', {
    class: 'button',
    type: 'button',
    text: 'Sign out on all devices',
  });
  logoutStart.dataset.action = 'logout-all';
  logoutStart.addEventListener('click', () => {
    logoutStart.hidden = true;
    logoutConfirm.hidden = false;
  });

  const deleteMessage = message('delete');
  const deleteSubmit = h('button', {
    class: 'button button-primary',
    type: 'submit',
    text: 'Delete my account for good',
  });
  const deleteForm = h(
    'form',
    { class: 'stack' },
    h('p', {
      class: 'account-line',
      text: 'This removes your account and all your runs. It cannot be undone.',
    }),
    passwordInput('password', 'Password', 'current-password'),
    deleteMessage,
    deleteSubmit,
  );
  deleteForm.dataset.form = 'delete';
  deleteForm.hidden = true;
  deleteForm.noValidate = true;
  deleteForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const password = deleteForm.querySelector('input')?.value ?? '';
    if (password === '') {
      deleteMessage.textContent = 'Enter your password to confirm.';
      return;
    }
    runAction(() => options.onDelete(password), deleteMessage, [deleteSubmit]);
  });
  const deleteStart = h('button', { class: 'button', type: 'button', text: 'Delete account' });
  deleteStart.dataset.action = 'delete';
  deleteStart.addEventListener('click', () => {
    deleteStart.hidden = true;
    deleteForm.hidden = false;
    deleteForm.querySelector('input')?.focus();
  });

  const back = button('Back', options.onBack);
  back.dataset.action = 'back';

  return h(
    'section',
    { class: 'screen screen-account' },
    h('h2', { class: 'heading', text: 'Account' }),
    h('p', { class: 'account-line', text: `Signed in as ${options.username}` }),
    passwordForm,
    h('div', { class: 'stack' }, logoutStart, logoutConfirm, sessionMessage),
    h('div', { class: 'stack' }, deleteStart, deleteForm),
    h('div', { class: 'stack' }, back),
  );
}

export interface PauseScreenOptions {
  title: string;
  onResume: () => void;
  onRestart: () => void;
  onLevels: () => void;
}

export function pauseScreen(options: PauseScreenOptions): HTMLElement {
  return h(
    'section',
    { class: 'screen screen-pause' },
    h('h2', { class: 'heading', text: 'Paused' }),
    h('p', { class: 'account-line', text: options.title }),
    h(
      'div',
      { class: 'stack' },
      button('Resume', options.onResume, true),
      button('Restart level', options.onRestart),
      button('Level select', options.onLevels),
    ),
  );
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

const ACTION_LABELS: Readonly<Record<Action, string>> = {
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
};

/** A short name for a key code, for example `KeyK` as `K` and `ArrowLeft` as `←`. */
export function keyLabel(code: string): string {
  const known = KEY_LABELS[code];
  if (known) return known;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter?.[1]) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit?.[1]) return digit[1];
  return code;
}

export interface SettingsScreenOptions {
  settings: Settings;
  /** Gives `code` to `action`; resolves to a message when it was refused. */
  onRebind: (action: Action, code: string) => string | undefined;
  onResetKeys: () => void;
  onTouchSize: (size: TouchSize) => void;
  onTouchSwapped: (swapped: boolean) => void;
  onTouchOpacity: (opacity: number) => void;
  onReducedMotion: (on: boolean) => void;
  onBack: () => void;
}

function checkbox(name: string, label: string, checked: boolean, onChange: (on: boolean) => void) {
  const input = h('input', { class: 'check' });
  input.type = 'checkbox';
  input.name = name;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'check-row' }, input, h('span', { text: label }));
}

export function settingsScreen(options: SettingsScreenOptions): HTMLElement {
  const { settings } = options;
  const problem = h('p', { class: 'form-error' });
  problem.setAttribute('role', 'alert');
  let stopListening: (() => void) | undefined;

  const listen = (action: Action, status: HTMLElement): void => {
    stopListening?.();
    status.textContent = 'Press a key… (Esc cancels)';
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        stopListening?.();
        status.textContent = settings.keys[action].map(keyLabel).join(' · ');
        return;
      }
      const refusal = options.onRebind(action, event.code);
      if (refusal) {
        problem.textContent = refusal;
        return;
      }
      stopListening?.();
    };
    document.addEventListener('keydown', onKey, true);
    stopListening = () => {
      document.removeEventListener('keydown', onKey, true);
      stopListening = undefined;
    };
  };

  const keyRows = ACTIONS.map((action) => {
    const status = h('span', {
      class: 'key-names',
      text: settings.keys[action].map(keyLabel).join(' · '),
    });
    const row = h(
      'div',
      { class: 'setting-row' },
      h('span', { class: 'setting-label', text: ACTION_LABELS[action] }),
      status,
      h('button', {
        class: 'button button-small',
        type: 'button',
        text: 'Change',
        onClick: () => {
          problem.textContent = '';
          listen(action, status);
        },
      }),
    );
    row.dataset.action = action;
    return row;
  });

  const sizeButtons = TOUCH_SIZES.map((size) => {
    const choice = h('button', {
      class: 'button button-small',
      type: 'button',
      text: size[0]?.toUpperCase() + size.slice(1),
      onClick: () => options.onTouchSize(size),
    });
    choice.dataset.size = size;
    choice.setAttribute('aria-pressed', String(settings.touch.size === size));
    return choice;
  });

  const opacity = h('input', { class: 'range' });
  opacity.type = 'range';
  opacity.name = 'opacity';
  opacity.min = String(MIN_OPACITY);
  opacity.max = String(MAX_OPACITY);
  opacity.step = '10';
  opacity.value = String(settings.touch.opacity);
  opacity.addEventListener('change', () => options.onTouchOpacity(Number(opacity.value)));

  return h(
    'section',
    { class: 'screen screen-settings' },
    h('h2', { class: 'heading', text: 'Settings' }),
    h(
      'fieldset',
      { class: 'settings-group' },
      h('legend', { text: 'Keyboard' }),
      ...keyRows,
      problem,
      button('Reset keys', options.onResetKeys),
    ),
    h(
      'fieldset',
      { class: 'settings-group' },
      h('legend', { text: 'Touch controls' }),
      h('div', { class: 'setting-row' }, h('span', { text: 'Size' }), ...sizeButtons),
      checkbox('swapped', 'Swap the sides of the buttons', settings.touch.swapped, (on) =>
        options.onTouchSwapped(on),
      ),
      h('label', { class: 'setting-row' }, h('span', { text: 'Opacity' }), opacity),
    ),
    h(
      'fieldset',
      { class: 'settings-group' },
      h('legend', { text: 'Motion' }),
      checkbox('motion', 'Reduce motion', settings.reducedMotion, (on) =>
        options.onReducedMotion(on),
      ),
    ),
    h(
      'div',
      { class: 'stack' },
      button('Back', () => {
        stopListening?.();
        options.onBack();
      }),
    ),
  );
}
