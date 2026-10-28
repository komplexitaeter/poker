import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard } from './helpers';

/**
 * B-64: stats.php with tabs. The live tab (default) lists the active tables by team name and must never
 * contain a team id (the access key of a board), neither as text nor in links or attributes.
 * In the e2e setup stats.php has no basic auth (that is nginx config on the servers only).
 */

test('live tab shows an active table by name, no tab contains the team id', async ({ browser }) => {
  const page = await newPlayer(browser);
  const teamName = `Live <i>${Date.now().toString(36)}</i> & co`;
  const url = await createTeam(page, teamName);
  const t = new URL(url).searchParams.get('t') as string;
  expect(t.length).toBeGreaterThan(5);
  await joinAsPlayer(page, url, 'Liv');

  const admin = await page.context().newPage();
  await admin.goto('/stats.php');
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

  await admin.goto('/stats.php?tab=usage');
  await expect(admin.locator('table.weeks tbody tr')).toHaveCount(9);
  await admin.goto('/stats.php?tab=nonsense');   // unknown tab: live
  await expect(admin.locator('.tabs a[aria-current="page"]')).toHaveText('Live');
});
