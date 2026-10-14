import { describe, expect, it } from 'vitest';
import { SESSION_KEY, SessionStore } from './session';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const base64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const tokenExpiring = (exp: number) => `header.${base64url({ sub: '1', exp })}.signature`;

const NOW_SECONDS = 1_800_000_000;
const clock = () => NOW_SECONDS * 1000;

describe('SessionStore', () => {
  it('starts signed out', () => {
    expect(new SessionStore(new MemoryStorage(), clock).current()).toBeUndefined();
  });

  it('keeps a saved session', () => {
    const storage = new MemoryStorage();
    const token = tokenExpiring(NOW_SECONDS + 3600);
    new SessionStore(storage, clock).save(token, 'mallory');

    expect(new SessionStore(storage, clock).current()).toEqual({ token, username: 'mallory' });
  });

  it('treats an expired token as signed out and forgets it', () => {
    const storage = new MemoryStorage();
    new SessionStore(storage, clock).save(tokenExpiring(NOW_SECONDS - 1), 'mallory');

    const store = new SessionStore(storage, clock);

    expect(store.current()).toBeUndefined();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('treats a token that cannot be read as signed out', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_KEY, JSON.stringify({ token: 'garbage', username: 'x' }));

    expect(new SessionStore(storage, clock).current()).toBeUndefined();
  });

  it('forgets the session on sign out', () => {
    const storage = new MemoryStorage();
    const store = new SessionStore(storage, clock);
    store.save(tokenExpiring(NOW_SECONDS + 3600), 'mallory');

    store.clear();

    expect(store.current()).toBeUndefined();
  });

  it('keeps the session in memory when the storage refuses writes', () => {
    const storage = {
      getItem: (): string | null => null,
      setItem: (): void => {
        throw new Error('denied');
      },
      removeItem: (): void => undefined,
    };
    const store = new SessionStore(storage, clock);
    const token = tokenExpiring(NOW_SECONDS + 3600);

    store.save(token, 'mallory');

    expect(store.current()).toEqual({ token, username: 'mallory' });
  });
});
