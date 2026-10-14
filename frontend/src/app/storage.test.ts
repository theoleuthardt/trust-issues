import { describe, expect, it } from 'vitest';
import { memoryStorage } from './storage';

describe('memoryStorage', () => {
  it('returns null for unknown keys', () => {
    expect(memoryStorage().getItem('x')).toBeNull();
  });

  it('keeps what was written', () => {
    const storage = memoryStorage();
    storage.setItem('x', '1');

    expect(storage.getItem('x')).toBe('1');
  });

  it('forgets removed keys', () => {
    const storage = memoryStorage();
    storage.setItem('x', '1');
    storage.removeItem('x');

    expect(storage.getItem('x')).toBeNull();
  });
});
