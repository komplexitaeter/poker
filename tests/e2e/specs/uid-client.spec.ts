import { test, expect, Page, Request } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, pickCard, expectTableCard, pageReady, getSid, UID_HEADER } from './helpers';

/**
 * B-152 FE-1 (browser): a browser without a UID gets it from api/uid.php (16 characters Base32), never from
 * Math.random. Every call of the own API carries it in the header X-Poker-User (apiFetch); no URL contains id=,
 * player_id= or the UID itself (access logs). Two tabs on a first visit end with the same UID.
 */

type Seen = { url: string; uid: string | undefined };

/** records every request of the page with its X-Poker-User header (allHeaders: complete, also for fetch) */
function recordRequests(page: Page): Promise<Seen>[] {
  const seen: Promise<Seen>[] = [];
  page.on('request', (request: Request) => {
    seen.push(request.allHeaders().then(headers => ({ url: request.url(), uid: headers[UID_HEADER.toLowerCase()] })));
  });
  return seen;
}

/** the id of the first answer of uid.php on the page (resolves when it comes) */
function firstUidAnswer(page: Page): Promise<string> {
  return page.waitForResponse(r => new URL(r.url()).pathname === '/api/uid.php')
    .then(async r => { expect(r.status()).toBe(200); return (await r.json()).id as string; });
}

async function expectClean(recorded: Promise<Seen>[], sid: string, who: string) {
  const seen = await Promise.all(recorded);
  const api = seen.filter(s => new URL(s.url).pathname.startsWith('/api/'));
  expect(api.length, `${who}: API requests`).toBeGreaterThan(5);
  for (const s of seen) {
    const url = new URL(s.url);
    expect(url.search, `${who}: ${s.url}`).not.toMatch(/[?&](id|player_id)=/);
    expect(s.url, `${who}: ${s.url}`).not.toContain(sid);
  }
  for (const s of api) {
    if (new URL(s.url).pathname === '/api/uid.php') continue; // asks for the UID, has none yet
    expect(s.uid, `${who}: header of ${s.url}`).toBe(sid);
  }
  // the core endpoints were really called (so the checks above cover them)
  const paths = new Set(api.map(s => new URL(s.url).pathname));
  return paths;
}

test('first visit: the UID comes from uid.php, travels only in the header, never in a URL (B-152)', async ({ browser }) => {
  // start page without a SID: uid.php hands it out
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const aliceRequests = recordRequests(alice);
  const aliceUid = firstUidAnswer(alice);
  const url = await createTeam(alice, 'Uid Client');
  const aliceSid = await getSid(alice);
  expect(aliceSid).toMatch(/^[A-Z2-7]{16}$/);
  expect(aliceSid).toBe(await aliceUid);
  await joinAsPlayer(alice, url, 'Alice');

  // board link opened in a fresh browser: the board gets the UID before its first load
  const bob = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const bobRequests = recordRequests(bob);
  const bobUid = firstUidAnswer(bob);
  await joinAsPlayer(bob, url, 'Bob');
  const bobSid = await getSid(bob);
  expect(bobSid).toMatch(/^[A-Z2-7]{16}$/);
  expect(bobSid).toBe(await bobUid);
  expect(bobSid).not.toBe(aliceSid);

  // play, reveal, new round
  await pickCard(alice, 'three01');
  await pickCard(bob, 'five001');
  await expectTableCard(alice, 'Bob', 'five001');
  const newRound = alice.waitForResponse(r => r.url().includes('/api/newround.php'));
  await alice.locator('#newroundbtn').click();
  expect((await newRound).status()).toBe(200);
  await expectTableCard(bob, 'Alice', 'prgrss1');

  // menus: board settings, topic; the feedback panel (roadmap, seen mark); the colour switch
  for (const button of ['#cset_btn', '#topic_btn']) {
    await alice.locator(button).click();
    await expect(alice.locator('dialog#menu')).toHaveAttribute('open');
    await alice.locator('#menu_close').click();
    await expect(alice.locator('dialog#menu')).not.toHaveAttribute('open');
  }
  const roadmap = alice.waitForResponse(r => r.url().includes('/api/get_roadmap.php'));
  await alice.locator('#feedback_btn').click();
  await expect(alice.locator('#fb_panel_backlog')).toBeVisible();
  expect((await roadmap).ok()).toBeTruthy();
  await alice.locator('#menu_close').click();
  const colour = alice.waitForResponse(r => r.url().includes('/api/update_user.php') && r.url().includes('color_mode='));
  await alice.locator('#cmode_btn').click();
  expect((await colour).ok()).toBeTruthy();

  // a reload keeps the UID (no new uid.php)
  await alice.reload();
  await pageReady(alice);
  expect(await getSid(alice)).toBe(aliceSid);

  const alicePaths = await expectClean(aliceRequests, aliceSid, 'Alice');
  for (const path of ['addteam.php', 'dao.php', 'name.php', 'setc.php', 'newround.php', 'get_roadmap.php',
    'update_user.php', 'measure_event.php']) {
    expect(alicePaths.has('/api/' + path), path).toBe(true);
  }
  // the start page of a first visit asks for no saved settings (no SID yet)
  expect(alicePaths.has('/api/get_user.php')).toBe(false);
  const uidCalls = (await Promise.all(aliceRequests)).filter(s => new URL(s.url).pathname === '/api/uid.php');
  expect(uidCalls).toHaveLength(1);
  const bobPaths = await expectClean(bobRequests, bobSid, 'Bob');
  for (const path of ['dao.php', 'name.php', 'setc.php']) expect(bobPaths.has('/api/' + path), path).toBe(true);
});

test('two tabs on a first visit end with the same UID: the one stored first wins (B-152)', async ({ browser }) => {
  const first = await newPlayer(browser);
  const second = await first.context().newPage();

  // the second tab asks first, but its answer is held until the first tab has stored its own UID
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let asked!: () => void;
  const secondAsked = new Promise<void>(resolve => { asked = resolve; });
  let secondOwn = '';
  await second.route('**/api/uid.php', async route => {
    asked();
    const response = await route.fetch();
    secondOwn = (await response.json()).id;
    await held;
    await route.fulfill({ response });
  });
  const secondUsed = second.waitForRequest(r => r.url().includes('/api/measure_event.php'));
  const secondLoaded = second.goto('/');
  await secondAsked;

  await first.goto('/');
  const sid = await getSid(first);
  expect(sid).toMatch(/^[A-Z2-7]{16}$/);
  await expect.poll(() => second.evaluate(() => localStorage.getItem('SID'))).toBe(sid);
  release();
  await secondLoaded;

  // the second tab got a UID of its own from uid.php, but keeps the stored one
  expect(secondOwn).toMatch(/^[A-Z2-7]{16}$/);
  expect(secondOwn).not.toBe(sid);
  expect((await (await secondUsed).allHeaders())[UID_HEADER.toLowerCase()]).toBe(sid);
  expect(await second.evaluate(() => (window as unknown as { getUid: () => string }).getUid())).toBe(sid);
  expect(await second.evaluate(() => localStorage.getItem('SID'))).toBe(sid);
});

test('without an answer of uid.php the board waits and retries, never makes up a UID (B-152)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Uid Retry');

  const bob = await newPlayer(browser);
  let calls = 0;
  await bob.route('**/api/uid.php', route => (++calls <= 2 ? route.fulfill({ status: 503, body: '' }) : route.continue()));
  const daoCalls: string[] = [];
  bob.on('request', r => { if (r.url().includes('/api/dao.php')) daoCalls.push(r.url()); });
  await bob.goto(url);
  // two failures (1 s, 2 s waits), then the third try gives the UID and the board loads
  await pageReady(bob, 20_000);
  expect(calls).toBe(3);
  const sid = await getSid(bob);
  expect(sid).toMatch(/^[A-Z2-7]{16}$/);
  expect(daoCalls.length).toBeGreaterThan(0);
  await expect(bob.locator('#overlay_name_input')).toHaveClass(/visible/);
});

test('"Delete my data" in one tab: the other tab of the browser never uses the deleted UID again (B-152)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const url = await createTeam(alice, 'Uid Delete');
  await joinAsPlayer(alice, url, 'Alice');
  const old = await getSid(alice);
  const other = await alice.context().newPage();
  await other.goto(url);
  await pageReady(other);
  await expectTableCard(other, 'Alice', 'prgrss1');

  // from now on: what the other tab sends to the API
  const sent = recordRequests(other);
  const deleted = alice.waitForResponse(r => r.url().includes('/api/delete_user.php'));
  await alice.evaluate(() => (window as unknown as { showDeleteUserOverlay: () => void }).showDeleteUserOverlay());
  await alice.locator('#delete_user_ok').click();
  expect((await deleted).ok()).toBeTruthy();

  // the pull of delete_user.php reloads the other tab: Alice is gone, it asks with a new UID
  await expect(other.locator('#cbox .c')).toHaveCount(0);
  await expect(other.locator('#overlay_name_input')).toHaveClass(/visible/);
  const fresh = await getSid(other);
  expect(fresh).toMatch(/^[A-Z2-7]{16}$/);
  expect(fresh).not.toBe(old);
  const seen = (await Promise.all(sent)).filter(s => new URL(s.url).pathname.startsWith('/api/'));
  expect(seen.some(s => new URL(s.url).pathname === '/api/dao.php')).toBe(true);
  for (const s of seen) expect(s.uid, s.url).not.toBe(old);
  // the server does not know the deleted UID again (dao.php never creates a user row, only name.php/update_user.php)
  expect(old).toMatch(/^[A-Z2-7]{16}$/); // safe to put into the SQL below
  const rows = execFileSync('mysql', ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e', '-N', '-B', '-e',
    `select (select count(*) from pok_user_tbl where id = '${old}') + (select count(*) from pok_players_tbl where id = '${old}')`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  expect(rows).toBe('0');
});
