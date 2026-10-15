// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { accountScreen } from './screens';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function options(overrides = {}) {
  return {
    username: 'mallory',
    onChangePassword: vi.fn().mockResolvedValue(undefined),
    onLogoutAll: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onBack: vi.fn(),
    ...overrides,
  };
}

function inputs(root: HTMLElement, formName: string) {
  return Array.from(root.querySelectorAll<HTMLInputElement>(`form[data-form=${formName}] input`));
}

function submit(root: HTMLElement, formName: string) {
  root
    .querySelector(`form[data-form=${formName}]`)
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('accountScreen', () => {
  it('shows who is signed in', () => {
    const root = accountScreen(options());

    expect(root.textContent).toContain('mallory');
  });

  it('changes the password with the three typed values', async () => {
    const opts = options();
    const root = accountScreen(opts);
    const [current, next, again] = inputs(root, 'password');
    if (!current || !next || !again) throw new Error('inputs missing');
    current.value = 'old-password-123';
    next.value = 'brand-new-password';
    again.value = 'brand-new-password';

    submit(root, 'password');
    await tick();

    expect(opts.onChangePassword).toHaveBeenCalledWith('old-password-123', 'brand-new-password');
  });

  it('validates the new password before asking the server', async () => {
    const opts = options();
    const root = accountScreen(opts);
    const [current, next, again] = inputs(root, 'password');
    if (!current || !next || !again) throw new Error('inputs missing');
    current.value = 'old-password-123';
    next.value = 'brand-new-password';
    again.value = 'something-different';

    submit(root, 'password');
    await tick();

    expect(opts.onChangePassword).not.toHaveBeenCalled();
    expect(root.querySelector('[data-message=password]')?.textContent).toMatch(/do not match/i);
  });

  it('shows what the server answered for a failed change', async () => {
    const opts = options({ onChangePassword: vi.fn().mockResolvedValue('Wrong password.') });
    const root = accountScreen(opts);
    const [current, next, again] = inputs(root, 'password');
    if (!current || !next || !again) throw new Error('inputs missing');
    current.value = 'old-password-123';
    next.value = 'brand-new-password';
    again.value = 'brand-new-password';

    submit(root, 'password');
    await tick();

    expect(root.querySelector('[data-message=password]')?.textContent).toBe('Wrong password.');
  });

  it('asks for confirmation before signing out everywhere', async () => {
    const opts = options();
    const root = accountScreen(opts);
    const first = root.querySelector<HTMLButtonElement>('[data-action=logout-all]');

    first?.click();
    expect(opts.onLogoutAll).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-action=logout-all-confirm]')?.click();
    await tick();

    expect(opts.onLogoutAll).toHaveBeenCalledOnce();
  });

  it('needs the password and a confirmation to delete the account', async () => {
    const opts = options();
    const root = accountScreen(opts);
    root.querySelector<HTMLButtonElement>('[data-action=delete]')?.click();
    const [password] = inputs(root, 'delete');
    if (!password) throw new Error('password input missing');
    password.value = 'my-password-123';

    submit(root, 'delete');
    await tick();

    expect(opts.onDelete).toHaveBeenCalledWith('my-password-123');
  });

  it('goes back', () => {
    const opts = options();
    const root = accountScreen(opts);

    root.querySelector<HTMLButtonElement>('[data-action=back]')?.click();

    expect(opts.onBack).toHaveBeenCalledOnce();
  });
});
