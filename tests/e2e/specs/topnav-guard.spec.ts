import { test, expect } from '@playwright/test';
import { newPlayer } from './helpers';

/**
 * B-26: toggleTopnav (the document click handler that closes all boxes when you click outside the
 * topnav) calls toggle_topic_box(false) on every page. #topic_box only exists on board.html, so on
 * the start page (init.html) the toggle used to read `null.style` and throw a TypeError, which broke
 * the toggles that ran after it. A click outside the topnav must not raise any console/page error.
 */
test('clicking outside the topnav on the start page raises no error', async ({ browser }) => {
  const page = await newPlayer(browser);

  // Uncaught JS exceptions (the old bug threw a TypeError here). Blocked external resources
  // (analytics) surface as console "Failed to load resource" errors and are expected in this
  // test setup, so we only assert on real page errors plus non-network console errors.
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await expect(page.locator('#teaminput')).toBeVisible();

  // Click outside the topnav -> fires toggleTopnav -> toggle_topic_box(false) etc.
  await page.locator('#teaminput').click();

  expect(errors).toEqual([]);
});
