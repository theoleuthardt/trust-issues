import { expect, test } from '@playwright/test';
import { advance, installFakeClock } from '../support/clock';

test('a guest can open the first level from the title screen', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-screen', 'game');
  await expect(page.locator('canvas')).toBeVisible();
});

test('the second level is locked until the first one is cleared', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();

  await page.getByRole('button', { name: 'Levels' }).click();

  await expect(page.locator('.card').nth(0)).toBeEnabled();
  await expect(page.locator('.card').nth(1)).toBeDisabled();
});

test('escape pauses the run and escape again resumes it', async ({ page }) => {
  await page.goto('/?level=trust-nothing');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'game');

  await page.keyboard.press('Escape');
  await expect(page.locator('.screen-pause')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.screen-pause')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'game');
});

test.describe('touch devices', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

  test('show the on-screen controls and a menu button that pauses', async ({ page }) => {
    await page.goto('/?level=trust-nothing');

    await expect(page.locator('.touch-controls')).toBeVisible();
    await page.locator('.touch-menu').tap();

    await expect(page.locator('.screen-pause')).toBeVisible();
  });
});

test('the leaderboard of a level reports a server that cannot be reached', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Leaderboards' }).click();
  await page.locator('.card').first().click();

  await expect(page.locator('[role=alert]')).toBeVisible();
});

test('running into a trap again and again keeps the game running', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installFakeClock(page);
  await page.goto('/?level=trust-nothing');
  await advance(page, 6);

  await page.keyboard.down('ArrowRight');
  await advance(page, 900);
  await page.keyboard.up('ArrowRight');
  await advance(page, 10);

  expect(errors).toEqual([]);
  await expect(page.locator('canvas')).toBeVisible();
});
