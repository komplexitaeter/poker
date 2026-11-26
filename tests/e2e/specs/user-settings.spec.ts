import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, pageReady, getSid, asUser } from './helpers';

/**
 * The user row (pok_user_tbl) is created on joining a board (name.php); dao.php only reads it (missing row: defaults).
 * A user who switches a setting before ever joining a board has no row yet: update_user.php creates it when needed,
 * otherwise the setting would be lost silently (0 rows changed).
 */
test('a new user switches to light mode on the start page, the start page is light after a reload', async ({ browser }) => {
  const page = await newPlayer(browser, { colorScheme: 'dark' });
  await page.goto('/');
  await pageReady(page);
  await expect(page.locator('body')).not.toHaveClass(/light-theme/);

  const saved = page.waitForResponse(r => r.url().includes('update_user.php') && r.url().includes('color_mode=light'));
  await page.locator('#cmode_btn').click();
  await expect(page.locator('body')).toHaveClass(/light-theme/);
  expect((await saved).ok()).toBeTruthy();

  await page.reload();
  await pageReady(page);
  await expect(page.locator('body')).toHaveClass(/light-theme/);
  const res = await page.request.get('/api/get_user.php', asUser(await getSid(page)));
  expect((await res.json()).color_mode).toBe('light');
});

test('hide_teaser of a user without a row is stored and shows on the first board load', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Settings Without Row');
  const t = new URL(url).searchParams.get('t')!;

  // a brand-new SID that has never loaded a board
  const sid = ('s' + Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 16);
  const res = await alice.request.post('/api/update_user.php?hide_teaser=1', asUser(sid));
  expect(res.ok()).toBeTruthy();

  const dao = await alice.request.get(`/api/dao.php?t=${encodeURIComponent(t)}`, asUser(sid));
  expect(dao.status()).toBe(200);
  expect((await dao.json()).hide_teaser).toBe(1);
});
