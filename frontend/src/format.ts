import { TICKS_PER_SECOND } from '@trust-issues/sim';

/** Formats a tick count as `m:ss.cc`. */
export function formatTime(frames: number): string {
  const totalSeconds = Math.floor(frames / TICKS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor(((frames % TICKS_PER_SECOND) * 100) / TICKS_PER_SECOND);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
