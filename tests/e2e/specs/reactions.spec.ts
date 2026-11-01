import { test, expect, Page, Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, tableCard } from './helpers';

/**
 * B-110 part 2: reactions. The board sends "react:<from>:<to>:<code>" over the WebSocket; poker-msg sends the same
 * text to every board of the team, the sender's too, and all boards animate on that echo only: a flight
 * (.react-fly, Web Animations API) to the target, the landing (.react-land with the emoji and the sender's name,
 * .is-hit on the card). A nudge shakes the target (.is-nudged; on the nudged one's board also .is-nudged-me).
 * Anonymous mode: no sender name. poker-msg forwards at most one reaction per connection and second.
 * SHOT_DIR (optional): stills of the flight, the landing and a nudge, and a video of a flight.
 */
const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 1024, height: 768 };
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];
const RATE_LIMIT_MS = 1100; // poker-msg: one reaction per connection and second

function teamIdOf(url: string): string {
  const teamId = new URL(url).searchParams.get('t') as string;
  expect(teamId).toMatch(/^[A-Za-z0-9_-]+$/); // safe to put into the SQL below
  return teamId;
}

async function reload(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { updateDao: (onLoad: boolean) => void }).updateDao(false));
}

async function colorMode(page: Page, mode: 'dark' | 'light'): Promise<void> {
  await page.evaluate(m => (window as unknown as { setColorMode: (m: string) => void }).setColorMode(m), mode);
}

/** throws a reaction through the emoji bar of a card (desktop: hover, smiley, emoji) */
async function throwAt(page: Page, card: Locator, code: string): Promise<void> {
  await card.hover();
  await card.locator('.react').click();
  await page.locator(`#react_bar button[data-react="${code}"]`).click();
  await expect(page.locator('#react_bar')).toBeHidden();
}

/** records the reaction messages the page sends over its WebSocket (also on a connection open already) */
async function recordSent(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { sentReact: string[] };
    w.sentReact = [];
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (this: WebSocket, data: string) {
      if (String(data).startsWith('react:')) w.sentReact.push(String(data));
      return orig.call(this, data);
    };
  });
  return () => page.evaluate(() => (window as unknown as { sentReact: string[] }).sentReact.slice());
}

/** remembers whether a flying emoji was ever added (they are removed after the flight) */
async function watchFlights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { sawFly: boolean };
    w.sawFly = false;
    new MutationObserver(list => {
      if (list.some(m => Array.from(m.addedNodes).some(n => n instanceof Element && n.classList.contains('react-fly')))) {
        w.sawFly = true;
      }
    }).observe(document.body, { childList: true });
  });
}

const sawFly = (page: Page) => page.evaluate(() => (window as unknown as { sawFly: boolean }).sawFly);

/** Alice and Bob as players, Olga as observer, all with a board open */
async function setup(browser: import('@playwright/test').Browser, teamName: string,
                     olgaOptions: Record<string, unknown> = {}) {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, teamName);
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP });
  await joinAsPlayer(bob, url, 'Bob');
  const olga = await newPlayer(browser, { viewport: DESKTOP, ...olgaOptions });
  await olga.goto(url);
  await olga.locator('#nameinput').fill('Olga');
  await olga.locator('#become_observer_btn').click();
  await expect(olga.locator('#observers .obs.is-me .obs-name')).toHaveText('Olga');
  for (const p of [alice, bob, olga]) {
    await expect(tableCard(p, 'Alice')).toBeVisible();
    await expect(tableCard(p, 'Bob')).toBeVisible();
  }
  const bobMkey = await tableCard(alice, 'Bob').getAttribute('id') as string;
  return { alice, bob, olga, url, bobMkey };
}

test('a reaction lands at the target on every board, the sender only on the echo (B-110)', async ({ browser }) => {
  const { alice, bob, olga, bobMkey } = await setup(browser, 'React Echo', { reducedMotion: 'reduce' });
  const sent = await recordSent(alice);
  await watchFlights(alice);
  await watchFlights(olga);

  // the echo does not come (the message is dropped before the WebSocket): nothing moves, not even at the sender
  await alice.evaluate(() => {
    const orig = WebSocket.prototype.send;
    (window as unknown as { dropReact: boolean }).dropReact = true;
    WebSocket.prototype.send = function (this: WebSocket, data: string) {
      if ((window as unknown as { dropReact: boolean }).dropReact && String(data).startsWith('react:')) return;
      return orig.call(this, data);
    };
  });
  await throwAt(alice, tableCard(alice, 'Bob'), 'heart');
  await alice.waitForTimeout(1500);
  for (const p of [alice, bob, olga]) await expect(p.locator('.react-land, .react-fly')).toHaveCount(0);
  expect(await sawFly(alice)).toBe(false);

  // with the echo: the flight at the sender, the landing at Bob's card on all three boards, with the sender's name
  await alice.evaluate(() => { (window as unknown as { dropReact: boolean }).dropReact = false; });
  await throwAt(alice, tableCard(alice, 'Bob'), 'heart');
  for (const p of [alice, bob, olga]) {
    const land = tableCard(p, 'Bob').locator('.react-land');
    await expect(land).toHaveCount(1);
    await expect(land.locator('.react-emoji')).toHaveText('❤️');
    await expect(land.locator('.react-from')).toHaveText('Alice');
  }
  await expect(tableCard(bob, 'Bob')).toHaveClass(/\bis-hit\b/);
  expect(await sawFly(alice)).toBe(true);
  // reduced motion: no flight, only the landing
  expect(await sawFly(olga)).toBe(false);
  // the landing goes away; the card stays
  for (const p of [alice, bob, olga]) await expect(p.locator('.react-land')).toHaveCount(0, { timeout: 5000 });
  await expect(tableCard(bob, 'Bob')).not.toHaveClass(/\bis-hit\b/);
  expect(await sent()).toEqual([`react:${await tableCard(alice, 'Alice').getAttribute('id')}:${bobMkey}:heart`]);

  // a reaction at an observer lands at the observer's name tag
  await alice.waitForTimeout(RATE_LIMIT_MS);
  const olgaRow = alice.locator('#observers .obs').filter({ hasText: 'Olga' });
  await olgaRow.hover();
  await olgaRow.locator('.react').click();
  await alice.locator('#react_bar button[data-react="cake"]').click();
  await expect(olga.locator('#observers .obs.is-me .react-land .react-emoji')).toHaveText('🎂');
  await expect(bob.locator('#observers .obs .react-land .react-from')).toHaveText('Alice');
});

test('invalid reactions are not sent, unknown messages are ignored (B-110)', async ({ browser }) => {
  const { alice, bob, bobMkey } = await setup(browser, 'React Invalid');
  const sent = await recordSent(alice);
  type W = { sendReaction: (to: string, code: string) => void };
  await alice.evaluate(([to]) => {
    const w = window as unknown as W;
    w.sendReaction(to, 'evil');
    w.sendReaction(to, 'HEART');
    w.sendReaction('abc', 'heart');
    w.sendReaction(to + ':1', 'heart');
  }, [bobMkey]);
  await alice.waitForTimeout(800);
  expect(await sent()).toEqual([]);
  // a valid one goes out (the listener works)
  await alice.evaluate(([to]) => (window as unknown as W).sendReaction(to, 'clap'), [bobMkey]);
  await expect(tableCard(bob, 'Bob').locator('.react-land .react-emoji')).toHaveText('👏');
  expect(await sent()).toHaveLength(1);
  // a reaction at a player who is not on the board: nothing (no error)
  const errors: string[] = [];
  bob.on('pageerror', e => errors.push(e.message));
  await alice.waitForTimeout(RATE_LIMIT_MS);
  await alice.evaluate(() => (window as unknown as W).sendReaction('999999999', 'cake'));
  await bob.waitForTimeout(1500);
  await expect(bob.locator('.react-land, .react-fly')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('nudge: the card shakes on every board, harder on the nudged one (B-110)', async ({ browser }) => {
  const { alice, bob, olga } = await setup(browser, 'React Nudge');
  await expect(alice.locator('#react_bar button[data-react]')).toHaveCount(7);
  await expect(alice.locator('#react_bar button[data-react="nudge"]')).toHaveAttribute('aria-label', 'Nudge');
  await throwAt(alice, tableCard(alice, 'Bob'), 'nudge');
  await expect(tableCard(bob, 'Bob')).toHaveClass(/\bis-nudged-me\b/);
  await expect(tableCard(bob, 'Bob')).toHaveClass(/\bis-nudged\b/);
  await expect(tableCard(olga, 'Bob')).toHaveClass(/\bis-nudged\b/);
  await expect(tableCard(alice, 'Bob')).toHaveClass(/\bis-nudged\b/);
  await expect(tableCard(olga, 'Bob')).not.toHaveClass(/\bis-nudged-me\b/);
  await expect(tableCard(bob, 'Bob').locator('.react-land .react-emoji')).toHaveText('👋');
  // then it stops
  await expect(tableCard(bob, 'Bob')).not.toHaveClass(/\bis-nudged/, { timeout: 3000 });
});

test('anonymous mode: reactions land without the sender name (B-110)', async ({ browser }) => {
  const { alice, bob, olga, url } = await setup(browser, 'React Anon');
  const t = teamIdOf(url);
  execFileSync('mysql', [...DB_ARGS, '-e',
    `update pok_teams_tbl set anonymous_mode = 1, anonymous_request_toggle = 1 where id = '${t}'`]);
  for (const p of [alice, bob, olga]) {
    await reload(p);
    // gLastJson is a script-level let (not on window)
    await expect.poll(() => p.evaluate(() => (0, eval)('gLastJson').anonymous_mode)).toBe(1);
  }
  await throwAt(alice, tableCard(alice, 'Bob'), 'party');
  for (const p of [alice, bob, olga]) {
    const land = tableCard(p, 'Bob').locator('.react-land');
    await expect(land.locator('.react-emoji')).toHaveText('🎉');
    await expect(land.locator('.react-from')).toHaveCount(0);
  }
});

test('touch: a double tap on a card in the tap mode does not load the board (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: TABLET, hasTouch: true });
  const url = await createTeam(alice, 'React Dbl');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP });
  await joinAsPlayer(bob, url, 'Bob');
  const bobCard = tableCard(alice, 'Bob');
  await expect(bobCard.locator('.react')).toHaveCount(1);
  await alice.waitForTimeout(500);
  let loads = 0;
  alice.on('request', r => { if (r.url().includes('/api/dao.php')) loads++; });
  await bobCard.locator('.card_player_name').dblclick();
  await alice.waitForTimeout(500);
  expect(loads).toBe(0);
});

/* stills and a video for the review (only with SHOT_DIR) */
test('shots: flight, landing, nudge (B-110)', async ({ browser }) => {
  const dir = process.env.SHOT_DIR;
  test.skip(!dir, 'SHOT_DIR not set');
  const alice = await newPlayer(browser, { viewport: DESKTOP, recordVideo: { dir: dir!, size: DESKTOP } });
  const url = await createTeam(alice, 'React Shots');
  await joinAsPlayer(alice, url, 'Alice');
  const names = ['Bob', 'Cleo', 'Dan', 'Eve'];
  const pages: Page[] = [];
  for (const n of names) {
    const p = await newPlayer(browser, { viewport: TABLET, hasTouch: true });
    await joinAsPlayer(p, url, n);
    pages.push(p);
  }
  const bob = pages[0];
  for (const n of names) await expect(tableCard(alice, n)).toBeVisible();
  await colorMode(alice, 'dark');
  await colorMode(bob, 'light');
  await alice.waitForTimeout(1000);

  const pauseAll = (p: Page) => p.evaluate(() => document.getAnimations().forEach(a => a.pause()));
  const playAll = (p: Page) => p.evaluate(() => document.getAnimations().forEach(a => a.play()));

  // Eve throws a cake at Bob: Alice (desktop dark) sees it fly, Bob (touch light) sees it land
  await pages[3].evaluate(([to]) => (window as unknown as { sendReaction: (t: string, c: string) => void })
    .sendReaction(to, 'cake'), [await tableCard(alice, 'Bob').getAttribute('id') as string]);
  await alice.locator('.react-fly').waitFor();
  await alice.waitForTimeout(400);
  await pauseAll(alice);
  await alice.screenshot({ path: `${dir}/desktop-dark-flight.png` });
  await playAll(alice);
  await bob.locator('.react-land').waitFor();
  await bob.waitForTimeout(350);
  await pauseAll(bob);
  await bob.screenshot({ path: `${dir}/touch-light-landing.png` });
  await playAll(bob);
  await alice.locator('.react-land').waitFor();
  await alice.waitForTimeout(350);
  await pauseAll(alice);
  await alice.screenshot({ path: `${dir}/desktop-dark-landing.png` });
  await playAll(alice);
  await alice.waitForTimeout(2500);

  // Alice nudges Bob
  await throwAt(alice, tableCard(alice, 'Bob'), 'nudge');
  await expect(tableCard(bob, 'Bob')).toHaveClass(/\bis-nudged-me\b/);
  await bob.waitForTimeout(250);
  await pauseAll(bob);
  await bob.screenshot({ path: `${dir}/touch-light-nudge-me.png` });
  await playAll(bob);
  await alice.waitForTimeout(2500);
  await alice.context().close(); // writes the video
});
