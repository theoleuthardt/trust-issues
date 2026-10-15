import { describe, expect, it } from 'vitest';
import { escapeAction } from './escape';

describe('escapeAction', () => {
  it('pauses a running game', () => {
    expect(escapeAction('game', false)).toBe('pause');
  });

  it('resumes a paused game', () => {
    expect(escapeAction('pause', false)).toBe('resume');
  });

  it('closes the replay viewer', () => {
    expect(escapeAction('replay', false)).toBe('close');
    expect(escapeAction('replay', true)).toBe('none');
  });

  it('ignores key repeat so holding the key does not flicker the menu', () => {
    expect(escapeAction('game', true)).toBe('none');
    expect(escapeAction('pause', true)).toBe('none');
  });

  it('does nothing on the other screens', () => {
    for (const screen of ['title', 'auth', 'menu', 'levels', 'board', 'account', undefined]) {
      expect(escapeAction(screen, false)).toBe('none');
    }
  });
});
