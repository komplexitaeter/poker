import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, tableCard, pickCard, setTimer } from './helpers';

/**
 * B-49 follow-up: the card size depends on the number of players and the table only.
 * B-68: the round actions (.dock, New Round + timer) and the spread lie outside the table with a
 * fixed height (large screens: the column; phones: a strip above the deck), so switching the
 * timer, the first vote or a new round neither resizes the cards nor lets the dock cover
 * them; the outer cards keep a side gutter to the edge of the table.
 * The delete icon depends on the input device, not on the width.
 * SHOT_DIR (optional): screenshots of the cases.
 */
const PHONE = { width: 375, height: 667 };
const DESKTOP = { width: 1280, height: 800 };

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);

/** --card-w as the layout uses it (no running transform). */
const layoutWidth = (page: Page) => tableCard(page, 'Alice').evaluate(card => (card as HTMLElement).offsetWidth);

async function settledWidth(page: Page): Promise<number> {
  await page.waitForTimeout(1200); // glides and pending pulls are over
  return layoutWidth(page);
}


/** Lowest card bottom (incl. the delete icon), top of the dock, scroll overflow, smallest side gap. */
const geometry = (page: Page) => page.evaluate(() => {
  const table = document.getElementById('table')!;
  const t = table.getBoundingClientRect();
  const cards = Array.from(document.querySelectorAll('#cbox .c'));
  const rects = cards.map(card => card.getBoundingClientRect());
  const bottoms = cards.map(card => Math.max(...Array.from(card.querySelectorAll('img'))
    .map(img => img.getBoundingClientRect().bottom), card.getBoundingClientRect().bottom));
  return {
    cardsBottom: Math.max(...bottoms),
    dockTop: document.querySelector('.dock')!.getBoundingClientRect().top,
    tableBottom: t.bottom,
    overflow: table.scrollHeight - table.clientHeight,
    sideGap: Math.min(...rects.map(r => Math.min(r.left - t.left, t.right - r.right))),
  };
});

async function shot(page: Page, name: string): Promise<void> {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
}

// The table height limits the card size: 2 rows in a smaller window (as on staging), 3 rows at 1280 x 800.
for (const { viewport, players, rows } of [
  { viewport: { width: 1000, height: 600 }, players: 10, rows: 2 },
  { viewport: DESKTOP, players: 25, rows: 3 }, // B-68: the column takes 380px of the width, the deck row is higher
]) {
  test(`desktop ${viewport.width}x${viewport.height}, ${rows} rows: the timer neither covers nor resizes the cards (B-49, B-66)`, async ({ browser }) => {
    const alice = await newPlayer(browser, { viewport });
    const url = await createTeam(alice, 'Fit Desktop');
    await addPlayersViaApi(alice, url, names(players - 1));
    await joinAsPlayer(alice, url, 'Alice');
    await expect(alice.locator('#cbox .c')).toHaveCount(players);
    await pickCard(alice, 'three01');
    await expect(alice.locator('#newroundbtn')).toBeEnabled();
    const off = await settledWidth(alice);
    expect(await alice.evaluate(() =>
      new Set(Array.from(document.querySelectorAll<HTMLElement>('#cbox .c')).map(c => c.offsetTop)).size)).toBe(rows);

    await setTimer(alice, true);
    // right after the switch, and fitted anew after a reload
    for (const reload of [false, true]) {
      if (reload) {
        await alice.reload();
        await expect(alice.locator('#timer')).toBeVisible();
      }
      expect(await settledWidth(alice)).toBe(off);
      const g = await geometry(alice);
      expect(g.cardsBottom).toBeLessThanOrEqual(g.dockTop);
      // B-68: at the foot of the column, below the table
      expect(g.dockTop).toBeGreaterThanOrEqual(g.tableBottom - 0.5);
      expect(g.overflow).toBeLessThanOrEqual(0);
      expect(g.sideGap).toBeGreaterThanOrEqual(16); // 8px table padding + gutter of at least 8px
    }
    await shot(alice, `desktop-${viewport.width}-timer-on`);

    await setTimer(alice, false);
    expect(await settledWidth(alice)).toBe(off);
  });
}

test('phone: the card width ignores timer, first vote and new round (B-49)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE, hasTouch: true, isMobile: true });
  const url = await createTeam(alice, 'Fit Phone');
  await addPlayersViaApi(alice, url, names(9));
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#cbox .c')).toHaveCount(10);
  const base = await settledWidth(alice);
  await shot(alice, 'phone-before-vote');

  await setTimer(alice, true);
  expect(await settledWidth(alice)).toBe(base);
  await pickCard(alice, 'three01');
  await expect(alice.locator('#newroundbtn')).toBeEnabled();
  expect(await settledWidth(alice)).toBe(base);
  const g = await geometry(alice);
  expect(g.cardsBottom).toBeLessThanOrEqual(g.dockTop);
  expect(g.overflow).toBeLessThanOrEqual(0);
  expect(g.sideGap).toBeGreaterThanOrEqual(8);
  await shot(alice, 'phone-timer-on-voted');

  await setTimer(alice, false);
  expect(await settledWidth(alice)).toBe(base);
  await alice.locator('#newroundbtn').click();
  await expect(alice.locator('#newroundbtn')).toBeDisabled(); // B-67: always there, disabled until a vote
  expect(await settledWidth(alice)).toBe(base);
});

test('narrow window: a full row keeps a gutter to the edge of the table (B-49)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 600, height: 800 } });
  const url = await createTeam(alice, 'Fit Gutter');
  await addPlayersViaApi(alice, url, names(7));
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#cbox .c')).toHaveCount(8);
  await settledWidth(alice);
  const g = await geometry(alice);
  expect(g.sideGap).toBeGreaterThanOrEqual(8);
  expect(g.overflow).toBeLessThanOrEqual(0);
  await shot(alice, 'narrow-gutter');
});

test('delete icon: by input device, not by width (B-49)', async ({ browser }) => {
  // a narrow desktop window with a mouse: on hover only
  const alice = await newPlayer(browser, { viewport: { width: 600, height: 800 } });
  const url = await createTeam(alice, 'Fit Delete');
  await joinAsPlayer(alice, url, 'Alice');
  await alice.mouse.move(0, 0);
  await expect(tableCard(alice, 'Alice').locator('.delete')).toBeHidden();
  await tableCard(alice, 'Alice').hover();
  await expect(tableCard(alice, 'Alice').locator('.delete')).toBeVisible();

  // a phone: always
  const bob = await newPlayer(browser, { viewport: PHONE, hasTouch: true, isMobile: true });
  await joinAsPlayer(bob, url, 'Bob');
  await expect(tableCard(bob, 'Alice').locator('.delete')).toBeVisible();
  await expect(tableCard(bob, 'Bob').locator('.delete')).toBeVisible();
});

test('a long name stays inside the card and ends with an ellipsis (B-49)', async ({ browser }) => {
  const long = 'Andreas Paul Na'; // 15 characters, the maximum of the name field
  for (const viewport of [PHONE, { width: 1920, height: 1080 }]) {
    const page = await newPlayer(browser, { viewport });
    const url = await createTeam(page, 'Fit Name');
    await joinAsPlayer(page, url, long);
    const span = tableCard(page, long).locator('.card_player_name');
    await expect(span).toHaveAttribute('title', long);
    await page.waitForTimeout(1200);
    const m = await span.evaluate(el => {
      const card = el.parentElement!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // the text itself, clipped to the content box of the span
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      return {
        inside: box.left >= card.left - 0.5 && box.right <= card.right + 0.5,
        textLeft: Math.max(text.left, box.left + parseFloat(style.paddingLeft)) - card.left,
        textRight: card.right - Math.min(text.right, box.right - parseFloat(style.paddingRight)),
        overflow: style.overflow, ellipsis: style.textOverflow, width: card.width,
      };
    });
    expect(m.inside).toBe(true);
    expect(m.overflow).toBe('hidden');
    expect(m.ellipsis).toBe('ellipsis');
    // a visible margin left and right of the text
    expect(m.textLeft).toBeGreaterThanOrEqual(0.09 * m.width);
    expect(m.textRight).toBeGreaterThanOrEqual(0.09 * m.width);
    await shot(page, `name-${viewport.width}`);
  }
});
