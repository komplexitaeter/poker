import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, gotoStats, STATS_USER, STATS_PASSWORD } from './helpers';

/**
 * B-63: stats.php has its own login page. Credentials come from the htpasswd file (bcrypt only), "stay logged
 * in" is a signed cookie user|expires|hmac. Without a valid cookie the page shows the login form and no data.
 */

const AUTH_COOKIE = 'pokstats_auth';

async function login(page: Page, user: string, password: string) {
  const form = page.locator('form.login');
  await form.locator('input[name=user]').fill(user);
  await form.locator('input[name=password]').fill(password);
  await form.getByRole('button', { name: 'Log in' }).click();
}

const authCookie = async (page: Page) => (await page.context().cookies()).find(c => c.name === AUTH_COOKIE);

test('without login only the form, wrong password and non-bcrypt entries rejected, login, logout', async ({ browser }) => {
  // an active table whose name must not show up before the login
  const player = await newPlayer(browser);
  const teamName = `Secret table ${Date.now().toString(36)}`;
  await joinAsPlayer(player, await createTeam(player, teamName), 'Sam');
  await pickCard(player, 'three01');
  await player.locator('#newroundbtn').click();   // finished round: the table counts as active
  await expect(player.locator('#ctl .ctl[data-card="three01"]')).not.toHaveClass(/selected/);

  const page = await newPlayer(browser);
  for (const tab of ['live', 'usage', 'ideas', 'tech']) {
    const res = await page.request.get(`./stats.php?tab=${tab}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="login"');
    expect(html).not.toContain(teamName);
    expect(html).not.toContain('class="tabs"');
    expect(html).not.toContain('http-equiv="refresh"');
  }

  // no session (form token) for anonymous calls
  expect((await page.context().cookies()).some(c => c.name === 'pokstats')).toBe(false);

  await page.goto('/stats.php?tab=usage');
  await expect(page.locator('input[name=user]')).toHaveAttribute('autocomplete', 'username');
  await expect(page.locator('input[name=password]')).toHaveAttribute('autocomplete', 'current-password');

  await login(page, STATS_USER, 'wrong');
  await expect(page.locator('form.login .error')).toHaveText('Wrong user or password.');
  await login(page, 'e2e-md5', 'e2e-secret');   // $apr1$ entry: rejected even with a matching password
  await expect(page.locator('form.login .error')).toHaveText('Wrong user or password.');
  expect(await authCookie(page)).toBeUndefined();

  await login(page, STATS_USER, STATS_PASSWORD);
  await expect(page).toHaveURL(/stats\.php\?tab=usage$/);   // back on the requested tab
  await expect(page.locator('.tabs a[aria-current="page"]')).toHaveText('Usage');
  const cookie = await authCookie(page);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/stats.php' });
  const days = (cookie!.expires * 1000 - Date.now()) / 86400000;
  expect(days).toBeGreaterThan(29.9);   // persistent cookie: survives a browser restart
  expect(days).toBeLessThan(30.1);
  await gotoStats(page, '/stats.php');
  await expect(page.locator('td.team-name', { hasText: teamName })).toHaveCount(1);

  await page.locator('form.logout').getByRole('button', { name: 'Log out' }).click();
  await expect(page.locator('form.login')).toBeVisible();
  expect(await authCookie(page)).toBeUndefined();
});

test('manipulated or foreign cookies and moderation POSTs without login are rejected', async ({ browser }) => {
  const page = await newPlayer(browser);
  await gotoStats(page, '/stats.php?tab=ideas');
  const csrf = await page.locator('form.logout input[name=csrf]').inputValue();
  const valid = (await authCookie(page))!;
  const [user, expires, sig] = decodeURIComponent(valid.value).split('|');
  expect(user).toBe(STATS_USER);

  const tampered = [
    `${user}|${Number(expires) + 86400}|${sig}`,              // longer validity
    `e2e-md5|${expires}|${sig}`,                               // other user
    `${user}|${expires}|${sig.replace(/^./, c => c === 'a' ? 'b' : 'a')}`,   // signature changed
    `${user}|${Math.floor(Date.now() / 1000) - 10}|${sig}`,   // expired
    'garbage',
  ];
  const form = { action: 'roadmap_save', csrf, type: 'FEATURE', title: `Tampered ${Date.now()}`, status: 'PLANNED', sort_order: '0', visible: '1' };
  for (const value of tampered) {
    await page.context().addCookies([{ ...valid, value: encodeURIComponent(value) }]);
    await page.goto('/stats.php?tab=ideas');
    await expect(page.locator('form.login')).toBeVisible();
    await expect(page.locator('form.rm')).toHaveCount(0);
    expect((await page.request.post('./stats.php', { form })).status()).toBe(403);
  }
  await page.context().clearCookies({ name: AUTH_COOKIE });
  expect((await page.request.post('./stats.php', { form })).status()).toBe(403);
  const list = await (await page.request.get('./api/get_roadmap.php')).json();
  expect(list.items.some((i: { title: string }) => i.title === form.title)).toBe(false);

  // the untouched cookie still works
  await page.context().addCookies([valid]);
  await page.goto('/stats.php?tab=ideas');
  await expect(page.locator('form.logout')).toBeVisible();
});
