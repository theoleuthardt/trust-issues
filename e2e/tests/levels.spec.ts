import { expect, test } from '@playwright/test';
import { LEVELS } from '@trust-issues/sim';
import { SOLUTIONS } from '@trust-issues/sim/testing';
import { advance, installFakeClock, playReplay } from '../support/clock';

const SAMPLE = new Set([
  'trust-nothing',
  'wall-street',
  'stairway-to-nowhere',
  'low-ceiling',
  'final-exam',
  'mind-games',
  'wrong-door',
]);
const levels = process.env.E2E_ALL_LEVELS ? LEVELS : LEVELS.filter((level) => SAMPLE.has(level.id));

for (const level of levels) {
  test(`${level.name} is cleared by its reference solution in the built game`, async ({ page }) => {
    const solution = SOLUTIONS[level.id];
    expect(solution, `no reference solution for ${level.id}`).toBeDefined();
    if (!solution) return;

    await installFakeClock(page);
    await page.goto(`/?level=${level.id}`);
    await advance(page, 6);

    await playReplay(page, solution.replay);
    await advance(page, 2);

    await expect(page.locator('#status')).toContainText(/cleared in .* with 0 deaths, \d+ points/);
  });
}
