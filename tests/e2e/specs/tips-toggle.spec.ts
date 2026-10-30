import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard } from './helpers';

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

/**
 * B-96 (frontend): Board settings → Team → "Tips" switches the tips in the column (#round_tip) off and on for
 * the whole team. Other boards follow without a reload (B-81), the setting survives a reload, the deck hints
 * ("keys 1–9 pick a card") stay. Each switch is measured (TIPS_OFF / TIPS_ON).
 */
const DESKTOP = { width: 1400, height: 800 };

async function openTeamTab(page: Page) {
  await page.locator('#cset_btn').click();
  await page.locator('#cset_box').getByRole('tab', { name: 'Team' }).click();
  await expect(page.locator('#cet_show_tips')).toBeVisible();
}

const tipsRadio = (page: Page, value: '0' | '1') => page.locator(`input[name=cet_show_tips][value="${value}"]`);

test('the "Tips" switch hides and shows the tip on every board of the team (B-96)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Tips Switch');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP });
  await joinAsPlayer(bob, url, 'Bob');

  const measured: string[] = [];
  alice.on('request', r => {
    if (r.url().includes('/api/measure_event.php')) measured.push(new URL(r.url()).searchParams.get('event_code') ?? '');
  });

  for (const page of [alice, bob]) {
    await expect(page.locator('#round_tip')).toHaveText(/^Pick the card that fits best/);
    await expect(page.locator('#round_tip')).toBeVisible();
    await expect(page.locator('.deck-hint')).toBeVisible();
  }

  // default on, with a short hint
  await openTeamTab(alice);
  await expect(tipsRadio(alice, '1')).toBeChecked();
  await expect(alice.locator('#cet_show_tips .hint')).toHaveText('Short suggestions in the side column what to do next.');

  // off: gone on both boards, without a reload; the deck hint stays
  await tipsRadio(alice, '0').check();
  for (const page of [alice, bob]) {
    await expect(page.locator('#round_tip')).toBeHidden();
    await expect(page.locator('#round_tip')).toBeEmpty();
    await expect(page.locator('.deck-hint')).toBeVisible();
  }
  await expect.poll(() => measured).toContain('TIPS_OFF');

  // the round goes on: still no tip, also below the revealed spread (no room kept for it)
  await alice.locator('#menu_close').click();
  await expect(alice.locator('dialog#menu')).not.toHaveAttribute('open');
  await pickCard(alice, 'three01');
  await pickCard(bob, 'five001');
  await expect(bob.locator('#round_status')).toHaveText('revealed');
  await expect(bob.locator('#spread')).toBeVisible();
  await expect(bob.locator('#round_tip')).toBeHidden();
  expect(await bob.locator('#round_tip').boundingBox()).toBeNull();

  // survives a reload; Bob's menu shows the team setting
  await bob.reload();
  await expect(bob.locator('#round_status')).toHaveText('revealed');
  await expect(bob.locator('#round_tip')).toBeHidden();
  await openTeamTab(bob);
  await expect(tipsRadio(bob, '0')).toBeChecked();

  // on again (by Bob): back on both boards
  await tipsRadio(bob, '1').check();
  for (const page of [alice, bob]) {
    await expect(page.locator('#round_tip')).toBeVisible();
    await expect(page.locator('#round_tip')).not.toBeEmpty();
  }
  await openTeamTab(alice);
  await expect(tipsRadio(alice, '1')).toBeChecked();
  expect(measured).not.toContain('TIPS_ON'); // Bob switched it on, not Alice
});
