import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LEVELS } from '@trust-issues/sim';

async function serve(page: Page): Promise<void> {
  await page.route('**/api/leaderboard/trust-nothing*', (route) =>
    route.fulfill({
      json: [{ rank: 1, run_id: 7, username: 'alice', score: 1000, frames: 903, deaths: 0 }],
    }),
  );
  await page.route('**/api/players/alice', (route) =>
    route.fulfill({
      json: {
        username: 'alice',
        runs: [
          {
            run_id: 7,
            level_id: 'trust-nothing',
            score: 1000,
            frames: 903,
            deaths: 0,
            completed_at: '2026-10-14T20:00:00Z',
          },
        ],
      },
    }),
  );
}

async function openBoard(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as guest' }).click();
  await page.getByRole('button', { name: 'Leaderboards' }).click();
  await page.locator('.card').first().click();
}

test('a name on the leaderboard opens the profile with every level', async ({ page }) => {
  await serve(page);
  await openBoard(page);

  await page.getByRole('button', { name: 'Profile of alice' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-screen', 'profile');
  await expect(page.locator('h2')).toHaveText('alice');
  await expect(page.locator('tbody tr')).toHaveCount(LEVELS.length);
  await expect(page.locator('tbody tr').first()).toContainText('0:15.05');
  await expect(page.getByRole('button', { name: /^Watch the run of alice on/ })).toHaveCount(1);
});

test('back from a profile returns to the leaderboard it was opened from', async ({ page }) => {
  await serve(page);
  await openBoard(page);
  await page.getByRole('button', { name: 'Profile of alice' }).click();

  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-screen', 'board');
  await expect(page.getByRole('button', { name: 'Profile of alice' })).toBeVisible();
});

test('an unknown player is reported on the profile screen', async ({ page }) => {
  await serve(page);
  await page.route('**/api/players/alice', (route) =>
    route.fulfill({ status: 404, json: { detail: 'unknown player' } }),
  );
  await openBoard(page);

  await page.getByRole('button', { name: 'Profile of alice' }).click();

  await expect(page.locator('[role=alert]')).toContainText('no player');
});
