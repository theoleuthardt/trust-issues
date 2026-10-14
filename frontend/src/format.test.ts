import { describe, expect, it } from 'vitest';
import { formatTime } from './format';

describe('formatTime', () => {
  it('formats frames as seconds with two decimals at 60 ticks per second', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(60)).toBe('0:01.00');
    expect(formatTime(290)).toBe('0:04.83');
  });

  it('rolls over to minutes', () => {
    expect(formatTime(60 * 75 + 30)).toBe('1:15.50');
  });
});
