import { Input } from '@trust-issues/sim';
import type { StorageLike } from './storage';

export type Action = 'left' | 'right' | 'jump';
export type TouchSize = 'small' | 'medium' | 'large';

export interface Settings {
  keys: Record<Action, string[]>;
  touch: { size: TouchSize; swapped: boolean; opacity: number };
  sound: { muted: boolean; volume: number; music: boolean };
  reducedMotion: boolean;
}

export const ACTIONS: readonly Action[] = ['left', 'right', 'jump'];
export const TOUCH_SIZES: readonly TouchSize[] = ['small', 'medium', 'large'];
export const MIN_OPACITY = 30;
export const MAX_OPACITY = 100;

export const DEFAULT_SETTINGS: Settings = {
  keys: {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump: ['ArrowUp', 'KeyW', 'Space'],
  },
  touch: { size: 'medium', swapped: false, opacity: 60 },
  sound: { muted: false, volume: 60, music: true },
  reducedMotion: false,
};

const ACTION_BITS: Record<Action, number> = {
  left: Input.Left,
  right: Input.Right,
  jump: Input.Jump,
};

const ACTION_NAMES: Record<Action, string> = {
  left: 'move left',
  right: 'move right',
  jump: 'jump',
};

const RESERVED = new Set(['Escape', 'Enter', 'NumpadEnter', 'Tab', 'KeyR', 'KeyG', 'KeyL', 'KeyS']);
const RESERVED_PATTERNS = [/^Digit[1-5]$/, /^F\d{1,2}$/, /^(Shift|Control|Alt|Meta)(Left|Right)$/];

const SETTINGS_KEY = 'trust-issues.settings.v1';

/** The simulation input bit for every key code of `keys`. */
export function bindingsOf(keys: Record<Action, string[]>): Record<string, number> {
  const bindings: Record<string, number> = {};
  for (const action of ACTIONS) {
    for (const code of keys[action]) bindings[code] = ACTION_BITS[action];
  }
  return bindings;
}

/** Whether a key may be given to an action: not one the game or the browser needs itself. */
export function isBindable(code: string): boolean {
  if (code === '' || RESERVED.has(code)) return false;
  return !RESERVED_PATTERNS.some((pattern) => pattern.test(code));
}

export type RebindResult = { ok: true; settings: Settings } | { ok: false; reason: string };

/** Makes `code` the only key of `action`; refuses reserved keys and keys of another action. */
export function rebind(settings: Settings, action: Action, code: string): RebindResult {
  if (!isBindable(code)) return { ok: false, reason: `${code || 'That key'} cannot be used.` };
  for (const other of ACTIONS) {
    if (other !== action && settings.keys[other].includes(code)) {
      return { ok: false, reason: `${code} is already used to ${ACTION_NAMES[other]}.` };
    }
  }
  return { ok: true, settings: { ...settings, keys: { ...settings.keys, [action]: [code] } } };
}

export function resetKeys(settings: Settings): Settings {
  return { ...settings, keys: DEFAULT_SETTINGS.keys };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseKeys(value: unknown): Record<Action, string[]> {
  const keys: Record<Action, string[]> = {
    left: DEFAULT_SETTINGS.keys.left,
    right: DEFAULT_SETTINGS.keys.right,
    jump: DEFAULT_SETTINGS.keys.jump,
  };
  if (!isRecord(value)) return keys;
  const taken = new Set<string>();
  for (const action of ACTIONS) {
    const stored = value[action];
    if (!Array.isArray(stored)) continue;
    const usable = stored.filter(
      (code): code is string => typeof code === 'string' && isBindable(code) && !taken.has(code),
    );
    if (usable.length === 0) continue;
    keys[action] = usable;
    for (const code of usable) taken.add(code);
  }
  return keys;
}

function parseTouch(value: unknown): Settings['touch'] {
  const touch = { ...DEFAULT_SETTINGS.touch };
  if (!isRecord(value)) return touch;
  if (TOUCH_SIZES.includes(value.size as TouchSize)) touch.size = value.size as TouchSize;
  if (typeof value.swapped === 'boolean') touch.swapped = value.swapped;
  const opacity = value.opacity;
  if (
    typeof opacity === 'number' &&
    Number.isInteger(opacity) &&
    opacity >= MIN_OPACITY &&
    opacity <= MAX_OPACITY
  ) {
    touch.opacity = opacity;
  }
  return touch;
}

function parseSound(value: unknown): Settings['sound'] {
  const sound = { ...DEFAULT_SETTINGS.sound };
  if (!isRecord(value)) return sound;
  if (typeof value.muted === 'boolean') sound.muted = value.muted;
  if (typeof value.music === 'boolean') sound.music = value.music;
  const volume = value.volume;
  if (typeof volume === 'number' && Number.isInteger(volume) && volume >= 0 && volume <= 100) {
    sound.volume = volume;
  }
  return sound;
}

/**
 * Reads stored settings. Every damaged part falls back to its default on its own; without a
 * stored choice, reduced motion follows the system preference.
 */
export function parseSettings(raw: string | null, systemReducedMotion: boolean): Settings {
  let stored: unknown;
  try {
    stored = raw === null ? undefined : JSON.parse(raw);
  } catch {
    stored = undefined;
  }
  const source = isRecord(stored) ? stored : {};
  return {
    keys: parseKeys(source.keys),
    touch: parseTouch(source.touch),
    sound: parseSound(source.sound),
    reducedMotion:
      typeof source.reducedMotion === 'boolean' ? source.reducedMotion : systemReducedMotion,
  };
}

type Listener = (settings: Settings) => void;

/**
 * The settings of this browser. Changes are written to the storage and passed to listeners;
 * when the storage refuses, the settings live in memory for the session.
 */
export class SettingsStore {
  private settings: Settings;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly storage: StorageLike,
    systemReducedMotion: boolean,
  ) {
    this.settings = parseSettings(SettingsStore.read(storage), systemReducedMotion);
  }

  private static read(storage: StorageLike): string | null {
    try {
      return storage.getItem(SETTINGS_KEY);
    } catch {
      return null;
    }
  }

  current(): Settings {
    return this.settings;
  }

  update(change: (settings: Settings) => Settings): void {
    this.settings = change(this.settings);
    this.persist();
    for (const listener of this.listeners) listener(this.settings);
  }

  private persist(): void {
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      return;
    }
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }
}
