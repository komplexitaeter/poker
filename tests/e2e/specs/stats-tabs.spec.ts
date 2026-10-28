import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, gotoStats } from './helpers';

/**
 * B-64: stats.php with tabs. The live tab (default) lists the active tables by team name and must never
 * contain a team id (the access key of a board), neither as text nor in links or attributes.
 * stats.php needs a login (B-63): gotoStats() in helpers.ts logs in through the form.
 */

test('live tab shows an active table by name, no tab contains the team id', async ({ browser }) => {
  const page = await newPlayer(browser);
  const teamName = `Live <i>${Date.now().toString(36)}</i> & co`;
  const url = await createTeam(page, teamName);
  const t = new URL(url).searchParams.get('t') as string;
  expect(t.length).toBeGreaterThan(5);
  await joinAsPlayer(page, url, 'Liv');

  const admin = await page.context().newPage();
  await gotoStats(admin, '/stats.php');
  await expect(admin.locator('.tabs a[aria-current="page"]')).toHaveText('Live');
  await expect(admin.locator('meta[http-equiv="refresh"]')).toHaveCount(1);   // auto reload in the live tab only
  const row = admin.locator('tr.live-table').filter({ has: admin.locator('td.team-name', { hasText: teamName }) });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td.team-name i')).toHaveCount(0);   // escaped
  await expect(row.locator('td').nth(1)).toHaveText('1');      // one player
  await expect(row.locator('td').nth(4)).toHaveText('Fibonacci');
  await expect(row.locator('td').last()).toHaveText('0 of 1 laid');

  // a single player with a card: revealed (as the board shows it)
  await pickCard(page, 'three01');
  await admin.reload();
  await expect(row.locator('td').last()).toHaveText('revealed');

  for (const tab of ['live', 'usage', 'ideas', 'tech']) {
    const res = await admin.request.get(`./stats.php?tab=${tab}`);
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).not.toContain(t);
    expect(html).not.toContain(encodeURIComponent(t));
    expect(html).not.toContain('Query failed');
    expect(html.includes('http-equiv="refresh"')).toBe(tab === 'live');
  }

  await gotoStats(admin, '/stats.php?tab=usage');
  await expect(admin.locator('table.weeks tbody tr')).toHaveCount(9);
  await gotoStats(admin, '/stats.php?tab=nonsense');   // unknown tab: live
  await expect(admin.locator('.tabs a[aria-current="page"]')).toHaveText('Live');
});

test('"Rounds per day" counts a new round for today (live and usage tab)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, `Rounds ${Date.now().toString(36)}`);
  await joinAsPlayer(page, url, 'Rob');
  await pickCard(page, 'three01');
  await page.locator('#newroundbtn').click();
  await expect(page.locator('#ctl img#three01')).not.toHaveClass(/selected/);

  const admin = await page.context().newPage();
  await gotoStats(admin, '/stats.php');
  await expect(admin.locator('.chart.days .day')).toHaveCount(28);
  const today = admin.locator('.chart.days .day.today');
  expect(Number(await today.getAttribute('data-rounds'))).toBeGreaterThanOrEqual(1);
  await expect(today).toHaveAttribute('title', /\d+ rounds, [1-9]\d* teams/);

  await gotoStats(admin, '/stats.php?tab=usage');
  const usageToday = admin.locator('table.event-days tr.current');
  expect(Number(await usageToday.locator('td').nth(1).textContent())).toBeGreaterThanOrEqual(1);   // rounds
  expect(Number(await usageToday.locator('td').nth(2).textContent())).toBeGreaterThanOrEqual(1);   // teams
});
