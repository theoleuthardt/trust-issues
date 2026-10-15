// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { pauseScreen } from './screens';

function click(root: HTMLElement, text: string): void {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`button ${text} not found`);
  button.click();
}

describe('pauseScreen', () => {
  const handlers = () => ({ onResume: vi.fn(), onRestart: vi.fn(), onLevels: vi.fn() });

  it('names the level and offers resume, restart and the level select', () => {
    const root = pauseScreen({ title: '3. Hole Punch', ...handlers() });

    expect(root.querySelector('h2')?.textContent).toBe('Paused');
    expect(root.textContent).toContain('3. Hole Punch');
    expect(Array.from(root.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'Resume',
      'Restart level',
      'Level select',
    ]);
  });

  it('calls the matching handler', () => {
    const actions = handlers();
    const root = pauseScreen({ title: 'x', ...actions });

    click(root, 'Resume');
    click(root, 'Restart level');
    click(root, 'Level select');

    expect(actions.onResume).toHaveBeenCalledOnce();
    expect(actions.onRestart).toHaveBeenCalledOnce();
    expect(actions.onLevels).toHaveBeenCalledOnce();
  });

  it('makes resume the primary action', () => {
    const root = pauseScreen({ title: 'x', ...handlers() });

    expect(root.querySelector('button')?.className).toContain('button-primary');
  });
});
