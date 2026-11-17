import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, teamWithTwoPlayers, pickCard, deckCards } from './helpers';

/**
 * B-34: the start of the board and of the start page loads without synchronous requests. The page shows only when
 * it is complete (card config, first board state with all cards, card symbols), all at once. A spinner shows only
 * when that takes longer than 0.4 s; failures end in the board or in a hint with a reload button, never in an
 * endless spinner or an empty page.
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
      if (root.classList.contains('ready')) { w.__spin.readyAt = performance.now(); return; }
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

test('no spinner on a fast load, the spinner after 0.4 s on a slow one (B-34)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Startup Spinner');

  // fast: the spinner never shows before 0.4 s (and on a load faster than that not at all)
  const fast = await samePlayer(alice);
  await sampleSpinner(fast);
  await fast.goto(url);
  await expect.poll(() => fast.evaluate(() => (window as any).__spin.readyAt)).not.toBeNull();
  const f = await fast.evaluate(() => (window as any).__spin);
  for (const [t, o] of f.samples) if (t < 400) expect(o).toBe(0);
  if (f.readyAt < 380) expect(Math.max(...f.samples.map((x: [number, number]) => x[1]))).toBe(0);
  await expect.poll(() => fast.evaluate(() => getComputedStyle(document.documentElement, '::after').display)).toBe('none');
  await fast.close();

  // slow: the board state takes 2 s, the spinner shows meanwhile, the board stays hidden
  const slow = await samePlayer(alice);
  await sampleSpinner(slow);
  await slow.route('**/api/dao.php*', async route => { await new Promise(r => setTimeout(r, 2000)); await route.continue(); });
  await slow.goto(url, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => slow.evaluate(() => getComputedStyle(document.documentElement, '::after').opacity)).toBe('1');
  expect(await slow.evaluate(() => document.body.style.opacity)).toBe('0');
  await expect.poll(() => slow.evaluate(() => (window as any).__spin.readyAt), { timeout: 10_000 }).not.toBeNull();
  const sl = await slow.evaluate(() => (window as any).__spin);
  for (const [t, o] of sl.samples) if (t < 400) expect(o).toBe(0);
  expect(await slow.evaluate(() => document.body.style.opacity)).toBe('1');
  expect(await slow.evaluate(() => getComputedStyle(document.documentElement, '::after').display)).toBe('none');
  await expect(slow.locator('#cbox .c')).toHaveCount(2);
});

test('the board loads without cards.json and without card_catalog.json (B-34)', async ({ browser }) => {
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
  await noCatalog.route('**/card_catalog.json*', route => route.abort());
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

test('start page: shows without get_user.php, in dark, and creating a team works (B-34)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const errors = collectPageErrors(page);
  await page.route('**/api/get_user.php*', route => route.abort());
  const url = await createTeam(page, 'Startup No User');
  expect(url).toContain('?t=');
  expect(errors).toEqual([]);

  const again = await newPlayer(browser);
  await again.route('**/api/get_user.php*', route => route.abort());
  await again.goto('/');
  await expect.poll(() => again.evaluate(() => document.body.style.opacity)).toBe('1');
  expect(await again.evaluate(() => document.body.classList.contains('light-theme'))).toBe(false);
  await expect(again.locator('#teaminput')).toBeFocused();
});

test('start page: the form never submits natively while the color mode loads (B-34)', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.route('**/api/get_user.php*', async route => { await new Promise(r => setTimeout(r, 2000)); await route.continue(); });
  await page.goto('/');
  expect(await page.evaluate(() => document.body.style.opacity)).toBe('0');
  await page.locator('#teambtn').click();
  await expect(page.locator('#team_err')).toBeVisible();
  expect(page.url()).not.toContain('searchName');
  await expect.poll(() => page.evaluate(() => document.body.style.opacity), { timeout: 10_000 }).toBe('1');
  expect(page.url()).not.toContain('searchName');
});

test('start page: a saved light mode is there when the page shows, no dark flash (B-34)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  await createTeam(alice, 'Startup Light');
  const sid = await alice.evaluate(() => localStorage.getItem('SID'));
  const res = await alice.request.post(`/api/update_user.php?id=${encodeURIComponent(sid ?? '')}&color_mode=light`);
  expect(res.ok()).toBeTruthy();

  const page = await samePlayer(alice);
  await recordReveal(page);
  await page.goto('/');
  await expect.poll(() => shown(page)).not.toBeNull();
  expect((await shown(page))!.light).toBe(true);
});
