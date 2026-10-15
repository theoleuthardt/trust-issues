// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { authScreen, levelSelect, mainMenu, titleScreen } from './screens';
import type { LevelCard } from './progress';

const noop = () => undefined;

function click(element: Element | null): void {
  if (!(element instanceof HTMLElement)) throw new Error('element not found');
  element.click();
}

function byText(root: ParentNode, text: string): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>('button')).find(
      (button) => button.textContent === text,
    ) ?? null
  );
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('titleScreen', () => {
  const handlers = { onPlay: noop, onSignIn: noop, onRegister: noop, onSignOut: noop };

  it('offers guest play, sign in and register to a guest', () => {
    const root = titleScreen({ ...handlers, signedInAs: undefined });

    expect(Array.from(root.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'Play as guest',
      'Sign in',
      'Register',
    ]);
  });

  it('greets a signed-in player and offers sign out', () => {
    const root = titleScreen({ ...handlers, signedInAs: 'mallory' });

    expect(root.textContent).toContain('Signed in as mallory');
    expect(byText(root, 'Sign out')).not.toBeNull();
    expect(byText(root, 'Sign in')).toBeNull();
  });

  it('calls the matching handler', () => {
    const onRegister = vi.fn();
    const root = titleScreen({ ...handlers, signedInAs: undefined, onRegister });

    click(byText(root, 'Register'));

    expect(onRegister).toHaveBeenCalledOnce();
  });
});

describe('authScreen', () => {
  const fill = (root: HTMLElement, username: string, password: string) => {
    const [user, pass] = Array.from(root.querySelectorAll('input'));
    if (!user || !pass) throw new Error('inputs missing');
    user.value = username;
    pass.value = password;
  };
  const submit = (root: HTMLElement) =>
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  const options = (overrides = {}) => ({
    mode: 'login' as const,
    onSubmit: () => Promise.resolve(undefined),
    onSwitchMode: noop,
    onBack: noop,
    ...overrides,
  });

  it('uses the right autocomplete hints for each mode', () => {
    const login = authScreen(options());
    const register = authScreen(options({ mode: 'register' }));

    expect(login.querySelector<HTMLInputElement>('input[name=password]')?.autocomplete).toBe(
      'current-password',
    );
    expect(register.querySelector<HTMLInputElement>('input[name=password]')?.autocomplete).toBe(
      'new-password',
    );
  });

  it('passes what was typed to onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const root = authScreen(options({ onSubmit }));
    fill(root, 'mallory', 'secret-password');

    submit(root);
    await tick();

    expect(onSubmit).toHaveBeenCalledWith('mallory', 'secret-password');
  });

  it('shows the message onSubmit returns and enables the button again', async () => {
    const root = authScreen(
      options({ onSubmit: () => Promise.resolve('Wrong username or password.') }),
    );
    fill(root, 'mallory', 'x');

    submit(root);
    await tick();

    expect(root.querySelector('.form-error')?.textContent).toBe('Wrong username or password.');
    expect(root.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
  });

  it('disables the button while a request is running', async () => {
    let finish: (value: string | undefined) => void = noop;
    const pending = new Promise<string | undefined>((resolve) => {
      finish = resolve;
    });
    const root = authScreen(options({ onSubmit: () => pending }));
    fill(root, 'mallory', 'x');

    submit(root);

    expect(root.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
    finish(undefined);
    await tick();
    expect(root.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
  });

  it('shows a generic message when onSubmit rejects', async () => {
    const root = authScreen(options({ onSubmit: () => Promise.reject(new Error('boom')) }));
    fill(root, 'mallory', 'x');

    submit(root);
    await tick();

    expect(root.querySelector('.form-error')?.textContent).toMatch(/went wrong/i);
    expect(root.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
  });

  it('can start with a notice', () => {
    const root = authScreen(options({ notice: 'Your account was created.' }));

    expect(root.querySelector('.form-error')?.textContent).toBe('Your account was created.');
  });

  it('switches mode and goes back', () => {
    const onSwitchMode = vi.fn();
    const onBack = vi.fn();
    const root = authScreen(options({ onSwitchMode, onBack }));

    click(byText(root, 'Create an account'));
    click(byText(root, 'Back'));

    expect(onSwitchMode).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('mainMenu', () => {
  it('shows who is playing and calls the handlers', () => {
    const onLevels = vi.fn();
    const root = mainMenu({
      accountLine: 'Playing as guest',
      continueLabel: 'Start',
      onContinue: noop,
      onLevels,
      onLeaderboards: noop,
      onSettings: noop,
      onBack: noop,
    });

    expect(root.textContent).toContain('Playing as guest');
    click(byText(root, 'Levels'));
    expect(onLevels).toHaveBeenCalledOnce();
  });
});

describe('levelSelect', () => {
  const cards: LevelCard[] = [
    {
      index: 0,
      id: 'a',
      number: 1,
      name: 'Alpha',
      stages: 3,
      status: 'cleared',
      best: { score: 950, frames: 930, deaths: 0 },
    },
    { index: 1, id: 'b', number: 2, name: 'Beta', stages: 4, status: 'open', best: undefined },
    { index: 2, id: 'c', number: 3, name: 'Gamma', stages: 3, status: 'locked', best: undefined },
  ];

  it('disables locked levels and hides their name', () => {
    const root = levelSelect(cards, noop, noop);
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.card'));

    expect(buttons.map((b) => b.disabled)).toEqual([false, false, true]);
    expect(buttons[2]?.textContent).not.toContain('Gamma');
    expect(buttons[2]?.getAttribute('aria-label')).toBe('Level 3, locked');
  });

  it('announces name and result of a cleared level', () => {
    const root = levelSelect(cards, noop, noop);

    expect(root.querySelector('.card-cleared')?.getAttribute('aria-label')).toContain('950 points');
  });

  it('starts the picked level', () => {
    const onPick = vi.fn();
    const root = levelSelect(cards, onPick, noop);

    click(root.querySelector('.card-open'));

    expect(onPick).toHaveBeenCalledWith(1);
  });
});
