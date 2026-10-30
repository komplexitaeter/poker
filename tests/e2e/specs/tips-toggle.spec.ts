import { test, expect } from '@playwright/test';
import { newPlayer, createTeam } from './helpers';

/**
 * B-96: team setting "Tips" (backend). update_team.php takes show_tips = 0/1 (exactly these values, anything else is
 * ignored), dao.php returns show_tips as a number, default 1. Invalid team ids get 403, GET gets 405.
 */

test('show_tips defaults to 1, is stored per team and ignores invalid values', async ({ browser }) => {
  const page = await newPlayer(browser);
  const boardUrl = await createTeam(page, 'TipsToggleTeam');
  const t = encodeURIComponent(new URL(boardUrl).searchParams.get('t') as string);
  const sid = encodeURIComponent((await page.evaluate(() => localStorage.getItem('SID'))) as string);
  const showTips = async () => {
    const res = await page.request.get(`./api/dao.php?id=${sid}&t=${t}`);
    expect(res.ok()).toBeTruthy();
    return (await res.json()).show_tips;
  };
  const update = (value: string) =>
    page.request.post(`./api/update_team.php?t=${t}&show_tips=${encodeURIComponent(value)}`);

  expect(await showTips()).toBe(1);

  expect((await update('0')).status()).toBe(200);
  expect(await showTips()).toBe(0);

  // only exactly "0" or "1": everything else leaves the setting unchanged
  for (const value of ['1abc', '2', '-1', 'true', ' 1', '01', '']) {
    expect((await update(value)).status(), `show_tips=${value}`).toBe(200);
    expect(await showTips(), `show_tips=${value}`).toBe(0);
  }

  expect((await update('1')).status()).toBe(200);
  expect(await showTips()).toBe(1);

  // the other team settings in the same endpoint keep working without show_tips
  expect((await page.request.post(`./api/update_team.php?t=${t}&name=${encodeURIComponent('Renamed')}`)).status())
    .toBe(200);
  expect(await showTips()).toBe(1);

  // writing via GET is rejected
  expect((await page.request.get(`./api/update_team.php?t=${t}&show_tips=0`)).status()).toBe(405);
  expect(await showTips()).toBe(1);
});

test('show_tips for an unknown team id is rejected with 403', async ({ browser }) => {
  const page = await newPlayer(browser);
  await createTeam(page, 'TipsToggleOtherTeam');
  const res = await page.request.post('./api/update_team.php?t=NoSuchTeamId0000&show_tips=0');
  expect(res.status()).toBe(403);
});
