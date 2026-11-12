import { test, expect, Page, Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, tableCard, stopHbLoads } from './helpers';

/**
 * B-110 part 2: reactions. The board sends "react:<from>:<to>:<code>" over the WebSocket; poker-msg sends the same
 * text to every board of the team, the sender's too, and all boards animate on that echo only: a flight
 * (.react-fly, Web Animations API) to the target, the landing (.react-land with the emoji and the sender's name,
 * .is-hit on the card). Several landings on one card at once are offset (--land-i). The nudge circle (.nudge) sends
 * "react:0:<to>:nudge" (anonymous): no flight, no landing, the target shakes (.is-nudged; on the nudged one's board
 * also .is-nudged-me). Anonymous mode: no sender name. A hidden tab drops reactions (nothing is played late).
 * poker-msg checks the format only and forwards at most 1 reaction per connection and second and 10 a minute
 * (B-131); the board keeps to the same limits (a hint above them, none on a double click) and ignores unknown codes.
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

/**
 * Records what a reaction shows on a board, because it is short: a landing (.react-land, 1.8 s; with reduced motion
 * right on the echo, elsewhere after the 900 ms flight), .is-hit (450 ms), .is-nudged (700 ms). Checking that live,
 * board after board, fails at random: each expect polls at 100, 250, 500, 1000 ms steps, so the check of the first
 * board may return up to a second after the landing, when it is gone on the next board already.
 * Entries: "land:<mkey>:<emoji>:<sender name or ->" and "class:<mkey>:<class>" (mkey of the card or the observer).
 */
async function watchReactions(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { seenReact: string[] };
    w.seenReact = [];
    const mkeyOf = (el: Element) => (el.classList.contains('obs') ? (el as HTMLElement).dataset.mkey : el.id) ?? '';
    new MutationObserver(list => {
      list.forEach((m, i) => {
        const el = m.target as Element;
        if (m.type === 'childList') {
          for (const n of Array.from(m.addedNodes)) {
            if (!(n instanceof Element) || !n.classList.contains('react-land')) continue;
            const from = n.querySelector('.react-from');
            w.seenReact.push(`land:${mkeyOf(el)}:${n.querySelector('.react-emoji')?.textContent}:`
              + (from === null ? '-' : from.textContent));
          }
        } else if (el.matches('#cbox .c, #observers .obs')) {
          // the classes after this change: the old value of the next change of the element, else the current ones
          const next = list.slice(i + 1).find(n => n.type === 'attributes' && n.target === el);
          const after = (next === undefined ? el.className : next.oldValue ?? '').split(/\s+/);
          const before = (m.oldValue ?? '').split(/\s+/);
          for (const cls of ['is-hit', 'is-nudged', 'is-nudged-me']) {
            if (after.includes(cls) && !before.includes(cls)) w.seenReact.push(`class:${mkeyOf(el)}:${cls}`);
          }
        }
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
      attributeOldValue: true });
  });
  return () => page.evaluate(() => (window as unknown as { seenReact: string[] }).seenReact.slice());
}

/** pretends the tab is hidden / visible again (document.visibilityState and the visibilitychange event) */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate(h => {
    if (h) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    else delete (document as unknown as { visibilityState?: string }).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  if (!hidden) {
    // visible again: the board builds a new connection (B-82); wait until it is open and subscribed
    await expect.poll(() => page.evaluate(() => (0, eval)('gConn').readyState)).toBe(1);
    await page.waitForTimeout(500);
  }
}

/** records the reaction messages that arrive on the page's WebSocket (raw, before the board checks them) */
async function recordReceived(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { gotReact: string[] };
    w.gotReact = [];
    (0, eval)('gConn').addEventListener('message', (e: MessageEvent) => {
      if (String(e.data).startsWith('react:')) w.gotReact.push(String(e.data));
    });
  });
  return () => page.evaluate(() => (window as unknown as { gotReact: string[] }).gotReact.slice());
}

/** Alice and Bob as players, Olga as observer, all with a board open */
async function setup(browser: import('@playwright/test').Browser, teamName: string,
                     olgaOptions: Record<string, unknown> = {}, bobOptions: Record<string, unknown> = {}) {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, teamName);
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP, ...bobOptions });
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
  const [seenA, seenB, seenO] = [await watchReactions(alice), await watchReactions(bob), await watchReactions(olga)];

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
  for (const seen of [seenA, seenB, seenO]) expect(await seen()).toEqual([]);
  expect(await sawFly(alice)).toBe(false);

  // with the echo: the flight at the sender, the landing at Bob's card on all three boards, with the sender's name
  await alice.evaluate(() => { (window as unknown as { dropReact: boolean }).dropReact = false; });
  await throwAt(alice, tableCard(alice, 'Bob'), 'heart');
  // (recorded, the landing is short: see watchReactions)
  const heart = [`land:${bobMkey}:❤️:Alice`, `class:${bobMkey}:is-hit`];
  for (const seen of [seenA, seenB, seenO]) await expect.poll(seen).toEqual(heart);
  expect(await sawFly(alice)).toBe(true);
  // reduced motion: no flight, only the landing
  expect(await sawFly(olga)).toBe(false);
  // the landing goes away; the card stays
  for (const p of [alice, bob, olga]) await expect(p.locator('.react-land')).toHaveCount(0, { timeout: 5000 });
  // no late duplicates on any board (checked once more, without polling)
  for (const seen of [seenA, seenB, seenO]) expect(await seen()).toEqual(heart);
  await expect(tableCard(bob, 'Bob')).not.toHaveClass(/\bis-hit\b/);
  expect(await sent()).toEqual([`react:${await tableCard(alice, 'Alice').getAttribute('id')}:${bobMkey}:heart`]);

  // a reaction at an observer lands at the observer's name tag
  await alice.waitForTimeout(RATE_LIMIT_MS);
  const olgaRow = alice.locator('#observers .obs').filter({ hasText: 'Olga' });
  await olgaRow.hover();
  await olgaRow.locator('.react').click();
  const olgaMkey = await olgaRow.getAttribute('data-mkey') as string;
  await alice.locator('#react_bar button[data-react="cake"]').click();
  // an observer takes no hit (.is-hit is for cards)
  const cake = [...heart, `land:${olgaMkey}:🎂:Alice`];
  for (const seen of [seenA, seenB, seenO]) await expect.poll(seen).toEqual(cake);
  await alice.waitForTimeout(2500);
  for (const seen of [seenA, seenB, seenO]) expect(await seen()).toEqual(cake);
});

test('invalid reactions are not sent, unknown messages are ignored (B-110)', async ({ browser }) => {
  const { alice, bob, bobMkey } = await setup(browser, 'React Invalid');
  const sent = await recordSent(alice);
  type W = { sendReaction: (to: string, code: string) => void };
  await alice.evaluate(([to]) => {
    const w = window as unknown as W;
    w.sendReaction(to, 'evil');
    w.sendReaction(to, 'coffee'); // no longer in the bar
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

  // an unknown code in the right format: poker-msg forwards it (format only), the board ignores it
  const got = await recordReceived(bob);
  const seenB = await watchReactions(bob);
  await alice.waitForTimeout(RATE_LIMIT_MS);
  const aliceMkey = await tableCard(alice, 'Alice').getAttribute('id') as string;
  const unknown = `react:${aliceMkey}:${bobMkey}:coffee`;
  await alice.evaluate(m => (0, eval)('gConn').send(m), unknown);
  await expect.poll(got).toEqual([unknown]);
  await bob.waitForTimeout(1500);
  expect(await seenB()).toEqual([]);
  await expect(bob.locator('.react-land, .react-fly')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('nudge circle: anonymous, the card shakes on every board, harder on the nudged one (B-110)', async ({ browser }) => {
  const { alice, bob, olga, bobMkey } = await setup(browser, 'React Nudge');
  // the nudge is a circle of its own, not in the emoji bar
  await expect(alice.locator('#react_bar button[data-react]')).toHaveCount(7);
  await expect(alice.locator('#react_bar button[data-react="nudge"]')).toHaveCount(0);
  const sent = await recordSent(alice);
  await watchFlights(alice);
  const [seenA, seenB, seenO] = [await watchReactions(alice), await watchReactions(bob), await watchReactions(olga)];

  // the emoji bar is open: a click on the nudge closes it and nudges
  const bobCard = tableCard(alice, 'Bob');
  await bobCard.hover();
  await bobCard.locator('.react').click();
  await expect(alice.locator('#react_bar')).toBeVisible();
  await bobCard.getByRole('button', { name: 'Nudge Bob' }).click();
  await expect(alice.locator('#react_bar')).toBeHidden();
  // (recorded, the shake is short: see watchReactions); no landing, no name, no flight
  const others = [`class:${bobMkey}:is-nudged`];
  const nudged = [`class:${bobMkey}:is-nudged`, `class:${bobMkey}:is-nudged-me`];
  await expect.poll(seenB).toEqual(nudged);
  for (const seen of [seenA, seenO]) await expect.poll(seen).toEqual(others);
  expect(await sent()).toEqual([`react:0:${bobMkey}:nudge`]); // anonymous: from 0, also in the message
  // then it stops, nothing late
  await expect(tableCard(bob, 'Bob')).not.toHaveClass(/\bis-nudged/, { timeout: 3000 });
  await alice.waitForTimeout(1000);
  expect(await seenB()).toEqual(nudged);
  for (const seen of [seenA, seenO]) expect(await seen()).toEqual(others);
  expect(await sawFly(alice)).toBe(false);
  for (const p of [alice, bob, olga]) await expect(p.locator('.react-land, .react-fly')).toHaveCount(0);

  // an observer: the nudge circle in the observers row
  await alice.waitForTimeout(RATE_LIMIT_MS);
  const olgaRow = alice.locator('#observers .obs').filter({ hasText: 'Olga' });
  const olgaMkey = await olgaRow.getAttribute('data-mkey') as string;
  await olgaRow.hover();
  await olgaRow.getByRole('button', { name: 'Nudge Olga' }).click();
  await expect.poll(seenO).toEqual([...others, `class:${olgaMkey}:is-nudged`, `class:${olgaMkey}:is-nudged-me`]);
  for (const seen of [seenA, seenB]) {
    await expect.poll(seen).toEqual([...(seen === seenB ? nudged : others), `class:${olgaMkey}:is-nudged`]);
  }
  expect(await sent()).toEqual([`react:0:${bobMkey}:nudge`, `react:0:${olgaMkey}:nudge`]);
});

test('hidden tab: reactions are dropped, not played late (B-110)', async ({ browser }) => {
  const { alice, bob, olga, bobMkey } = await setup(browser, 'React Hidden');
  const [seenB, seenO] = [await watchReactions(bob), await watchReactions(olga)];
  type W = { sendReaction: (to: string, code: string) => void };

  // Bob's tab is hidden: a reaction and a nudge arrive, nothing plays, also not when he is back
  await setHidden(bob, true);
  await alice.evaluate(([to]) => (window as unknown as W).sendReaction(to, 'cake'), [bobMkey]);
  await expect.poll(seenO).toEqual([`land:${bobMkey}:🎂:Alice`, `class:${bobMkey}:is-hit`]);
  await olga.waitForTimeout(RATE_LIMIT_MS);
  await olga.evaluate(([to]) => (window as unknown as W).sendReaction(to, 'nudge'), [bobMkey]);
  await expect.poll(seenO).toEqual([`land:${bobMkey}:🎂:Alice`, `class:${bobMkey}:is-hit`,
    `class:${bobMkey}:is-nudged`]);
  await bob.waitForTimeout(500);
  await setHidden(bob, false);
  await bob.waitForTimeout(1500);
  expect(await seenB()).toEqual([]);
  await expect(bob.locator('.react-land, .react-fly')).toHaveCount(0);

  // a flight under way when the tab goes: dropped, no landing afterwards
  const seenA = await watchReactions(alice);
  await alice.waitForTimeout(RATE_LIMIT_MS);
  await throwAt(alice, tableCard(alice, 'Bob'), 'fish');
  await alice.locator('.react-fly').waitFor();
  await setHidden(alice, true);
  await expect(alice.locator('.react-fly')).toHaveCount(0);
  await alice.waitForTimeout(1500);
  await setHidden(alice, false);
  await alice.waitForTimeout(1000);
  expect(await seenA()).toEqual([]);
  // Bob's tab is visible again: he gets it
  await expect.poll(seenB).toEqual([`land:${bobMkey}:🐟:Alice`, `class:${bobMkey}:is-hit`]);
});

test('two landings on the same card at once are offset (B-110)', async ({ browser }) => {
  // Bob with reduced motion: the landings come right on the echo and stand still (no transform animation)
  const { alice, bob, olga, bobMkey } = await setup(browser, 'React Two', {}, { reducedMotion: 'reduce' });
  type W = { sendReaction: (to: string, code: string) => void };
  await alice.evaluate(([to]) => (window as unknown as W).sendReaction(to, 'thumbs'), [bobMkey]);
  await olga.evaluate(([to]) => (window as unknown as W).sendReaction(to, 'heart'), [bobMkey]);
  const lands = tableCard(bob, 'Bob').locator('.react-land');
  await expect(lands).toHaveCount(2);
  const info = await lands.evaluateAll(els => els.map(el => {
    const r = el.querySelector('.react-emoji')!.getBoundingClientRect();
    return { i: (el as HTMLElement).style.getPropertyValue('--land-i'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }));
  expect(info.map(l => l.i).sort()).toEqual(['0', '1']);
  expect(Math.hypot(info[0].x - info[1].x, info[0].y - info[1].y)).toBeGreaterThan(10);
  // gone again: the next one takes the first slot
  await expect(lands).toHaveCount(0, { timeout: 5000 });
  await alice.waitForTimeout(RATE_LIMIT_MS);
  await alice.evaluate(([to]) => (window as unknown as W).sendReaction(to, 'clap'), [bobMkey]);
  await expect(lands).toHaveCount(1);
  await expect(lands).toHaveAttribute('style', /--land-i:\s*0/);
});

test('anonymous mode: reactions land without the sender name (B-110)', async ({ browser }) => {
  const { alice, bob, olga, url, bobMkey } = await setup(browser, 'React Anon');
  const t = teamIdOf(url);
  execFileSync('mysql', [...DB_ARGS, '-e',
    `update pok_teams_tbl set anonymous_mode = 1, anonymous_request_toggle = 1 where id = '${t}'`]);
  for (const p of [alice, bob, olga]) {
    await reload(p);
    // gLastJson is a script-level let (not on window)
    await expect.poll(() => p.evaluate(() => (0, eval)('gLastJson').anonymous_mode)).toBe(1);
  }
  const seens = [await watchReactions(alice), await watchReactions(bob), await watchReactions(olga)];
  await throwAt(alice, tableCard(alice, 'Bob'), 'party');
  // (recorded, the landing is short: see watchReactions); "-": no sender name
  for (const seen of seens) await expect.poll(seen).toEqual([`land:${bobMkey}:🎉:-`, `class:${bobMkey}:is-hit`]);
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
  await stopHbLoads(alice); // a load after a hb is no load by the double tap
  let loads = 0;
  alice.on('request', r => { if (r.url().includes('/api/dao.php')) loads++; });
  await bobCard.locator('.card_player_name').dblclick();
  await alice.waitForTimeout(500);
  expect(loads).toBe(0);
});

/* stills and a video for the review (only with SHOT_DIR) */
test('shots: circles, flight, landing, two landings, nudge (B-110)', async ({ browser }) => {
  const dir = process.env.SHOT_DIR;
  test.skip(!dir, 'SHOT_DIR not set');
  test.setTimeout(90_000);
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

  // the three circles on Bob's card (desktop hover), an emoji with its outline
  const bobCard = tableCard(alice, 'Bob');
  const bobMkey = await bobCard.getAttribute('id') as string;
  await bobCard.hover();
  await alice.waitForTimeout(1200);
  await alice.screenshot({ path: `${dir}/desktop-dark-circles.png` });
  await bobCard.locator('.react').click();
  await alice.waitForTimeout(800);
  await alice.locator('#react_bar button[data-react="thumbs"]').click();
  await alice.mouse.move(5, 5);
  await alice.waitForTimeout(2500);

  // two throws right after each other at the same card: the landings are offset
  await alice.waitForTimeout(1100);
  await throwAt(alice, bobCard, 'fish');
  await alice.mouse.move(5, 5);
  await alice.waitForTimeout(250);
  await pages[2].evaluate(([to]) => (window as unknown as { sendReaction: (t: string, c: string) => void })
    .sendReaction(to, 'heart'), [bobMkey]);
  await expect(bobCard.locator('.react-land')).toHaveCount(2, { timeout: 3000 });
  await alice.waitForTimeout(300);
  await alice.screenshot({ path: `${dir}/desktop-dark-two-landings.png` });
  await alice.waitForTimeout(2500);

  // Alice nudges Bob (the nudge circle)
  await alice.waitForTimeout(1100);
  await bobCard.hover();
  await alice.waitForTimeout(500);
  await bobCard.locator('.nudge').click();
  await expect(tableCard(bob, 'Bob')).toHaveClass(/\bis-nudged-me\b/);
  await bob.waitForTimeout(250);
  await pauseAll(bob);
  await bob.screenshot({ path: `${dir}/touch-light-nudge-me.png` });
  await playAll(bob);
  await alice.mouse.move(5, 5);
  await alice.waitForTimeout(2500);
  await alice.context().close(); // writes the video
});

/** B-131: moves the page's performance.now() (the clock of the reaction limit) forward, without waiting */
async function installClockOffset(page: Page): Promise<(ms: number) => Promise<void>> {
  await page.evaluate(() => {
    const w = window as unknown as { perfOffset: number };
    w.perfOffset = 0;
    const orig = performance.now.bind(performance);
    performance.now = () => orig() + w.perfOffset;
  });
  return ms => page.evaluate(d => { (window as unknown as { perfOffset: number }).perfOffset += d; }, ms);
}

test('rate limit: 10 reactions a minute go out, the 11th is not sent and shows a hint, a double click is silent (B-131)',
  async ({ browser }) => {
  const { alice, bob, bobMkey } = await setup(browser, 'React Limit');
  const sent = await recordSent(alice);
  const advance = await installClockOffset(alice);
  type W = { sendReaction: (to: string, code: string) => void; toasts: string[];
    showToast: (text: string, ...rest: unknown[]) => void };
  // counts the hints (showToast is a global function: the board calls it through window)
  await alice.evaluate(() => {
    const w = window as unknown as W;
    w.toasts = [];
    const orig = w.showToast;
    w.showToast = (text: string, ...rest: unknown[]) => { w.toasts.push(text); orig(text, ...rest); };
  });
  const toasts = () => alice.evaluate(() => (window as unknown as W).toasts.slice());

  // a double click on the nudge circle: one nudge goes out, the second (within 1 s) silently not
  const bobCard = tableCard(alice, 'Bob');
  await bobCard.hover();
  await bobCard.getByRole('button', { name: 'Nudge Bob' }).dblclick();
  await alice.waitForTimeout(500);
  expect(await sent()).toEqual([`react:0:${bobMkey}:nudge`]);
  expect(await toasts()).toEqual([]);
  await expect(alice.locator('#toast')).not.toHaveClass(/\btoast-on\b/);

  // nine more, one per (faked) second: all go out
  for (let i = 0; i < 9; i++) {
    await advance(1100);
    await alice.evaluate(([to, c]) => (window as unknown as W).sendReaction(to, c), [bobMkey, i % 2 ? 'nudge' : 'clap']);
  }
  expect(await sent()).toHaveLength(10);
  expect(await toasts()).toEqual([]);

  // the 11th within the minute (through the emoji bar): not sent, a friendly hint instead
  await advance(1100);
  await throwAt(alice, bobCard, 'heart');
  await expect(alice.locator('#toast')).toHaveClass(/\btoast-on\b/);
  await expect(alice.locator('#toast')).toContainText('too many reactions');
  expect(await sent()).toHaveLength(10);
  expect(await toasts()).toHaveLength(1);
  await expect(bob.locator('.react-land')).toHaveCount(0);

  // tried again right away: still not sent, and the hint does not repeat itself
  await advance(1100);
  await alice.evaluate(([to]) => (window as unknown as W).sendReaction(to, 'cake'), [bobMkey]);
  expect(await sent()).toHaveLength(10);
  expect(await toasts()).toHaveLength(1);

  // a minute after the first: one goes out again
  await advance(60_000);
  await alice.evaluate(([to]) => (window as unknown as W).sendReaction(to, 'party'), [bobMkey]);
  expect(await sent()).toHaveLength(11);
  // not checked on Bob's board: only the board's clock is moved on; poker-msg (B-131, 10 per real minute) still
  // drops this one, so it never lands
  expect(await toasts()).toHaveLength(1);
});

test('a held Enter on the nudge circle or an emoji sends one reaction, not one per key repeat (B-131)',
  async ({ browser }) => {
  const { alice, bobMkey } = await setup(browser, 'React Hold');
  const sent = await recordSent(alice);
  // the 1 s limit would hide the repeats: every repeat comes a (faked) 1.1 s later
  const advance = await installClockOffset(alice);
  const hold = async (key: string, repeats: number) => {
    await alice.keyboard.down(key);
    for (let i = 0; i < repeats; i++) {
      await advance(1100);
      await alice.keyboard.down(key); // Playwright: a key pressed already goes down again with repeat = true
    }
    await alice.keyboard.up(key);
    await alice.waitForTimeout(300);
  };

  const bobCard = tableCard(alice, 'Bob');
  await bobCard.hover();
  await bobCard.getByRole('button', { name: 'Nudge Bob' }).focus();
  await hold('Enter', 8);
  expect(await sent()).toEqual([`react:0:${bobMkey}:nudge`]);

  // the emoji bar: the held Enter neither throws again nor reopens the bar
  await advance(1100);
  await bobCard.hover();
  await bobCard.locator('.react').click();
  await alice.locator('#react_bar button[data-react="heart"]').focus();
  await hold('Enter', 8);
  const aliceMkey = await tableCard(alice, 'Alice').getAttribute('id') as string;
  expect(await sent()).toEqual([`react:0:${bobMkey}:nudge`, `react:${aliceMkey}:${bobMkey}:heart`]);
  await expect(alice.locator('#react_bar')).toBeHidden();
  await expect(alice.locator('#toast')).not.toHaveClass(/\btoast-on\b/);
});
