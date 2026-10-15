import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SIM_VERSION, getLevel } from '@trust-issues/sim';
import { SOLUTIONS } from '@trust-issues/sim/testing';
import { advance, installFakeClock, playReplay } from '../support/clock';

const LEVEL_ID = 'trust-nothing';
const solution = SOLUTIONS[LEVEL_ID];
const revision = getLevel(LEVEL_ID)?.revision ?? 1;

async function serveBoard(
  page: Page,
  replayOverrides: Record<string, unknown> = {},
): Promise<void> {
  await page.route(`**/api/leaderboard/${LEVEL_ID}*`, (route) =>
    route.fulfill({
      json: [{ rank: 1, run_id: 7, username: 'alice', score: 1000, frames: 903, deaths: 0 }],
    }),
  );
  await page.route('**/api/replays/7', (route) =>
    route.fulfill({
      json: {
        run_id: 7,
        level_id: LEVEL_ID,
        username: 'alice',
        score: 1000,
        frames: solution?.frames ?? 0,
        deaths: 0,
        replay: solution?.replay ?? [],
        sim_version: SIM_VERSION,
        level_revision: revision,
        ...replayOverrides,
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

test('a run from the leaderboard can be watched to the end', async ({ page }) => {
  await installFakeClock(page);
  await serveBoard(page);
  await openBoard(page);

  await page.getByRole('button', { name: 'Watch the run of alice' }).click();
  await advance(page, 6);
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'replay');
  await advance(page, (solution?.frames ?? 0) + 10);

  await expect(page.locator('#status')).toHaveText('Replay finished');
});

test('the speed keys make the replay run faster', async ({ page }) => {
  await installFakeClock(page);
  await serveBoard(page);
  await openBoard(page);
  await page.getByRole('button', { name: 'Watch the run of alice' }).click();
  await advance(page, 6);

  await page.keyboard.press('5');
  await advance(page, Math.floor((solution?.frames ?? 0) / 4) - 40);
  await expect(page.locator('#status')).not.toHaveText('Replay finished');
  await advance(page, 60);

  await expect(page.locator('#status')).toHaveText('Replay finished');
});

test('escape closes the viewer and returns to the board', async ({ page }) => {
  await installFakeClock(page);
  await serveBoard(page);
  await openBoard(page);
  await page.getByRole('button', { name: 'Watch the run of alice' }).click();
  await advance(page, 6);

  await page.keyboard.press('Escape');

  await expect(page.locator('body')).toHaveAttribute('data-screen', 'board');
  await expect(page.getByRole('button', { name: 'Watch the run of alice' })).toBeVisible();
});

test('a run of another game version is reported instead of played', async ({ page }) => {
  await serveBoard(page, { sim_version: SIM_VERSION + 1 });
  await openBoard(page);

  await page.getByRole('button', { name: 'Watch the run of alice' }).click();

  await expect(page.locator('[role=alert]')).toContainText(/another version/i);
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'board');
});

test('a run that no longer exists is reported on the board', async ({ page }) => {
  await serveBoard(page);
  await page.route('**/api/replays/7', (route) =>
    route.fulfill({ status: 404, json: { detail: 'unknown run' } }),
  );
  await openBoard(page);

  await page.getByRole('button', { name: 'Watch the run of alice' }).click();

  await expect(page.locator('[role=alert]')).toBeVisible();
});

test('the ghost can be switched on while playing and the choice is kept', async ({ page }) => {
  await installFakeClock(page);
  await page.goto(`/?level=${LEVEL_ID}`);
  await advance(page, 6);
  await playReplay(page, solution?.replay ?? []);
  await advance(page, 2);
  await page.keyboard.press('r');
  await advance(page, 2);

  await page.keyboard.press('g');

  await expect(page.locator('#status')).toHaveText('Ghost on');
  expect(await page.evaluate(() => window.localStorage.getItem('trust-issues.ghost.v1'))).toBe(
    'on',
  );
});
