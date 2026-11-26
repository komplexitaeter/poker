import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pageReady, getSid, asUser } from './helpers';

/**
 * B-141: the color mode is kept on this device (localStorage COLOR_MODE) and set inline in the head, so the page
 * background is right from the first frame (also behind the spinner). The server value still wins when it arrives.
 */

const DARK_BG = 'rgb(12, 14, 18)';   // --bg dark
const LIGHT_BG = 'rgb(247, 246, 241)'; // --bg light

/** keeps a mode on the device before the first page (only if none is there, so the page may change it later) */
async function keepMode(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await page.context().addInitScript((m) => {
    try { if (!localStorage.getItem('COLOR_MODE')) localStorage.setItem('COLOR_MODE', m); } catch (e) { /* none */ }
  }, mode);
}

/** samples the background of the page (canvas: html, else body) every frame and on every DOM change until it shows */
async function sampleBackground(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any;
    w.__bg = [] as string[];
    w.__shownAt = null;
    const sample = () => {
      if (w.__shownAt !== null) return;
      const html = getComputedStyle(document.documentElement).backgroundColor;
      const clear = html === 'rgba(0, 0, 0, 0)' || html === 'transparent';
      const bg = !clear ? html : (document.body ? getComputedStyle(document.body).backgroundColor : html);
      w.__bg.push(bg);
      if (document.body && document.body.style.opacity === '1') w.__shownAt = Date.now();
    };
    new MutationObserver(sample).observe(document, { attributes: true, childList: true, subtree: true });
    const tick = () => { sample(); if (w.__shownAt === null) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

const samples = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__bg);
const shownAt = (page: Page): Promise<number | null> => page.evaluate(() => (window as any).__shownAt);

test('start page: with a kept light mode it shows at once and light from the first frame (B-141)', async ({ browser }) => {
  const page = await newPlayer(browser, { colorScheme: 'dark' });
  await keepMode(page, 'light');
  let answeredAt = 0;
  await page.route('**/api/get_user.php*', async route => {
    await new Promise(r => setTimeout(r, 5000));
    answeredAt = Date.now();
    await route.fulfill({ contentType: 'application/json', body: 'null' });
  });
  await sampleBackground(page);
  const started = Date.now();
  await page.goto('/');
  await expect.poll(() => shownAt(page), { timeout: 10_000 }).not.toBeNull();
  const at = (await shownAt(page))!;
  expect(at - started).toBeLessThan(2_500);                 // no wait for get_user.php
  expect(answeredAt === 0 || at < answeredAt).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains('light-theme'))).toBe(true);
  const bg = await samples(page);
  expect(bg.length).toBeGreaterThan(0);
  expect(bg).not.toContain(DARK_BG);
  expect(bg).toContain(LIGHT_BG);
  await expect(page.locator('#teaminput')).toBeFocused();
});

test('start page: without a kept mode the background follows the system until the page shows (B-141)', async ({ browser }) => {
  for (const colorScheme of ['dark', 'light'] as const) {
    const page = await newPlayer(browser, { colorScheme });
    await page.route('**/api/get_user.php*', route => route.fulfill({ contentType: 'application/json', body: 'null' }));
    await sampleBackground(page);
    await page.goto('/');
    await expect.poll(() => shownAt(page), { timeout: 10_000 }).not.toBeNull();
    const bg = await samples(page);
    expect(bg).not.toContain(colorScheme === 'light' ? DARK_BG : LIGHT_BG);
    expect(await page.evaluate(() => localStorage.getItem('COLOR_MODE'))).toBeNull(); // nothing kept without a choice
  }
});

test('board: with a kept light mode the board is light from the first frame (B-141)', async ({ browser }) => {
  const alice = await newPlayer(browser, { colorScheme: 'dark' });
  const url = await createTeam(alice, 'Color Local Board');
  await joinAsPlayer(alice, url, 'Alice');
  // light saved on the server (the user row exists since the first dao.php) and kept on the device
  const res = await alice.request.post('/api/update_user.php?color_mode=light', asUser(await getSid(alice)));
  expect(res.ok()).toBeTruthy();
  await alice.evaluate(() => localStorage.setItem('COLOR_MODE', 'light'));

  const page = await alice.context().newPage();
  await sampleBackground(page);
  await page.goto(url);
  await expect.poll(() => shownAt(page), { timeout: 15_000 }).not.toBeNull();
  const bg = await samples(page);
  expect(bg).not.toContain(DARK_BG);
  expect(bg).toContain(LIGHT_BG);
  await expect(page.locator('body')).toHaveClass(/light-theme/);
  await expect(page.locator('html')).toHaveClass(/pk-light/);
});

test('board: switching keeps the mode on the device, a different saved mode of the server wins (B-141)', async ({ browser }) => {
  const alice = await newPlayer(browser, { colorScheme: 'dark' });
  const url = await createTeam(alice, 'Color Local Switch');
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('body')).not.toHaveClass(/light-theme/);

  // the switch keeps the mode (B-152: the UID goes in the header, never in the URL)
  const written = alice.waitForRequest(r => r.url().includes('/api/update_user.php') && r.url().includes('color_mode=light'));
  await alice.locator('#cmode_btn').click();
  await written;
  await expect(alice.locator('body')).toHaveClass(/light-theme/);
  await expect(alice.locator('html')).toHaveClass(/pk-light/);
  expect(await alice.evaluate(() => localStorage.getItem('COLOR_MODE'))).toBe('light');

  // another device switched to dark meanwhile: on the next load the server value wins and is kept
  const res = await alice.request.post('/api/update_user.php?color_mode=dark', asUser(await getSid(alice)));
  expect(res.ok()).toBeTruthy();
  await alice.reload();
  await pageReady(alice);
  await expect(alice.locator('body')).not.toHaveClass(/light-theme/);
  await expect(alice.locator('html')).not.toHaveClass(/pk-light/);
  expect(await alice.evaluate(() => localStorage.getItem('COLOR_MODE'))).toBe('dark');
});
