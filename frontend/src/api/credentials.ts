export type AuthMode = 'login' | 'register';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

/**
 * Mirrors the rules of the API so mistakes are caught before a request. The server stays the
 * authority; signing in only checks that something was typed, so it never explains rules to
 * someone guessing a password.
 */
export function validateCredentials(
  mode: AuthMode,
  username: string,
  password: string,
): string | undefined {
  const name = username.trim();
  if (mode === 'login') {
    if (name === '') return 'Enter your username.';
    if (password === '') return 'Enter your password.';
    return undefined;
  }
  if (!USERNAME_PATTERN.test(name)) {
    return 'Username needs 3 to 24 letters, digits or underscores.';
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return `Password needs ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

/** Checks a new password the way the server will, plus what only the form can know. */
export function validateNewPassword(
  current: string,
  next: string,
  again: string,
): string | undefined {
  if (current === '') return 'Enter your current password.';
  if (next.length < MIN_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH) {
    return `Password needs ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (next !== again) return 'The new passwords do not match.';
  if (next === current) return 'Choose a different password than the current one.';
  return undefined;
}
