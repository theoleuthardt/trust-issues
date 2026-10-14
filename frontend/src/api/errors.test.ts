import { describe, expect, it } from 'vitest';
import { messageFor } from './errors';

describe('messageFor', () => {
  it('explains a taken username', () => {
    expect(messageFor(409, { detail: 'username already taken' })).toMatch(/taken/i);
  });

  it('does not reveal which part of a login was wrong', () => {
    expect(messageFor(401, { detail: 'invalid username or password' })).toMatch(
      /username or password/i,
    );
  });

  it('uses the first validation message the server sends', () => {
    const body = {
      detail: 'Validation failed',
      extra: [{ message: 'Expected `str` of length >= 12', key: 'password', source: 'body' }],
    };

    expect(messageFor(400, body)).toMatch(/length >= 12/);
  });

  it('falls back to a generic message for validation errors without details', () => {
    expect(messageFor(400, { detail: 'Bad Request' })).toMatch(/check/i);
  });

  it('tells a player who is locked out or sending too often to wait', () => {
    expect(messageFor(429, { detail: 'too many attempts' })).toMatch(/too many attempts/i);
    expect(messageFor(429, {}, 'run')).toMatch(/too many/i);
  });

  it('asks to try again later for server errors', () => {
    expect(messageFor(503, {})).toMatch(/later/i);
    expect(messageFor(500, undefined)).toMatch(/later/i);
  });

  it('has a message for anything else', () => {
    expect(messageFor(418, {})).toMatch(/went wrong/i);
  });
});

describe('messageFor with a context', () => {
  it('asks to sign in again when a run is rejected as unauthorised', () => {
    expect(messageFor(401, { detail: 'Unauthorized' }, 'run')).toMatch(/sign in again/i);
  });

  it('says a run was not accepted and why', () => {
    expect(messageFor(422, { detail: 'replay does not finish the level' }, 'run')).toBe(
      'The run was not accepted: replay does not finish the level.',
    );
  });

  it('does not talk about usernames for a conflict while sending a run', () => {
    expect(messageFor(409, {}, 'run')).not.toMatch(/username/i);
  });

  it('says the level is unknown to the server', () => {
    expect(messageFor(404, { detail: 'unknown level' }, 'run')).toMatch(/level/i);
  });
});
