import type { Page } from '@playwright/test';
import { Input } from '@trust-issues/sim';

const TICK_MS = 1000 / 60;
const KEYS: readonly (readonly [number, string])[] = [
  [Input.Left, 'ArrowLeft'],
  [Input.Right, 'ArrowRight'],
  [Input.Jump, 'Space'],
];

interface FakeClockWindow {
  __advance: (ms: number) => void;
}

/**
 * Replaces the frame clock of the page with one the test drives tick by tick, so a run is
 * exactly as long as the inputs fed to it, independent of the speed of the machine.
 */
export async function installFakeClock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let now = 1000;
    let callbacks: FrameRequestCallback[] = [];
    let id = 0;
    window.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return ++id;
    };
    window.cancelAnimationFrame = () => undefined;
    performance.now = () => now;
    (window as unknown as FakeClockWindow).__advance = (ms: number) => {
      now += ms;
      const run = callbacks;
      callbacks = [];
      for (const callback of run) callback(now);
    };
  });
}

/**
 * Opens a level directly and waits until the game chunk is loaded and the scene has started,
 * so inputs that follow are not lost to a game that is still being fetched.
 */
export async function openLevel(page: Page, levelId: string): Promise<void> {
  await page.goto(`/?level=${levelId}`);
  await page.waitForSelector('body[data-screen="game"]');
  await page.waitForSelector('canvas');
  await advance(page, 6);
}

export async function advance(page: Page, frames: number): Promise<void> {
  await page.evaluate(
    ([count, ms]) => {
      for (let i = 0; i < count; i++) (window as unknown as FakeClockWindow).__advance(ms);
    },
    [frames, TICK_MS] as const,
  );
}

/** Plays a run-length encoded replay (`[mask, count, ...]`) through the keyboard. */
export async function playReplay(
  page: Page,
  replay: readonly number[],
  keys: readonly (readonly [number, string])[] = KEYS,
): Promise<void> {
  const held = new Set<string>();
  for (let index = 0; index < replay.length; index += 2) {
    const mask = replay[index] ?? 0;
    const count = replay[index + 1] ?? 0;
    for (const [bit, key] of keys) {
      const wanted = (mask & bit) !== 0;
      if (wanted && !held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      } else if (!wanted && held.has(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    }
    await advance(page, count);
  }
  for (const key of held) await page.keyboard.up(key);
}
