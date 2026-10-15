// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './settings';
import { keyLabel, settingsScreen } from './screens';

function render(overrides: Partial<Parameters<typeof settingsScreen>[0]> = {}) {
  const calls = {
    rebind: vi.fn((): string | undefined => undefined),
    reset: vi.fn(),
    size: vi.fn(),
    swapped: vi.fn(),
    opacity: vi.fn(),
    muted: vi.fn(),
    volume: vi.fn(),
    music: vi.fn(),
    motion: vi.fn(),
    back: vi.fn(),
  };
  const root = settingsScreen({
    settings: DEFAULT_SETTINGS,
    onRebind: calls.rebind,
    onResetKeys: calls.reset,
    onTouchSize: calls.size,
    onTouchSwapped: calls.swapped,
    onTouchOpacity: calls.opacity,
    onSoundMuted: calls.muted,
    onSoundVolume: calls.volume,
    onMusic: calls.music,
    onReducedMotion: calls.motion,
    onBack: calls.back,
    ...overrides,
  });
  document.body.append(root);
  return { root, calls };
}

const press = (code: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true, bubbles: true }));

const rowOf = (root: HTMLElement, action: string) =>
  root.querySelector<HTMLElement>(`[data-action="${action}"]`) as HTMLElement;

describe('keyLabel', () => {
  it.each([
    ['ArrowLeft', '←'],
    ['ArrowRight', '→'],
    ['ArrowUp', '↑'],
    ['ArrowDown', '↓'],
    ['Space', 'Space'],
    ['KeyK', 'K'],
    ['Digit7', '7'],
    ['Comma', 'Comma'],
  ])('shows %s as %s', (code, label) => {
    expect(keyLabel(code)).toBe(label);
  });
});

describe('settingsScreen keys', () => {
  it('lists the keys of every action', () => {
    const { root } = render();

    expect(rowOf(root, 'left').textContent).toContain('←');
    expect(rowOf(root, 'left').textContent).toContain('A');
    expect(rowOf(root, 'jump').textContent).toContain('Space');
  });

  it('waits for a key after Change and hands it to onRebind', () => {
    const { root, calls } = render();

    rowOf(root, 'jump').querySelector('button')?.click();
    expect(rowOf(root, 'jump').textContent).toMatch(/press a key/i);
    press('KeyK');

    expect(calls.rebind).toHaveBeenCalledWith('jump', 'KeyK');
  });

  it('stops listening after one key', () => {
    const { root, calls } = render();
    rowOf(root, 'jump').querySelector('button')?.click();
    press('KeyK');

    press('KeyJ');

    expect(calls.rebind).toHaveBeenCalledTimes(1);
  });

  it('cancels with Escape without changing anything', () => {
    const { root, calls } = render();
    rowOf(root, 'left').querySelector('button')?.click();

    press('Escape');

    expect(calls.rebind).not.toHaveBeenCalled();
    expect(rowOf(root, 'left').textContent).not.toMatch(/press a key/i);
  });

  it('shows why a key was refused and keeps listening for another', () => {
    const rebind = vi.fn((): string | undefined => 'KeyA is already used to move left.');
    const { root } = render({ onRebind: rebind });
    rowOf(root, 'jump').querySelector('button')?.click();

    press('KeyA');

    expect(root.querySelector('[role=alert]')?.textContent).toBe(
      'KeyA is already used to move left.',
    );
    press('KeyK');
    expect(rebind).toHaveBeenCalledTimes(2);
  });

  it('resets the keys', () => {
    const { root, calls } = render();

    Array.from(root.querySelectorAll('button'))
      .find((button) => /reset keys/i.test(button.textContent ?? ''))
      ?.click();

    expect(calls.reset).toHaveBeenCalledOnce();
  });
});

describe('settingsScreen touch and motion', () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    touch: { size: 'large', swapped: true, opacity: 60 },
    reducedMotion: true,
  };

  it('shows the current choices', () => {
    const { root } = render({ settings });

    expect(root.querySelector('[data-size="large"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-size="small"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector<HTMLInputElement>('input[name=swapped]')?.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input[name=opacity]')?.value).toBe('60');
    expect(root.querySelector<HTMLInputElement>('input[name=motion]')?.checked).toBe(true);
  });

  it('reports every change', () => {
    const { root, calls } = render();

    root.querySelector<HTMLButtonElement>('[data-size="small"]')?.click();
    const swapped = root.querySelector<HTMLInputElement>('input[name=swapped]');
    if (swapped) {
      swapped.checked = true;
      swapped.dispatchEvent(new Event('change'));
    }
    const opacity = root.querySelector<HTMLInputElement>('input[name=opacity]');
    if (opacity) {
      opacity.value = '50';
      opacity.dispatchEvent(new Event('change'));
    }
    const motion = root.querySelector<HTMLInputElement>('input[name=motion]');
    if (motion) {
      motion.checked = true;
      motion.dispatchEvent(new Event('change'));
    }

    expect(calls.size).toHaveBeenCalledWith('small');
    expect(calls.swapped).toHaveBeenCalledWith(true);
    expect(calls.opacity).toHaveBeenCalledWith(50);
    expect(calls.motion).toHaveBeenCalledWith(true);
  });

  it('shows and reports the sound settings', () => {
    const { root, calls } = render({
      settings: { ...DEFAULT_SETTINGS, sound: { muted: true, volume: 40, music: false } },
    });
    const muted = root.querySelector<HTMLInputElement>('input[name=muted]');
    const volume = root.querySelector<HTMLInputElement>('input[name=volume]');

    expect(muted?.checked).toBe(true);
    expect(volume?.value).toBe('40');
    if (muted) {
      muted.checked = false;
      muted.dispatchEvent(new Event('change'));
    }
    if (volume) {
      volume.value = '80';
      volume.dispatchEvent(new Event('change'));
    }
    const music = root.querySelector<HTMLInputElement>('input[name=music]');
    expect(music?.checked).toBe(false);
    if (music) {
      music.checked = true;
      music.dispatchEvent(new Event('change'));
    }
    expect(calls.muted).toHaveBeenCalledWith(false);
    expect(calls.volume).toHaveBeenCalledWith(80);
    expect(calls.music).toHaveBeenCalledWith(true);
  });

  it('has a fullscreen button only when the browser offers fullscreen', () => {
    const without = render().root;
    const onFullscreen = vi.fn();
    const withIt = render({ onFullscreen }).root;

    const button = Array.from(withIt.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === 'Toggle fullscreen',
    );
    button?.click();

    expect(
      Array.from(without.querySelectorAll('button')).some(
        (candidate) => candidate.textContent === 'Toggle fullscreen',
      ),
    ).toBe(false);
    expect(onFullscreen).toHaveBeenCalledOnce();
  });

  it('goes back', () => {
    const { root, calls } = render();

    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === 'Back')
      ?.click();

    expect(calls.back).toHaveBeenCalledOnce();
  });

  it('stops listening for keys when the screen is left', () => {
    const { root, calls } = render();
    rowOf(root, 'jump').querySelector('button')?.click();
    Array.from(root.querySelectorAll('button'))
      .find((button) => button.textContent === 'Back')
      ?.click();

    press('KeyK');

    expect(calls.rebind).not.toHaveBeenCalled();
  });

  it.each([
    [
      'Reset keys',
      (root: HTMLElement) =>
        Array.from(root.querySelectorAll('button'))
          .find((button) => /reset keys/i.test(button.textContent ?? ''))
          ?.click(),
    ],
    [
      'a touch size',
      (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[data-size="large"]')?.click(),
    ],
    [
      'the swap',
      (root: HTMLElement) => {
        const input = root.querySelector<HTMLInputElement>('input[name=swapped]');
        if (input) {
          input.checked = true;
          input.dispatchEvent(new Event('change'));
        }
      },
    ],
    [
      'the opacity',
      (root: HTMLElement) => {
        const input = root.querySelector<HTMLInputElement>('input[name=opacity]');
        if (input) {
          input.value = '50';
          input.dispatchEvent(new Event('change'));
        }
      },
    ],
    [
      'reduced motion',
      (root: HTMLElement) => {
        const input = root.querySelector<HTMLInputElement>('input[name=motion]');
        if (input) {
          input.checked = true;
          input.dispatchEvent(new Event('change'));
        }
      },
    ],
  ])('stops listening for a key when %s is used', (_name, act) => {
    const { root, calls } = render();
    rowOf(root, 'jump').querySelector('button')?.click();

    act(root);
    press('KeyK');

    expect(calls.rebind).not.toHaveBeenCalled();
  });
});
