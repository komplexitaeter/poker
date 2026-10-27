import { test, expect, Page, Browser } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, tableCard, pickCard } from './helpers';

/**
 * B-49: fluid cards, "fit to table". script.js gives the table cards the largest width between
 * --card-min and --card-max (style.css) at which all of them fit into the table, as --card-w on #cbox.
 * A change of the number of players glides (FLIP with scale, id 'flip'); a resize does not (B-39).
 */
const PHONE = { width: 375, height: 667 };

/** Records every animate() call with an id (as in card-flip.spec.ts), with its first transform. */
async function recordAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__anims = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes: any, options: any) {
      if (options && typeof options === 'object' && options.id) {
        const first = Array.isArray(keyframes) ? keyframes[0] : {};
        (window as any).__anims.push({ id: options.id, from: String(first.transform ?? first.height ?? '') });
      }
      return original.call(this, keyframes, options);
    };
  });
}
const recorded = (page: Page) => page.evaluate(() => (window as any).__anims as { id: string; from: string }[]);

const cardWidth = (page: Page, name: string) =>
  tableCard(page, name).evaluate(card => card.getBoundingClientRect().width);

/** Width without a running transform (the --card-w the layout uses). */
const layoutWidth = (page: Page, name: string) =>
  tableCard(page, name).evaluate(card => (card as HTMLElement).offsetWidth);

/** Joins Alice plus `others` players on a touch phone and votes, so the dock (New Round) shows. */
async function phoneTable(browser: Browser, viewport: { width: number; height: number }, others: number, name: string) {
  const alice = await newPlayer(browser, { viewport, hasTouch: true, isMobile: true });
  const url = await createTeam(alice, name);
  await joinAsPlayer(alice, url, 'Alice');
  await addPlayersViaApi(alice, url, Array.from({ length: others }, (_, i) => `P${String(i + 1).padStart(2, '0')}`));
  await alice.reload();
  await expect(alice.locator('#cbox .c')).toHaveCount(others + 1);
  await pickCard(alice, 'three01');
  await expect(alice.locator('#newroundbtn')).toBeVisible();
  return alice;
}

const tableOverflow = (page: Page) => page.evaluate(() => {
  const table = document.getElementById('table')!;
  return table.scrollHeight - table.clientHeight;
});

// --card-min 64px: measured maximum without scrolling (touch, after a vote): 15 at 375x667, 25 at 393x852
for (const { viewport, players } of [
  { viewport: PHONE, players: 15 },
  { viewport: { width: 393, height: 852 }, players: 20 },
]) {
  test(`phone ${viewport.width}x${viewport.height}: ${players} players fit on the table without scrolling (B-49)`, async ({ browser }) => {
    const alice = await phoneTable(browser, viewport, players - 1, 'Fluid Phone');
    await expect.poll(() => tableOverflow(alice)).toBeLessThanOrEqual(0);
    // every card lies inside the visible table, above the dock
    const outside = await alice.evaluate(() => {
      const table = document.getElementById('table')!.getBoundingClientRect();
      const dock = document.querySelector('#table .dock')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll('#cbox .c'))
        .map(card => card.getBoundingClientRect())
        .filter(r => r.top < table.top || r.bottom > dock.top || r.left < table.left || r.right > table.right).length;
    });
    expect(outside).toBe(0);
    expect(await layoutWidth(alice, 'Alice')).toBeGreaterThanOrEqual(64); // --card-min: names stay readable
  });
}

test('phone 375x667: 21 players get the minimum card width and the table scrolls (B-49)', async ({ browser }) => {
  const alice = await phoneTable(browser, PHONE, 20, 'Fluid Scroll');
  await expect.poll(() => layoutWidth(alice, 'Alice')).toBe(64); // --card-min, not smaller
  await expect.poll(() => tableOverflow(alice)).toBeGreaterThan(0);
  // the page itself does not scroll, only the table
  expect(await alice.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
});

test('large screen: few players get large cards (B-49)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 800 } });
  const url = await createTeam(alice, 'Fluid Large');
  await addPlayersViaApi(alice, url, ['Bob', 'Carol']);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#cbox .c')).toHaveCount(3);
  await expect.poll(() => cardWidth(alice, 'Alice')).toBeGreaterThan(100);
  // the whole card scales: image and gap (layout values, a glide of the join may still run)
  const { gap, image, width } = await alice.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('#cbox .c'));
    const img = cards[0].querySelector<HTMLElement>('img.card_image')!;
    return {
      gap: cards[1].offsetLeft - (cards[0].offsetLeft + cards[0].offsetWidth),
      image: img.offsetHeight / img.offsetWidth,
      width: cards[0].offsetWidth,
    };
  });
  expect(gap).toBeCloseTo(0.1 * width, 0);
  expect(image).toBeCloseTo(1.48, 1);
});

test('a new player: the cards shrink with a glide, a resize just sets the size (B-49, B-39)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE });
  await recordAnimations(alice);
  const url = await createTeam(alice, 'Fluid Glide');
  // 6 cards fit at the phone maximum (3 rows of 2 would not, 2 rows of 3 do); a 7th makes them smaller
  await addPlayersViaApi(alice, url, ['Bob', 'Carol', 'Dave', 'Erin', 'Fay']);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#cbox .c')).toHaveCount(6);
  await expect.poll(() => cardWidth(alice, 'Alice')).toBe(110);
  await alice.waitForTimeout(1200); // glides of the join are over
  const before = (await recorded(alice)).length;

  const zoe = await newPlayer(browser);
  await joinAsPlayer(zoe, url, 'Zoe');
  await expect(alice.locator('#cbox .c')).toHaveCount(7);
  await expect.poll(() => layoutWidth(alice, 'Alice')).toBeLessThan(110);
  const small = await layoutWidth(alice, 'Alice');

  // the existing cards glide from their former, larger size
  const flips = (await recorded(alice)).slice(before).filter(r => r.id === 'flip');
  expect(flips.length).toBeGreaterThan(0);
  const scales = flips.map(r => Number(r.from.match(/scale\(([\d.]+)\)/)?.[1] ?? 1));
  expect(Math.max(...scales)).toBeCloseTo(110 / small, 2);
  // ... and end at the new size
  await expect.poll(() => cardWidth(alice, 'Alice')).toBe(small);

  // resize: a new size, but no glide
  const beforeResize = (await recorded(alice)).length;
  await alice.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => cardWidth(alice, 'Alice')).toBe(150);
  await alice.waitForTimeout(300);
  expect((await recorded(alice)).slice(beforeResize).filter(r => r.id === 'flip')).toEqual([]);
});

test('prefers-reduced-motion: a new player changes the size without a glide (B-49)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE });
  await alice.emulateMedia({ reducedMotion: 'reduce' });
  await recordAnimations(alice);
  const url = await createTeam(alice, 'Fluid Calm');
  await addPlayersViaApi(alice, url, ['Bob', 'Carol', 'Dave', 'Erin', 'Fay']);
  await joinAsPlayer(alice, url, 'Alice');
  await expect.poll(() => cardWidth(alice, 'Alice')).toBe(110);

  const zoe = await newPlayer(browser);
  await joinAsPlayer(zoe, url, 'Zoe');
  await expect(alice.locator('#cbox .c')).toHaveCount(7);
  await expect.poll(() => cardWidth(alice, 'Alice')).toBeLessThan(110);
  await alice.waitForTimeout(300);
  expect(await recorded(alice)).toEqual([]);
});

test('the average indicator points at the middle of the deck card (B-49)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 800 } });
  const url = await createTeam(alice, 'Fluid Average');
  const t = new URL(url).searchParams.get('t')!;
  const res = await alice.request.post(`/api/update_show_avg.php?t=${encodeURIComponent(t)}&show_avg=1`);
  expect(res.ok()).toBeTruthy();
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  await pickCard(bob, 'five001');
  await pickCard(alice, 'five001');
  await expect(alice.locator('#ctl')).toHaveClass(/show_card_stats/);
  await expect(alice.locator('#index')).toHaveClass(/visible/);

  const offCentre = () => alice.evaluate(() => {
    const index = document.getElementById('index')!.getBoundingClientRect();
    const card = document.getElementById('five001')!.getBoundingClientRect();
    return Math.abs((index.left + index.width / 2) - (card.left + card.width / 2));
  });
  await expect.poll(offCentre).toBeLessThan(1);
  // the usage bar scales with the deck card (custom property, no inline box-shadow)
  await expect(alice.locator('#ctl img#five001')).toHaveAttribute('style', /--usage: 1/);

  // larger deck cards on a wide screen: still in the middle
  await alice.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(offCentre).toBeLessThan(1);
});
