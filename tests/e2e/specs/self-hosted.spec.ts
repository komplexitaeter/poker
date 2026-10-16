import { test, expect } from '@playwright/test';
import { createTeam, joinAsPlayer, tableCard } from './helpers';

// B-15: all third-party libraries are self-hosted under src/vendor/ and the board must work with
// every external host unreachable. Here we harden that: a context that aborts anything not served
// from 127.0.0.1/localhost, and we assert that no same-origin request (i.e. a vendor file) was
// blocked while the board boots and renders topic markdown.

test('board boots and renders markdown with all external hosts blocked', async ({ browser }) => {
  const context = await browser.newContext();
  const blocked: string[] = [];
  const vendorFailures: string[] = [];

  await context.route(/^https?:\/\//, route => {
    const host = new URL(route.request().url()).hostname;
    if (host === '127.0.0.1' || host === 'localhost') return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('requestfailed', req => {
    // a self-hosted vendor asset that fails to load would break the board
    if (req.url().includes('/src/vendor/')) vendorFailures.push(req.url());
  });

  const url = await createTeam(page, 'Offline Team');
  await joinAsPlayer(page, url, 'Alice');
  await expect(tableCard(page, 'Alice')).toBeVisible();

  // the self-hosted libraries loaded despite the blockade
  const libs = await page.evaluate(() => ({
    remarkable: typeof (window as any).Remarkable,
    qr: typeof (window as any).QRCodeStyling,
    confetti: typeof (window as any).JSConfetti,
  }));
  expect(libs.remarkable).toBe('function');
  expect(libs.qr).toBe('function');
  expect(libs.confetti).toBe('function');

  // remarkable renders markdown without any CDN
  await page.locator('#topic_btn').click();
  await page.locator('#topic_txt').pressSequentially('**bold** and [link](https://example.com/)');
  await page.locator('#topic_save').click();
  await expect(page.locator('#topic strong')).toHaveText('bold');
  await expect(page.locator('#topic a', { hasText: 'link' })).toHaveAttribute('href', 'https://example.com/');

  // at least one external host was actually blocked (proves the blockade is in effect)
  expect(blocked.length).toBeGreaterThan(0);
  // and no self-hosted vendor asset failed to load
  expect(vendorFailures).toEqual([]);

  await context.close();
});

test('the promo close button is an inline SVG, not a font-awesome icon', async ({ browser }) => {
  const context = await browser.newContext();
  await context.route(/^https?:\/\//, route => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' || host === 'localhost' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  await createTeam(page, 'Promo Icon Team');

  await expect(page.locator('.promo-close svg')).toHaveCount(1);
  await expect(page.locator('.promo-close i.fas')).toHaveCount(0);

  await context.close();
});
