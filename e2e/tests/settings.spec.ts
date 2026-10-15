import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Input } from '@trust-issues/sim';
import { SOLUTIONS } from '@trust-issues/sim/testing';
import { advance, installFakeClock, openLevel, playReplay } from '../support/clock';

async function openSettings(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
}

const jumpRow = (page: Page) => page.locator('[data-action="jump"]');

test('a key can be given to jump and the choice survives a reload', async ({ page }) => {
  await openSettings(page);

  await jumpRow(page).getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('KeyK');
  await expect(jumpRow(page)).toContainText('K');
  await expect(jumpRow(page)).not.toContainText('Space');

  await page.reload();
  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(jumpRow(page)).toContainText('K');
});

test('a key that another action uses is refused and the next key is still taken', async ({
  page,
}) => {
  await openSettings(page);

  await jumpRow(page).getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('KeyA');

  await expect(page.locator('[role=alert]')).toContainText('already used to move left');
  await expect(jumpRow(page)).toContainText('Press a key');

  await page.keyboard.press('KeyK');
  await expect(jumpRow(page)).toContainText('K');
});

test('the rebound key plays the game', async ({ page }) => {
  const solution = SOLUTIONS['trust-nothing'];
  await installFakeClock(page);
  await openSettings(page);
  await jumpRow(page).getByRole('button', { name: 'Change' }).click();
  await page.keyboard.press('KeyK');
  await page.getByRole('button', { name: 'Back' }).click();

  await openLevel(page, 'trust-nothing');
  await playReplay(page, solution?.replay ?? [], [
    [Input.Left, 'ArrowLeft'],
    [Input.Right, 'ArrowRight'],
    [Input.Jump, 'KeyK'],
  ]);
  await advance(page, 2);

  await expect(page.locator('#status')).toContainText(/cleared in/);
});

test('reduced motion and the touch layout are stored', async ({ page }) => {
  await openSettings(page);

  await page.getByLabel('Reduce motion').check();
  await page.locator('[data-size="large"]').click();
  await page.getByLabel('Swap the sides of the buttons').check();

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('trust-issues.settings.v1') ?? '{}'),
  );
  expect(stored.reducedMotion).toBe(true);
  expect(stored.touch).toMatchObject({ size: 'large', swapped: true });
  await expect(page.locator('body')).toHaveAttribute('data-touch-size', 'large');
  await expect(page.locator('body')).toHaveAttribute('data-touch-swapped', 'true');
});
