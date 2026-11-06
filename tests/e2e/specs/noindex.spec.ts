import { test, expect } from '@playwright/test';
import { createTeam } from './helpers';

/**
 * Boards must never be indexed by search engines, the team ID in the URL is their only protection:
 * the board response carries "X-Robots-Tag: noindex" plus the robots meta tag, the start page carries neither,
 * and robots.txt only allows "/" and "/index.php" without query.
 */

test('board is noindex, start page stays indexable', async ({ page }) => {
  const start = await page.request.get('/');
  expect(start.ok()).toBeTruthy();
  expect(start.headers()['x-robots-tag']).toBeUndefined();
  expect(await start.text()).not.toContain('name="robots"');

  const boardUrl = await createTeam(page, 'Noindex Team');
  const board = await page.request.get(boardUrl);
  expect(board.ok()).toBeTruthy();
  expect(board.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('robots.txt does not allow board URLs', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.ok()).toBeTruthy();
  const lines = (await res.text()).split(/\r?\n/).map((l) => l.trim());
  expect(lines).toContain('Allow: /index.php$');
  expect(lines).not.toContain('Allow: /index.php');
});
