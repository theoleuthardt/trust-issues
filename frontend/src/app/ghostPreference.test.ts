import { describe, expect, it } from 'vitest';
import { GhostPreference } from './ghostPreference';
import { memoryStorage } from './storage';

describe('GhostPreference', () => {
  it('is off until the player turns it on', () => {
    expect(new GhostPreference(memoryStorage()).enabled()).toBe(false);
  });

  it('keeps the choice across instances of the same storage', () => {
    const storage = memoryStorage();
    new GhostPreference(storage).set(true);

    expect(new GhostPreference(storage).enabled()).toBe(true);
    new GhostPreference(storage).set(false);
    expect(new GhostPreference(storage).enabled()).toBe(false);
  });

  it('keeps working when the storage refuses to read or write', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => undefined,
    };
    const preference = new GhostPreference(broken);

    preference.set(true);

    expect(preference.enabled()).toBe(true);
  });
});
