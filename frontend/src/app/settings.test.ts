import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SettingsStore,
  bindingsOf,
  isBindable,
  parseSettings,
  rebind,
  resetKeys,
} from './settings';
import { memoryStorage } from './storage';

describe('defaults', () => {
  it('keep the keys the game always had', () => {
    expect(DEFAULT_SETTINGS.keys).toEqual({
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      jump: ['ArrowUp', 'KeyW', 'Space'],
    });
  });

  it('start with medium touch controls, unswapped and see-through, and normal motion', () => {
    expect(DEFAULT_SETTINGS.touch).toEqual({ size: 'medium', swapped: false, opacity: 60 });
    expect(DEFAULT_SETTINGS.reducedMotion).toBe(false);
  });
});

describe('sound defaults', () => {
  it('start unmuted at a moderate volume', () => {
    expect(DEFAULT_SETTINGS.sound).toEqual({ muted: false, volume: 60 });
  });
});

describe('bindingsOf', () => {
  it('maps every key to the bit of its action', () => {
    const bindings = bindingsOf(DEFAULT_SETTINGS.keys);

    expect(bindings.ArrowLeft).toBe(1);
    expect(bindings.KeyD).toBe(2);
    expect(bindings.Space).toBe(4);
  });
});

describe('isBindable', () => {
  it.each(['KeyK', 'KeyQ', 'ArrowDown', 'Space', 'Numpad4', 'Comma', 'Semicolon'])(
    'accepts %s',
    (code) => {
      expect(isBindable(code)).toBe(true);
    },
  );

  it.each([
    'Escape',
    'Enter',
    'NumpadEnter',
    'Tab',
    'KeyR',
    'KeyG',
    'KeyL',
    'KeyS',
    'Digit1',
    'Digit5',
    'F5',
    'ShiftLeft',
    'ControlRight',
    'AltLeft',
    'MetaLeft',
    '',
  ])('refuses %s, which the game or the browser needs', (code) => {
    expect(isBindable(code)).toBe(false);
  });
});

describe('rebind', () => {
  it('makes the chosen key the only key of the action', () => {
    const result = rebind(DEFAULT_SETTINGS, 'jump', 'KeyK');

    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.settings.keys.jump).toEqual(['KeyK']);
  });

  it('leaves the other actions alone', () => {
    const result = rebind(DEFAULT_SETTINGS, 'jump', 'KeyK');

    if (!result.ok) throw new Error('expected success');
    expect(result.settings.keys.left).toEqual(['ArrowLeft', 'KeyA']);
    expect(result.settings.keys.right).toEqual(['ArrowRight', 'KeyD']);
  });

  it('refuses a key another action uses and names that action', () => {
    const result = rebind(DEFAULT_SETTINGS, 'jump', 'KeyA');

    expect(result).toEqual({ ok: false, reason: 'KeyA is already used to move left.' });
  });

  it('accepts a key the same action already has', () => {
    expect(rebind(DEFAULT_SETTINGS, 'jump', 'Space')).toMatchObject({ ok: true });
  });

  it('refuses a reserved key', () => {
    expect(rebind(DEFAULT_SETTINGS, 'left', 'Escape')).toMatchObject({ ok: false });
  });
});

describe('resetKeys', () => {
  it('restores the default keys and keeps the other settings', () => {
    const changed = rebind({ ...DEFAULT_SETTINGS, reducedMotion: true }, 'jump', 'KeyK');
    if (!changed.ok) throw new Error('expected success');

    const reset = resetKeys(changed.settings);

    expect(reset.keys).toEqual(DEFAULT_SETTINGS.keys);
    expect(reset.reducedMotion).toBe(true);
  });
});

describe('parseSettings', () => {
  it('reads what it wrote', () => {
    const settings = {
      keys: { left: ['KeyJ'], right: ['KeyK'], jump: ['Space'] },
      touch: { size: 'large' as const, swapped: true, opacity: 60 },
      sound: { muted: true, volume: 20 },
      reducedMotion: true,
    };

    expect(parseSettings(JSON.stringify(settings), false)).toEqual(settings);
  });

  it('falls back to the defaults for missing or damaged data', () => {
    expect(parseSettings(null, false)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json', false)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]', false)).toEqual(DEFAULT_SETTINGS);
  });

  it('repairs only the damaged part', () => {
    const raw = JSON.stringify({
      keys: { left: 'KeyJ', right: ['KeyK'], jump: [] },
      touch: { size: 'huge', swapped: true, opacity: 500 },
      reducedMotion: 'yes',
    });

    const settings = parseSettings(raw, false);

    expect(settings.keys.left).toEqual(DEFAULT_SETTINGS.keys.left);
    expect(settings.keys.right).toEqual(['KeyK']);
    expect(settings.keys.jump).toEqual(DEFAULT_SETTINGS.keys.jump);
    expect(settings.touch).toEqual({ size: 'medium', swapped: true, opacity: 60 });
    expect(settings.reducedMotion).toBe(false);
  });

  it('drops stored keys that are reserved or shared between actions', () => {
    const raw = JSON.stringify({
      keys: { left: ['Escape', 'KeyJ'], right: ['KeyJ'], jump: ['Space'] },
    });

    const { keys } = parseSettings(raw, false);

    expect(keys.left).toEqual(['KeyJ']);
    expect(keys.right).toEqual(DEFAULT_SETTINGS.keys.right);
  });

  it('reads the sound settings and repairs damaged ones', () => {
    const stored = parseSettings(JSON.stringify({ sound: { muted: true, volume: 30 } }), false);
    const damaged = parseSettings(JSON.stringify({ sound: { muted: 'no', volume: 500 } }), false);

    expect(stored.sound).toEqual({ muted: true, volume: 30 });
    expect(damaged.sound).toEqual(DEFAULT_SETTINGS.sound);
  });

  it('takes reduced motion from the system when nothing was stored', () => {
    expect(parseSettings(null, true).reducedMotion).toBe(true);
    expect(parseSettings(JSON.stringify({ reducedMotion: false }), true).reducedMotion).toBe(false);
  });
});

describe('SettingsStore', () => {
  it('keeps changes across instances of the same storage', () => {
    const storage = memoryStorage();
    const store = new SettingsStore(storage, false);

    store.update((settings) => ({ ...settings, reducedMotion: true }));

    expect(new SettingsStore(storage, false).current().reducedMotion).toBe(true);
  });

  it('tells listeners about every change', () => {
    const store = new SettingsStore(memoryStorage(), false);
    const seen: boolean[] = [];
    store.subscribe((settings) => seen.push(settings.reducedMotion));

    store.update((settings) => ({ ...settings, reducedMotion: true }));

    expect(seen).toEqual([true]);
  });

  it('keeps working in memory when the storage refuses', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => undefined,
    };
    const store = new SettingsStore(broken, false);

    store.update((settings) => ({ ...settings, reducedMotion: true }));

    expect(store.current().reducedMotion).toBe(true);
  });
});
