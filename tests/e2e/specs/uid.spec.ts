import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam } from './helpers';

/**
 * B-152 BE-1 (API level): api/uid.php hands out a new user id (16 characters Base32, POST only, never cached, writes
 * nothing), and the endpoints take the UID from the header X-Poker-User. The header wins over the URL parameter id,
 * which keeps working for old clients until BE-2.
 */

const HEADER = 'X-Poker-User';
const sid = (suffix: string) => `E2EUID${Date.now().toString(36)}${suffix}`.slice(0, 16).toUpperCase();

function teamIdOf(url: string): string {
  return new URL(url).searchParams.get('t') as string;
}

async function post(page: Page, endpoint: string, params: Record<string, string>, uid: string | null = null) {
  return page.request.post(`/api/${endpoint}?${new URLSearchParams(params).toString()}`,
    uid === null ? {} : { headers: { [HEADER]: uid } });
}

async function dao(page: Page, params: Record<string, string>, uid: string | null = null) {
  const res = await page.request.get(`/api/dao.php?${new URLSearchParams(params).toString()}`,
    uid === null ? {} : { headers: { [HEADER]: uid } });
  expect(res.status()).toBe(200);
  return res.json();
}

test('uid.php: POST gives a new 16-character Base32 id, never cached; GET is refused', async ({ browser }) => {
  const page = await newPlayer(browser);
  const first = await page.request.post('/api/uid.php');
  expect(first.status()).toBe(200);
  expect(first.headers()['cache-control']).toContain('no-store');
  expect(first.headers()['cache-control']).toContain('private');
  const a = (await first.json()).id;
  const b = (await (await page.request.post('/api/uid.php')).json()).id;
  expect(a).toMatch(/^[A-Z2-7]{16}$/);
  expect(b).toMatch(/^[A-Z2-7]{16}$/);
  expect(a).not.toBe(b);

  expect((await page.request.get('/api/uid.php')).status()).toBe(405);
});

test('the UID is taken from the header X-Poker-User; the URL id still works and loses against the header', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = teamIdOf(await createTeam(page, 'Uid Header'));
  const [anna, bert] = [sid('A'), sid('B')];

  // join through the header only (no id= in the URL), and through the old URL parameter
  expect((await post(page, 'name.php', { t, name: 'Anna', type: 'player' }, anna)).ok()).toBeTruthy();
  expect((await post(page, 'name.php', { t, id: bert, name: 'Bert', type: 'player' })).ok()).toBeTruthy();
  // a new person without a name is not created (400), with header or URL id
  expect((await post(page, 'name.php', { t, name: '', type: 'player' }, sid('C'))).status()).toBe(400);
  expect((await post(page, 'name.php', { t, id: sid('D'), name: '', type: 'player' })).status()).toBe(400);

  // a card through the header, a card through the URL id
  expect((await post(page, 'setc.php', { t, cardkey: 'three01' }, anna)).ok()).toBeTruthy();
  expect((await post(page, 'setc.php', { t, id: bert, cardkey: 'five001' })).ok()).toBeTruthy();

  // the answer contains the own state of the header's UID: no cache may store it (B-152)
  const raw = await page.request.get(`/api/dao.php?t=${encodeURIComponent(t)}`, { headers: { [HEADER]: anna } });
  expect(raw.headers()['cache-control']).toBe('no-store, private');
  expect(raw.headers()['vary']).toContain('X-Poker-User');

  let data = await dao(page, { t }, anna);
  expect(data).toMatchObject({ name: 'Anna', selected_card_key: 'three01' });
  expect(data.players.map((p: { name: string }) => p.name).sort()).toEqual(['Anna', 'Bert']);
  expect(JSON.stringify(data)).not.toContain(bert); // never the UID of another person
  expect(await dao(page, { t, id: bert })).toMatchObject({ name: 'Bert', selected_card_key: 'five001' });

  // header and URL id both present: the header wins
  expect(await dao(page, { t, id: bert }, anna)).toMatchObject({ name: 'Anna' });
  expect((await post(page, 'setc.php', { t, id: bert, cardkey: 'eight01' }, anna)).ok()).toBeTruthy();
  expect(await dao(page, { t }, anna)).toMatchObject({ selected_card_key: 'eight01' });
  expect(await dao(page, { t }, bert)).toMatchObject({ selected_card_key: 'five001' });

  // an invalid header does not fall back to the URL id: the write changes nothing
  expect((await post(page, 'setc.php', { t, id: bert, cardkey: 'one0001' }, 'bad id!')).status()).toBeLessThan(500);
  expect(await dao(page, { t }, bert)).toMatchObject({ selected_card_key: 'five001' });

  // user settings through the header
  expect((await post(page, 'update_user.php', { color_mode: 'light' }, anna)).ok()).toBeTruthy();
  const user = await page.request.get('/api/get_user.php', { headers: { [HEADER]: anna } });
  expect(await user.json()).toEqual({ color_mode: 'light' });
});
