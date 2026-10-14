import { describe, expect, it } from 'vitest';
import { validateCredentials } from './credentials';

const GOOD_PASSWORD = 'correct-horse-battery';

describe('validateCredentials', () => {
  it('accepts a valid registration', () => {
    expect(validateCredentials('register', 'Mallory_1', GOOD_PASSWORD)).toBeUndefined();
  });

  it('requires a username of 3 to 24 letters, digits or underscores on registration', () => {
    expect(validateCredentials('register', 'ab', GOOD_PASSWORD)).toMatch(/username/i);
    expect(validateCredentials('register', 'a'.repeat(25), GOOD_PASSWORD)).toMatch(/username/i);
    expect(validateCredentials('register', 'has space', GOOD_PASSWORD)).toMatch(/username/i);
    expect(validateCredentials('register', 'émile', GOOD_PASSWORD)).toMatch(/username/i);
  });

  it('requires a password of 12 to 128 characters on registration', () => {
    expect(validateCredentials('register', 'mallory', 'short')).toMatch(/password/i);
    expect(validateCredentials('register', 'mallory', 'x'.repeat(129))).toMatch(/password/i);
    expect(validateCredentials('register', 'mallory', 'x'.repeat(12))).toBeUndefined();
  });

  it('only requires something to be typed when signing in', () => {
    expect(validateCredentials('login', 'm', 'x')).toBeUndefined();
    expect(validateCredentials('login', '', 'x')).toMatch(/username/i);
    expect(validateCredentials('login', 'm', '')).toMatch(/password/i);
  });

  it('trims the username before checking it', () => {
    expect(validateCredentials('register', '  mallory  ', GOOD_PASSWORD)).toBeUndefined();
  });
});
