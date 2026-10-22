import { test, expect } from '@playwright/test';
import { newPlayer, createTeam } from './helpers';

/**
 * B-11: writing API endpoints require POST. A plain GET must be rejected with 405,
 * while the same request as POST (parameters stay in the query) still works. The
 * read endpoint dao.php must stay reachable via GET so the state reload keeps working.
 */
test('a writing endpoint rejects GET with 405 but accepts POST', async ({ browser }) => {
  const page = await newPlayer(browser);
  const boardUrl = await createTeam(page, 'PostTeam');
  const teamId = new URL(boardUrl).searchParams.get('t') as string;

  const writeUrl = `./api/newround.php?t=${encodeURIComponent(teamId)}`;

  const getRes = await page.request.get(writeUrl);
  expect(getRes.status()).toBe(405);

  const postRes = await page.request.post(writeUrl);
  expect(postRes.ok()).toBeTruthy();
});

test('the read endpoint dao.php still answers a GET', async ({ browser }) => {
  const page = await newPlayer(browser);
  const boardUrl = await createTeam(page, 'ReadTeam');
  const teamId = new URL(boardUrl).searchParams.get('t') as string;
  const sid = (await page.evaluate(() => localStorage.getItem('SID'))) as string;

  const res = await page.request.get(
    `./api/dao.php?id=${encodeURIComponent(sid)}&t=${encodeURIComponent(teamId)}`);
  expect(res.ok()).toBeTruthy();
});
