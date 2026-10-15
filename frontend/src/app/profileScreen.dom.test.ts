// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { profileScreen } from './screens';

const ROWS = [
  {
    number: 1,
    name: 'Alpha',
    completed: true,
    score: '1010',
    time: '0:14.83',
    deaths: '0',
    runId: 7,
  },
  {
    number: 2,
    name: 'Beta',
    completed: false,
    score: '–',
    time: '–',
    deaths: '–',
    runId: undefined,
  },
];

describe('profileScreen', () => {
  it('shows the name, the summary and a row per level', () => {
    const root = profileScreen({
      username: 'alice',
      state: { kind: 'ready', rows: ROWS, summary: '1 of 2 levels · 0:14.83 total' },
      onBack: () => undefined,
      onWatch: () => undefined,
    });

    expect(root.querySelector('h2')?.textContent).toBe('alice');
    expect(root.textContent).toContain('1 of 2 levels');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.querySelectorAll('tbody tr')[0]?.textContent).toContain('0:14.83');
  });

  it('offers to watch only the runs that exist', () => {
    const onWatch = vi.fn();
    const root = profileScreen({
      username: 'alice',
      state: { kind: 'ready', rows: ROWS, summary: '' },
      onBack: () => undefined,
      onWatch,
    });
    const buttons = root.querySelectorAll<HTMLButtonElement>('tbody button');

    buttons[0]?.click();

    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Watch the run of alice on Alpha');
    expect(onWatch).toHaveBeenCalledWith(7);
  });

  it('shows loading and error states', () => {
    const loading = profileScreen({
      username: 'alice',
      state: { kind: 'loading' },
      onBack: () => undefined,
      onWatch: () => undefined,
    });
    const failed = profileScreen({
      username: 'alice',
      state: { kind: 'error', message: 'There is no player with that name.' },
      onBack: () => undefined,
      onWatch: () => undefined,
    });

    expect(loading.textContent).toMatch(/loading/i);
    expect(failed.querySelector('[role=alert]')?.textContent).toContain('no player');
  });

  it('shows why a replay could not be opened', () => {
    const root = profileScreen({
      username: 'alice',
      state: { kind: 'ready', rows: ROWS, summary: '' },
      onBack: () => undefined,
      onWatch: () => undefined,
      notice: 'This replay is damaged.',
    });

    expect(root.querySelector('[role=alert]')?.textContent).toBe('This replay is damaged.');
  });

  it('goes back', () => {
    const onBack = vi.fn();
    const root = profileScreen({
      username: 'alice',
      state: { kind: 'loading' },
      onBack,
      onWatch: () => undefined,
    });

    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === 'Back')
      ?.click();

    expect(onBack).toHaveBeenCalledOnce();
  });
});
