import { describe, expect, it } from 'vitest';
import { validateCredentials, validateNewPassword } from './credentials';

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

describe('validateNewPassword', () => {
  it('accepts a different password of the right length that was typed twice', () => {
    expect(
      validateNewPassword('old-password-123', 'brand-new-password', 'brand-new-password'),
    ).toBe(undefined);
  });

  it('rejects a mismatch', () => {
    expect(
      validateNewPassword('old-password-123', 'brand-new-password', 'brand-new-passw0rd'),
    ).toMatch(/do not match/i);
  });

  it('rejects the old password again', () => {
    expect(validateNewPassword('old-password-123', 'old-password-123', 'old-password-123')).toMatch(
      /different/i,
    );
  });

  it('applies the length rules', () => {
    expect(validateNewPassword('old-password-123', 'short', 'short')).toMatch(/12 to 128/);
  });

  it('asks for the current password', () => {
    expect(validateNewPassword('', 'brand-new-password', 'brand-new-password')).toMatch(/current/i);
  });
});
