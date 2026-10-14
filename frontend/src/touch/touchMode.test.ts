import { describe, expect, it } from 'vitest';
import { shouldShowTouchControls } from './touchMode';

describe('shouldShowTouchControls', () => {
  it('shows controls on coarse pointers by default', () => {
    expect(shouldShowTouchControls('', true)).toBe(true);
    expect(shouldShowTouchControls('', false)).toBe(false);
  });

  it('lets ?touch=1 force the controls on', () => {
    expect(shouldShowTouchControls('?touch=1', false)).toBe(true);
  });

  it('lets ?touch=0 force the controls off', () => {
    expect(shouldShowTouchControls('?touch=0', true)).toBe(false);
  });

  it('ignores other values', () => {
    expect(shouldShowTouchControls('?touch=maybe', true)).toBe(true);
  });
});
