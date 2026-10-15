// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { leaderboardScreen } from './screens';

const ROWS = [
  {
    rank: '1',
    runId: 11,
    username: 'alice',
    score: '1010',
    time: '0:14.83',
    deaths: '0',
    isYou: false,
  },
  {
    rank: '2',
    runId: 12,
    username: 'bob',
    score: '940',
    time: '0:16.00',
    deaths: '2',
    isYou: true,
  },
];

describe('leaderboardScreen', () => {
  it('shows a heading with the level and a row per entry', () => {
    const root = leaderboardScreen({
      title: '1. Trust Nothing',
      state: { kind: 'ready', rows: ROWS },
      onBack: () => undefined,
      onWatch: () => undefined,
    });

    expect(root.querySelector('h2')?.textContent).toBe('Leaderboard · 1. Trust Nothing');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.querySelector('tr.row-you')?.textContent).toContain('bob');
  });

  it('says so when nobody has finished the level yet', () => {
    const root = leaderboardScreen({
      title: 'x',
      state: { kind: 'ready', rows: [] },
      onBack: () => undefined,
    });

    expect(root.textContent).toMatch(/nobody has finished/i);
  });

  it('shows loading and error states', () => {
    const loading = leaderboardScreen({
      title: 'x',
      state: { kind: 'loading' },
      onBack: () => undefined,
    });
    const failed = leaderboardScreen({
      title: 'x',
      state: { kind: 'error', message: 'The server is busy, please try again later.' },
      onBack: () => undefined,
    });

    expect(loading.textContent).toMatch(/loading/i);
    expect(failed.querySelector('[role=alert]')?.textContent).toContain('busy');
  });

  it('offers to watch the run of every row', () => {
    const onWatch = vi.fn();
    const root = leaderboardScreen({
      title: 'x',
      state: { kind: 'ready', rows: ROWS },
      onBack: () => undefined,
      onWatch,
    });
    const buttons = root.querySelectorAll<HTMLButtonElement>('tbody button');

    buttons[1]?.click();

    expect(buttons).toHaveLength(2);
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Watch the run of bob');
    expect(onWatch).toHaveBeenCalledWith(12);
  });

  it('opens the profile of a player from the name', () => {
    const onProfile = vi.fn();
    const root = leaderboardScreen({
      title: 'x',
      state: { kind: 'ready', rows: ROWS },
      onBack: () => undefined,
      onProfile,
    });
    const links = root.querySelectorAll<HTMLButtonElement>('tbody .link');

    links[0]?.click();

    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute('aria-label')).toBe('Profile of alice');
    expect(onProfile).toHaveBeenCalledWith('alice');
  });

  it('shows plain names when profiles are not available', () => {
    const root = leaderboardScreen({
      title: 'x',
      state: { kind: 'ready', rows: ROWS },
      onBack: () => undefined,
    });

    expect(root.querySelectorAll('tbody .link')).toHaveLength(0);
    expect(root.textContent).toContain('alice');
  });

  it('shows why a replay could not be opened', () => {
    const root = leaderboardScreen({
      title: 'x',
      state: { kind: 'ready', rows: ROWS },
      onBack: () => undefined,
      onWatch: () => undefined,
      notice: 'This replay is damaged.',
    });

    expect(root.querySelector('[role=alert]')?.textContent).toBe('This replay is damaged.');
  });

  it('goes back', () => {
    const onBack = vi.fn();
    const root = leaderboardScreen({ title: 'x', state: { kind: 'loading' }, onBack });

    root.querySelector<HTMLButtonElement>('button')?.click();

    expect(onBack).toHaveBeenCalledOnce();
  });
});
