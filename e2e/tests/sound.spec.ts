import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { advance, installFakeClock, openLevel } from '../support/clock';

interface CountingWindow {
  __oscillators: number;
}

async function countOscillators(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counting = window as unknown as CountingWindow;
    counting.__oscillators = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      counting.__oscillators += 1;
      return original.call(this);
    };
  });
}

const oscillators = (page: Page) =>
  page.evaluate(() => (window as unknown as CountingWindow).__oscillators);

test('a jump makes a sound once the page was used', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'trust-issues.settings.v1',
      JSON.stringify({ sound: { muted: false, volume: 60, music: false } }),
    );
  });
  await installFakeClock(page);
  await countOscillators(page);
  await openLevel(page, 'trust-nothing');

  await page.keyboard.down('Space');
  await advance(page, 4);
  await page.keyboard.up('Space');

  await expect.poll(() => oscillators(page)).toBeGreaterThan(0);
});

test('nothing is played when the sound is muted in the settings', async ({ page }) => {
  await installFakeClock(page);
  await countOscillators(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Mute').check();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.evaluate(() => undefined);

  await openLevel(page, 'trust-nothing');
  await page.keyboard.down('Space');
  await advance(page, 4);
  await page.keyboard.up('Space');

  expect(await oscillators(page)).toBe(0);
});

test('music starts in the menus after the first key press and stops when turned off', async ({
  page,
}) => {
  await countOscillators(page);
  await page.goto('/');
  await page.keyboard.press('Shift');

  await expect.poll(() => oscillators(page), { timeout: 8000 }).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Music').uncheck();
  const before = await oscillators(page);
  await page.waitForTimeout(1500);

  expect(await oscillators(page)).toBe(before);
});
