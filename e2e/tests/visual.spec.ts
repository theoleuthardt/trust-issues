import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { advance, installFakeClock, openLevel } from '../support/clock';

test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });

const SHOT = { maxDiffPixels: 60 };

async function guestMenu(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();
}

async function serveBoard(page: Page): Promise<void> {
  await page.route('**/api/leaderboard/trust-nothing*', (route) =>
    route.fulfill({
      json: [
        { rank: 1, run_id: 1, username: 'alice', score: 1210, frames: 790, deaths: 0 },
        { rank: 2, run_id: 2, username: 'bob', score: 1010, frames: 903, deaths: 1 },
        { rank: 3, run_id: 3, username: 'carol', score: 940, frames: 960, deaths: 2 },
      ],
    }),
  );
  await page.route('**/api/players/alice', (route) =>
    route.fulfill({
      json: {
        username: 'alice',
        runs: [
          {
            run_id: 1,
            level_id: 'trust-nothing',
            score: 1210,
            frames: 790,
            deaths: 0,
            completed_at: '2026-10-14T20:00:00Z',
          },
          {
            run_id: 9,
            level_id: 'ground-rules',
            score: 980,
            frames: 1050,
            deaths: 3,
            completed_at: '2026-10-14T21:00:00Z',
          },
        ],
      },
    }),
  );
}

test('title screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('title.png', SHOT);
});

test('sign-in form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveScreenshot('sign-in.png', SHOT);
});

test('main menu', async ({ page }) => {
  await guestMenu(page);
  await expect(page).toHaveScreenshot('menu.png', SHOT);
});

test('level select', async ({ page }) => {
  await guestMenu(page);
  await page.getByRole('button', { name: 'Levels' }).click();
  await expect(page).toHaveScreenshot('levels.png', SHOT);
});

test('settings', async ({ page }) => {
  await guestMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page).toHaveScreenshot('settings.png', SHOT);
});

test('leaderboard', async ({ page }) => {
  await serveBoard(page);
  await guestMenu(page);
  await page.getByRole('button', { name: 'Leaderboards' }).click();
  await page.locator('.card').first().click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page).toHaveScreenshot('leaderboard.png', SHOT);
});

test('profile', async ({ page }) => {
  await serveBoard(page);
  await guestMenu(page);
  await page.getByRole('button', { name: 'Leaderboards' }).click();
  await page.locator('.card').first().click();
  await page.getByRole('button', { name: 'Profile of alice' }).click();
  await expect(page.locator('h2')).toHaveText('alice');
  await expect(page).toHaveScreenshot('profile.png', SHOT);
});

test('pause menu', async ({ page }) => {
  await openLevel(page, 'trust-nothing');
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen-pause')).toBeVisible();
  await expect(page).toHaveScreenshot('pause.png', SHOT);
});

for (const id of ['trust-nothing', 'looking-glass', 'ferryman', 'wrong-door']) {
  test(`start of ${id}`, async ({ page }) => {
    await installFakeClock(page);
    await openLevel(page, id);
    await advance(page, 30);
    await expect(page).toHaveScreenshot(`level-${id}.png`, SHOT);
  });
}
