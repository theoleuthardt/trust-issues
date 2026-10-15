import { expect, test } from '@playwright/test';
import { advance, installFakeClock, openLevel } from '../support/clock';

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

test.describe('a phone held upright', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('is asked to turn the device', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.rotate-hint')).toBeVisible();
    await expect(page.locator('.rotate-hint')).toContainText(/landscape/i);
  });
});

test.describe('a phone held sideways', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

  test('is not asked to turn the device', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.rotate-hint')).toBeHidden();
  });
});

test('a desktop browser is never asked to turn the device', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/');

  await expect(page.locator('.rotate-hint')).toBeHidden();
});

test('the leaderboard of a level reports a server that cannot be reached', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Leaderboards' }).click();
  await page.locator('.card').first().click();

  await expect(page.locator('[role=alert]')).toBeVisible();
});

test('a game chunk that cannot be fetched is reported and can be fetched again', async ({
  page,
}) => {
  await page.route('**/assets/runtime-*.js', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.locator('[role=alert]')).toContainText(/could not be loaded/i);

  await page.unroute('**/assets/runtime-*.js');
  await page.getByRole('button', { name: 'Try again' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-screen', 'game');
  await expect(page.locator('canvas')).toBeVisible();
});

test('the menus work with the keyboard alone', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'menu');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'levels');
  await page.keyboard.press('Enter');

  await expect(page.locator('body')).toHaveAttribute('data-screen', 'game');
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen-pause')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
});

test('a focused menu button looks different from the same button when it is not focused', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();
  const levels = page.getByRole('button', { name: 'Levels' });
  const look = () =>
    levels.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return `${style.backgroundColor}|${style.color}`;
    });

  await page.keyboard.press('Tab');
  await expect(levels).toBeFocused();
  const focused = await look();
  await page.keyboard.press('Tab');
  await expect(levels).not.toBeFocused();
  const idle = await look();

  expect(focused).not.toBe(idle);
});

test('running into a trap again and again keeps the game running', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installFakeClock(page);
  await openLevel(page, 'trust-nothing');

  await page.keyboard.down('ArrowRight');
  await advance(page, 400);
  await page.keyboard.up('ArrowRight');
  await advance(page, 10);

  expect(errors).toEqual([]);
  await expect(page.locator('canvas')).toBeVisible();
});
