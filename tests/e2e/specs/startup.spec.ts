import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, teamWithTwoPlayers, pickCard, deckCards, pageReady } from './helpers';

/**
 * B-34: the start of the board and of the start page loads without synchronous requests. The page shows only when
 * it is complete (card config, first board state with all cards, card symbols), all at once. A spinner shows only
 * when that takes longer than 0.8 s and fades out; failures end in the board or in a hint with a reload button, never
 * in an endless spinner or an empty page. A config file that does not arrive is retried; the board never shows
 * without cards.
 */

type Shown = { at: number; cards: number; deck: number; ready: boolean; light: boolean; catalog: boolean };

/** records the state of the page at the moment the body gets opacity 1 (window.__shown) */
async function recordReveal(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any;
    w.__shown = null;
    new MutationObserver(() => {
      if (w.__shown !== null || !document.body || document.body.style.opacity !== '1') return;
      w.__shown = {
        at: Date.now(),
        cards: document.querySelectorAll('#cbox .c').length,
        deck: document.querySelectorAll('#ctl .ctl').length,
        ready: document.documentElement.classList.contains('ready'),
        light: document.body.classList.contains('light-theme'),
        catalog: (() => { try { return (0, eval)('typeof gCatalogV2 !== "undefined" && gCatalogV2 !== null'); } catch { return false; } })(),
      };
    }).observe(document, { attributes: true, attributeFilter: ['style'], subtree: true });
  });
}

const shown = (page: Page): Promise<Shown | null> => page.evaluate(() => (window as any).__shown);

/** samples the opacity of the spinner (html::after) every frame until the page shows (window.__spin) */
async function sampleSpinner(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any;
    w.__spin = { samples: [] as [number, number][], readyAt: null as number | null };
    const tick = () => {
      const root = document.documentElement;
      w.__spin.samples.push([performance.now(), parseFloat(getComputedStyle(root, '::after').opacity)]);
      if (root.classList.contains('ready') && w.__spin.readyAt === null) w.__spin.readyAt = performance.now();
      if (w.__spin.readyAt !== null && performance.now() - w.__spin.readyAt > 400) { w.__spin.done = true; return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

/** a second page of the same player (same SID) */
async function samePlayer(page: Page): Promise<Page> {
  return page.context().newPage();
}

test('the board shows complete at once: all cards and the deck (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Complete');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  await recordReveal(page);
  await page.goto(url);
  await expect.poll(() => shown(page)).not.toBeNull();
  const s = (await shown(page))!;
  expect(s.cards).toBe(2);
  expect(s.deck).toBeGreaterThan(0);
  expect(s.ready).toBe(true);
  expect(s.catalog).toBe(true);
  expect(errors).toEqual([]);
});

test('the board stays hidden until card_catalog.json is there (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Slow Catalog');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  await recordReveal(page);
  let releasedAt = 0;
  await page.route('**/card_catalog.json*', async route => {
    await new Promise(r => setTimeout(r, 1500));
    releasedAt = Date.now();
    await route.continue();
  });
  await page.goto(url);
  await expect.poll(() => shown(page), { timeout: 10_000 }).not.toBeNull();
  const s = (await shown(page))!;
  expect(releasedAt).toBeGreaterThan(0);
  expect(s.at).toBeGreaterThanOrEqual(releasedAt);
  expect(s.cards).toBe(2);
  expect(s.deck).toBeGreaterThan(0);
  expect(s.catalog).toBe(true);
  expect(errors).toEqual([]);
});

test('a board state that comes before the card config waits for it (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Dao First');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  await recordReveal(page);
  const slow = async (route: any) => { await new Promise(r => setTimeout(r, 1000)); await route.continue(); };
  await page.route('**/cards.json*', slow);
  await page.route('**/card_catalog.json*', slow);
  await page.goto(url);
  await expect.poll(() => shown(page), { timeout: 10_000 }).not.toBeNull();
  const s = (await shown(page))!;
  expect(s.cards).toBe(2);
  expect(s.deck).toBeGreaterThan(0);
  await pickCard(page, 'three01');
  expect(errors).toEqual([]);
});

test('no spinner on a fast load, the spinner after 0.8 s on a slow one, it fades out (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Spinner');

  // fast: the spinner never shows before 0.8 s (and on a load faster than that not at all)
  const fast = await samePlayer(alice);
  await sampleSpinner(fast);
  await fast.goto(url);
  await expect.poll(() => fast.evaluate(() => (window as any).__spin.readyAt)).not.toBeNull();
  const f = await fast.evaluate(() => (window as any).__spin);
  for (const [t, o] of f.samples) if (t < 800) expect(o).toBe(0);
  if (f.readyAt < 780) expect(Math.max(...f.samples.map((x: [number, number]) => x[1]))).toBe(0);
  await expect.poll(() => fast.evaluate(() => getComputedStyle(document.documentElement, '::after').display)).toBe('none');
  await fast.close();

  // slow: the board state takes 2 s, the spinner shows meanwhile, the board stays hidden
  const slow = await samePlayer(alice);
  await sampleSpinner(slow);
  await slow.route('**/api/dao.php*', async route => { await new Promise(r => setTimeout(r, 2000)); await route.continue(); });
  await slow.goto(url, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => slow.evaluate(() => getComputedStyle(document.documentElement, '::after').opacity)).toBe('1');
  expect(await slow.evaluate(() => document.body.style.opacity)).toBe('0');
  await expect.poll(() => slow.evaluate(() => (window as any).__spin.done === true), { timeout: 10_000 }).toBe(true);
  const sl = await slow.evaluate(() => (window as any).__spin);
  for (const [t, o] of sl.samples) if (t < 800) expect(o).toBe(0);
  // no hard cut: after the page shows, the spinner is still there for a moment, getting fainter
  const after = sl.samples.filter(([t]: [number, number]) => t >= sl.readyAt).map(([, o]: [number, number]) => o);
  expect(after.some((o: number) => o > 0 && o < 1)).toBe(true);
  expect(await slow.evaluate(() => document.body.style.opacity)).toBe('1');
  expect(await slow.evaluate(() => getComputedStyle(document.documentElement, '::after').display)).toBe('none');
  await expect(slow.locator('#cbox .c')).toHaveCount(2);
});

test('the board loads when the server answers 404/410 for cards.json or card_catalog.json (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Missing Config');

  const noCards = await samePlayer(alice);
  const errors1 = collectPageErrors(noCards);
  await noCards.route('**/cards.json*', route => route.fulfill({ status: 404, body: 'not found' }));
  await noCards.goto(url);
  await expect.poll(() => noCards.evaluate(() => document.body.style.opacity), { timeout: 10_000 }).toBe('1');
  await pickCard(noCards, 'three01');
  expect(errors1).toEqual([]);
  await noCards.close();

  const noCatalog = await samePlayer(alice);
  const errors2 = collectPageErrors(noCatalog);
  await noCatalog.route('**/card_catalog.json*', route => route.fulfill({ status: 410, body: 'gone' }));
  await noCatalog.goto(url);
  await expect.poll(() => noCatalog.evaluate(() => document.body.style.opacity), { timeout: 10_000 }).toBe('1');
  await expect(noCatalog.locator('#cbox .c')).toHaveCount(2);
  await expect(deckCards(noCatalog).first()).toBeVisible();
  await deckCards(noCatalog).first().click();
  await expect(deckCards(noCatalog).first()).toHaveClass(/selected/);
  expect(errors2).toEqual([]);
});

test('the board shows after several failed loads (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Retries');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  let failed = 0;
  await page.route('**/api/dao.php*', route => {
    if (failed < 3) { failed++; return route.abort('failed'); }
    return route.continue();
  });
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => document.body.style.opacity), { timeout: 15_000 }).toBe('1');
  expect(failed).toBe(3);
  await expect(page.locator('#cbox .c')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('when the board cannot load, a reload hint shows and goes when it works again (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Offline');
  const page = await samePlayer(alice);
  let down = true;
  await page.route('**/api/dao.php*', route => down ? route.abort('failed') : route.continue());
  await page.clock.install();
  await page.goto(url);
  await page.clock.fastForward(13_000);

  const hint = page.locator('#load_fail');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Still loading');
  await expect(hint.getByRole('button', { name: 'Reload' })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.opacity)).toBe('0');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, '::after').display)).toBe('none');

  down = false;
  await expect.poll(async () => {
    await page.clock.fastForward(1_000);
    return page.evaluate(() => document.body.style.opacity);
  }, { timeout: 15_000 }).toBe('1');
  await expect(hint).toHaveCount(0);
  await expect(page.locator('#cbox .c')).toHaveCount(2);
});

test('start page: shows without get_user.php, in the system mode, and creating a team works (B-34)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const errors = collectPageErrors(page);
  await page.route('**/api/get_user.php*', route => route.abort());
  const url = await createTeam(page, 'Startup No User');
  expect(url).toContain('?t=');
  expect(errors).toEqual([]);

  for (const colorScheme of ['dark', 'light'] as const) {
    const again = await newPlayer(browser, { colorScheme });
    await again.route('**/api/get_user.php*', route => route.abort());
    await again.goto('/');
    await expect.poll(() => again.evaluate(() => document.body.style.opacity)).toBe('1');
    expect(await again.evaluate(() => document.body.classList.contains('light-theme'))).toBe(colorScheme === 'light');
    await expect(again.locator('#teaminput')).toBeFocused();
  }
});

test('start page: the form never submits natively while the color mode loads (B-34)', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.route('**/api/get_user.php*', async route => { await new Promise(r => setTimeout(r, 2000)); await route.continue(); });
  await page.goto('/');
  expect(await page.evaluate(() => document.body.style.opacity)).toBe('0');
  // the invisible page takes no clicks; Enter in the field must not submit natively either
  expect(await page.evaluate(() => getComputedStyle(document.body).pointerEvents)).toBe('none');
  await page.locator('#teaminput').press('Enter');
  await expect(page.locator('#team_err')).toBeVisible();
  expect(page.url()).not.toContain('searchName');
  await expect.poll(() => page.evaluate(() => document.body.style.opacity), { timeout: 10_000 }).toBe('1');
  expect(page.url()).not.toContain('searchName');
});

test('start page: a saved light mode is there when the page shows, no dark flash (B-34)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  await createTeam(alice, 'Startup Light');
  // the user row (pok_user_tbl) is created by the first dao.php of the board; update_user.php only updates it
  await pageReady(alice);
  const sid = await alice.evaluate(() => localStorage.getItem('SID'));
  const res = await alice.request.post(`/api/update_user.php?id=${encodeURIComponent(sid ?? '')}&color_mode=light`);
  expect(res.ok()).toBeTruthy();

  const page = await samePlayer(alice);
  await recordReveal(page);
  await page.goto('/');
  await expect.poll(() => shown(page)).not.toBeNull();
  expect((await shown(page))!.light).toBe(true);
});

test('start page: a slow get_user.php shows the page after 3 s in the system mode, the saved mode follows (B-34)', async ({ browser }) => {
  const alice = await newPlayer(browser, { colorScheme: 'dark' });
  await createTeam(alice, 'Startup Slow User');
  // the user row (pok_user_tbl) is created by the first dao.php of the board; update_user.php only updates it
  await pageReady(alice);
  const sid = await alice.evaluate(() => localStorage.getItem('SID'));
  const res = await alice.request.post(`/api/update_user.php?id=${encodeURIComponent(sid ?? '')}&color_mode=light`);
  expect(res.ok()).toBeTruthy();

  const page = await samePlayer(alice);
  let answeredAt = 0;
  await page.route('**/api/get_user.php*', async route => {
    await new Promise(r => setTimeout(r, 5000));
    answeredAt = Date.now();
    await route.continue();
  });
  await recordReveal(page);
  await page.goto('/');
  await expect.poll(() => shown(page), { timeout: 10_000 }).not.toBeNull();
  const s = (await shown(page))!;
  expect(answeredAt === 0 || s.at < answeredAt).toBe(true); // shown before the answer, not cut off
  expect(s.light).toBe(false);                                 // the system mode (dark)
  await expect(page.locator('#teaminput')).toBeFocused();
  await expect(page.locator('body')).toHaveClass(/light-theme/, { timeout: 10_000 }); // the saved mode follows
});

test('start page: the late reveal does not take the focus away from where the user put it (B-34)', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.route('**/api/get_user.php*', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#cmode_btn').focus();
  await pageReady(page);
  await expect(page.locator('#cmode_btn')).toBeFocused();
});

test('a config file that does not arrive is retried, the board shows with it (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Config Retry');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  await recordReveal(page);
  let failed = 0;
  await page.route('**/card_catalog.json*', route => {
    if (failed < 2) { failed++; return route.abort('failed'); }
    return route.continue();
  });
  await page.goto(url);
  await expect.poll(() => shown(page), { timeout: 15_000 }).not.toBeNull();
  const s = (await shown(page))!;
  expect(failed).toBe(2);
  expect(s.catalog).toBe(true); // the real catalog, no fallback
  expect(s.cards).toBe(2);
  expect(s.deck).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a config file answered with 5xx/429 is retried like a network error, the board shows with it (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Config 5xx');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  await recordReveal(page);
  const answers = [503, 500, 429];
  let tries = 0;
  await page.route('**/card_catalog.json*', route => {
    const status = answers[tries++];
    return status !== undefined ? route.fulfill({ status, body: 'busy' }) : route.continue();
  });
  await page.goto(url);
  await expect.poll(() => shown(page), { timeout: 20_000 }).not.toBeNull();
  const s = (await shown(page))!;
  expect(tries).toBe(4);
  expect(s.catalog).toBe(true); // the real catalog after the retries, not the fallback of a final answer
  expect(s.cards).toBe(2);
  expect(s.deck).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('without any card config the board stays hidden, and shows once it is there (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup No Config');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  let missing = true;
  const config = (route: any) => missing ? route.fulfill({ status: 404, body: 'not found' }) : route.continue();
  await page.route('**/cards.json*', config);
  await page.route('**/card_catalog.json*', config);
  await page.goto(url);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => document.body.style.opacity)).toBe('0');
  missing = false;
  await expect.poll(() => page.evaluate(() => document.body.style.opacity), { timeout: 15_000 }).toBe('1');
  await expect(page.locator('#cbox .c')).toHaveCount(2);
  await expect(deckCards(page).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the page waits for the card symbols, at most about 1 s (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Sprite');

  // 0.6 s late: the page shows after the symbols are there
  const page = await samePlayer(alice);
  await recordReveal(page);
  let releasedAt = 0;
  await page.route('**/src/cards.svg*', async route => {
    await new Promise(r => setTimeout(r, 600));
    if (releasedAt === 0) releasedAt = Date.now(); // the first one (the <use> elements may ask once more)
    await route.continue();
  });
  await page.goto(url);
  await expect.poll(() => shown(page), { timeout: 10_000 }).not.toBeNull();
  expect(releasedAt).toBeGreaterThan(0);
  expect((await shown(page))!.at).toBeGreaterThanOrEqual(releasedAt);
  await page.close();

  // 4 s late: the page does not wait for them
  const slow = await samePlayer(alice);
  await recordReveal(slow);
  let slowReleasedAt = 0;
  await slow.route('**/src/cards.svg*', async route => {
    await new Promise(r => setTimeout(r, 4000));
    slowReleasedAt = Date.now();
    await route.continue().catch(() => undefined);
  });
  await slow.goto(url, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => shown(slow), { timeout: 10_000 }).not.toBeNull();
  expect(slowReleasedAt).toBe(0);
  await expect(slow.locator('#cbox .c')).toHaveCount(2);
});

test('a first board state that breaks the set-up is followed by a later one that shows the board (B-34)', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'Startup Broken First');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));
  let broken = true;
  let brokenServed = 0;
  await page.route('**/api/dao.php*', async route => {
    if (!broken) return route.continue();
    const response = await route.fetch();
    const json = await response.json();
    json.players = null; // the set-up (updateDom) throws on it
    brokenServed++;
    return route.fulfill({ response, json });
  });
  await page.goto(url);
  await expect.poll(() => logs.some(l => l.includes('board update failed')), { timeout: 10_000 }).toBe(true);
  expect(brokenServed).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.body.style.opacity)).toBe('0');

  // the next board state (a pull: Bob lays a card) sets the page up
  broken = false;
  await pickCard(bob, 'three01');
  await expect.poll(() => page.evaluate(() => document.body.style.opacity), { timeout: 15_000 }).toBe('1');
  await expect(page.locator('#cbox .c')).toHaveCount(2);
  await expect(deckCards(page).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a double click before the board starts loads nothing without a team (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Early Dblclick');
  const team = new URL(url).searchParams.get('t');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  const daoUrls: string[] = [];
  page.on('request', req => { if (req.url().includes('/api/dao.php')) daoUrls.push(req.url()); });
  // a deferred script after script.js comes late: script.js has run, loadBoard() (DOMContentLoaded) has not
  let release!: () => void;
  const held = new Promise<void>(r => { release = r; });
  await page.route('**/js-confetti*', async route => { await held; await route.continue(); });
  await page.goto(url, { waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => typeof (window as any).onBodyDblClick === 'function'
    && (0, eval)('typeof t === "undefined" || t === null'))).toBe(true);
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  release();
  await expect.poll(() => page.evaluate(() => document.body.style.opacity), { timeout: 10_000 }).toBe('1');
  expect(daoUrls.length).toBeGreaterThan(0);
  for (const u of daoUrls) expect(new URL(u).searchParams.get('t')).toBe(team);
  expect(errors).toEqual([]);
});

test('the start does not wait for window load: a hanging plausible.io or a slow image does not hold it up (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup No Window Load');
  const page = await samePlayer(alice);
  const errors = collectPageErrors(page);
  await recordReveal(page);
  // the context of newPlayer() aborts every external host at once; a page route wins over it, so the analytics
  // script hangs here (as on a slow or blocked network), and so does the average pointer image
  let release!: () => void;
  const held = new Promise<void>(r => { release = r; });
  let analytics = 0;
  let image = 0;
  await page.route(/^https:\/\/plausible\.io\//, async route => { analytics++; await held; await route.abort().catch(() => undefined); });
  await page.route('**/src/index.png*', async route => { image++; await held; await route.continue().catch(() => undefined); });
  const started = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  await expect.poll(() => shown(page), { timeout: 10_000 }).not.toBeNull();
  const s = (await shown(page))!;
  expect(s.at - started).toBeLessThan(5_000);
  expect(s.cards).toBe(2);
  expect(s.deck).toBeGreaterThan(0);
  expect(analytics).toBe(1);
  expect(image).toBe(1);
  expect(await page.evaluate(() => document.readyState)).not.toBe('complete'); // window load is still pending
  await pickCard(page, 'three01');
  release();
  expect(errors).toEqual([]);

  // the start page as well
  const init = await samePlayer(alice);
  const initErrors = collectPageErrors(init);
  let initAnalytics = 0;
  let release2!: () => void;
  const held2 = new Promise<void>(r => { release2 = r; });
  await init.route(/^https:\/\/plausible\.io\//, async route => { initAnalytics++; await held2; await route.abort().catch(() => undefined); });
  await init.goto('/', { waitUntil: 'commit' });
  await pageReady(init, 10_000);
  expect(initAnalytics).toBe(1);
  expect(await init.evaluate(() => document.readyState)).not.toBe('complete');
  release2();
  expect(initErrors).toEqual([]);
});

test('before the set-up a hanging dao.php is given up after 8 s, 16 s, then 30 s per try (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Boot Timeout');
  const page = await samePlayer(alice);
  // no connection to poker-msg (its onopen loads dao.php too): only the boot loads and their retries count
  await page.routeWebSocket(/\/poker-msg/, ws => { ws.close(); });
  // the (fake) time at which the page starts each load of dao.php
  await page.addInitScript(() => {
    const w = window as any;
    w.__daoAt = [] as number[];
    const orig = window.fetch.bind(window);
    window.fetch = (input: any, init?: any) => {
      if (String(input instanceof Request ? input.url : input).includes('/api/dao.php')) w.__daoAt.push(Date.now());
      return orig(input, init);
    };
  });
  const hanging: { abort: () => Promise<void> }[] = [];
  await page.route('**/api/dao.php*', route => { hanging.push(route); });
  await page.clock.install();
  await page.goto(url, { waitUntil: 'commit' });
  const daoAt = (): Promise<number[]> => page.evaluate(() => (window as any).__daoAt ?? []);
  await expect.poll(async () => (await daoAt()).length).toBe(1);
  // from here on the fake time only moves in steps of 500 ms (the abort and the retry need the real event loop)
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  const STEP = 500;
  for (let i = 0; i < 240 && (await daoAt()).length < 5; i++) {
    await page.clock.runFor(STEP);
    await page.waitForTimeout(20);
  }
  const at = await daoAt();
  expect(at.length).toBeGreaterThanOrEqual(5);
  const gaps = at.slice(1, 5).map((t, i) => t - at[i]);
  // gap = timeout of the try + wait of the boot retry (800 ms, 1.6 s, 3.2 s, 5 s), plus at most one step
  const expected = [8_000 + 800, 16_000 + 1_600, 30_000 + 3_200, 30_000 + 5_000];
  gaps.forEach((gap, i) => {
    expect(gap).toBeGreaterThanOrEqual(expected[i] - 50); // the first load starts while the clock still runs
    expect(gap).toBeLessThanOrEqual(expected[i] + STEP + 100);
  });
  for (const route of hanging) await route.abort().catch(() => undefined);
});
