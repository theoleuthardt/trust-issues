import { formatTime } from '../format';
import type { AuthMode } from '../api/credentials';
import { h } from './dom';
import type { LevelCard } from './progress';

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
    h('h2', { class: 'heading', text: 'Levels' }),
    grid,
    h('div', { class: 'stack' }, button('Back', onBack)),
  );
}
