import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, pickCard, setTimer, deckCard, deckCards, setLegacyDeck } from './helpers';

/**
 * B-68: from 800px a column is always there on the right, as wide as the menu panel: where the round
 * is (#round_status), the topic and, once the cards are revealed, the spread with the average pointer
 * (board setting show_avg). The spread keeps its room before the reveal, so nothing moves. Its foot
 * is the round actions (timer above the round button); the button keeps its place when the timer
 * is switched on or off and ends a little (--dock-lift, 20px) above the deck tray's bottom edge; the deck is a compact tray floating
 * over the table, a gap before the column; its cards shrink to fit before it scrolls. The menu panel covers the column. Phones: no status
 * line; the spread (once revealed) and the round actions are a strip right above the deck. The spread's bars are stacks of
 * blocks of a fixed height per round (bar height / players), votes fade whole blocks in and out. The deck is input only (no usage bars, no pointer); keys 1–9
 * and 0 pick a card.
 */
const DESKTOP = { width: 1280, height: 800 };

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test('column: status, topic, spread and the round actions at its foot (B-68)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Side Column');
  const t = new URL(url).searchParams.get('t')!;
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP });
  await joinAsPlayer(bob, url, 'Bob');

  // the column on the right edge down to the bottom, the table left of it; the round actions at its foot
  const status = alice.locator('#round_status');
  await expect(status).toBeVisible();
  await expect(status).toHaveText('voting · 0/2 voted');
  const side = await box(alice, '.side');
  const table = await box(alice, '#table');
  expect(Math.round(side.x + side.width)).toBe(DESKTOP.width);
  expect(Math.round(side.width)).toBe(380); // --col-w (as wide as the menu panel here)
  expect(table.x + table.width).toBeLessThanOrEqual(side.x + 1);
  await expect.poll(async () => {
    const dock = await box(alice, '.dock');
    return Math.abs(dock.x - side.x) < 1 && Math.abs(dock.width - side.width) < 1
      && Math.abs(dock.y - (side.y + side.height)) < 1 && Math.round(dock.y + dock.height) === DESKTOP.height;
  }).toBe(true);

  // the deck: a tray floating over the table, a gap before the column and the bottom edge,
  // no line on top; the round button ends 20px (--dock-lift) above the tray's bottom edge (B-68 polish)
  const tray = await box(alice, '#down-container');
  expect(tray.x + tray.width).toBeLessThanOrEqual(side.x - 8);
  expect(tray.y + tray.height).toBeLessThanOrEqual(DESKTOP.height - 8);
  expect(await alice.locator('#down-container').evaluate(el => {
    const cs = getComputedStyle(el);
    return [cs.borderTopWidth, parseFloat(cs.borderTopLeftRadius) > 0, cs.boxShadow.includes('inset')];
  })).toEqual(['0px', true, false]);
  const trayBottom = async () => { const b = await box(alice, '#down-container'); return b.y + b.height; };
  const btnBottom = async () => { const b = await box(alice, '#newroundbtn'); return b.y + b.height; };
  const LIFT = 20;
  await expect.poll(async () => Math.abs(await btnBottom() + LIFT - await trayBottom())).toBeLessThan(1.5);
  // compact: hardly any room above the cards
  const cardTop = (await deckCards(alice).first().boundingBox())!.y;
  expect(cardTop - (await box(alice, '#down-container')).y).toBeLessThan(16);

  // the topic is in the column
  await alice.request.post(`/api/update_topic.php?t=${encodeURIComponent(t)}`, { form: { topic: 'PAY-142 pay by invoice' } });
  await alice.reload();
  await expect(alice.locator('#topic')).toHaveText('PAY-142 pay by invoice');
  const topic = await box(alice, '.topic-bar');
  expect(topic.x).toBeGreaterThanOrEqual(side.x - 1);
  expect(topic.y).toBeGreaterThanOrEqual((await box(alice, '#round_status')).y);

  // voting: no spread yet, but its room is kept; the round button keeps its place when the timer
  // goes on and off. Alice picks the 6th card (5) with the key 6.
  await alice.keyboard.press('6');
  await expect(deckCard(alice, 'five001')).toHaveClass(/selected/);
  await expect(status).toHaveText('voting · 1/2 voted');
  await expect(alice.locator('#spread')).toBeHidden();
  const spreadBefore = await box(alice, '#spread');
  expect(spreadBefore.height).toBeGreaterThan(100);
  const btnBefore = await box(alice, '#newroundbtn');
  await setTimer(alice, true);
  expect(await box(alice, '#newroundbtn')).toEqual(btnBefore);
  const timer = await box(alice, '#timer');
  expect(timer.y + timer.height).toBeLessThanOrEqual(btnBefore.y);
  expect(Math.abs(btnBefore.y + btnBefore.height + LIFT - await trayBottom())).toBeLessThan(1.5);
  await setTimer(alice, false);
  expect(await box(alice, '#newroundbtn')).toEqual(btnBefore);

  // revealed: the spread in the column at the same place and height, the deck does not grow;
  // no pointer while show_avg is off
  const deckHeight = (await box(alice, '#ctl')).height;
  expect(await alice.locator('#ctl').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await pickCard(bob, 'five001');
  await expect(status).toHaveText('revealed');
  await expect(alice.locator('#spread')).toBeVisible();
  const five = alice.locator('#spread_bars [data-card="five001"]');
  await expect(five.locator('.spread-count')).toHaveText('2');
  await expect(five).toHaveClass(/top/);
  await expect(five.locator('.spread-seg:not(.out)')).toHaveCount(2); // one block per vote
  // a block: the bar height (64px) shared by the 2 players, less the 2px gap; built up from the
  // bottom (the lower block first; in DOM order the top one comes first)
  await expect.poll(() => five.locator('.spread-seg').evaluateAll(segs =>
    segs.map(seg => Math.round(seg.getBoundingClientRect().height)))).toEqual([30, 30]);
  expect(await five.locator('.spread-seg').evaluateAll(segs =>
    segs.map(seg => (seg as HTMLElement).style.transitionDelay))).toEqual(['70ms, 0s', '0ms, 0s']);
  await expect(five.locator('.spread-value')).toHaveText('5');
  await expect(alice.locator('#spread_bars [data-card="1pnt501"] .spread-value')).toHaveText('½'); // cards.json symbol
  await expect(alice.locator('#spread_bars [data-card="three01"] .spread-count')).toHaveText('');
  await expect(alice.locator('#spread_range')).toHaveText('5');
  expect(await box(alice, '#spread')).toEqual(spreadBefore);
  expect((await box(alice, '#ctl')).height).toBe(deckHeight);
  await expect(alice.locator('#spread_index')).toHaveClass(/hidden/);

  // the menu panel lies over the column
  await alice.locator('#cset_btn').click();
  await expect.poll(async () => {
    const menu = await box(alice, 'dialog#menu'); // polled: it slides in
    return menu.x <= side.x && Math.round(menu.x + menu.width) === DESKTOP.width;
  }).toBe(true);
  await alice.keyboard.press('Escape');

  // the hint sits in the row of the keys (level with them) when it fits next to them
  await expect(alice.locator('#down-container')).not.toHaveClass(/hint-off/);
  await expect(alice.locator('.deck-hint')).toBeVisible();
  const keyBox = await box(alice, '#ctl .ctl-key >> nth=0');
  const hintBox = await box(alice, '.deck-hint');
  expect(Math.abs(keyBox.y + keyBox.height - (hintBox.y + hintBox.height))).toBeLessThan(2.5);

  // a key in the menu does not pick a card
  await alice.locator('#cset_btn').click();
  await alice.keyboard.press('1');
  await expect(deckCard(alice, 'five001')).toHaveClass(/selected/);
  await alice.keyboard.press('Escape');

  // still the column at 820px, narrower (300-380px); all 15 cards fit without scrolling (they
  // shrink), the button stays 20px above the tray's bottom edge
  await alice.setViewportSize({ width: 820, height: 800 });
  await expect(status).toBeVisible();
  const narrowSide = await box(alice, '.side');
  expect(narrowSide.width).toBeGreaterThanOrEqual(300);
  expect(narrowSide.width).toBeLessThan(380);
  expect(Math.round(narrowSide.x + narrowSide.width)).toBe(820);
  await expect.poll(() => alice.locator('#ctl').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect.poll(async () => Math.abs(await btnBottom() + LIFT - await trayBottom())).toBeLessThan(1.5);

  // phones: no status, the topic strip below the header, the spread and the round actions right
  // above the deck
  // the blocks jump to the phones' height on the resize, only votes animate (2 votes of 2: 34px)
  await alice.setViewportSize({ width: 390, height: 844 });
  expect(await five.locator('.spread-bar').evaluate(bar => new Promise<number>(resolve =>
    requestAnimationFrame(() => resolve(bar.getBoundingClientRect().height))))).toBeCloseTo(34, 0);
  await expect(status).toBeHidden();
  await expect(alice.locator('.topic-bar')).toBeVisible();
  await expect(alice.locator('#spread')).toBeVisible();
  const strip = await box(alice, '.side');
  const dock = await box(alice, '.dock');
  const deck = await box(alice, '#down-container');
  expect(Math.abs(strip.y + strip.height - dock.y)).toBeLessThan(1);
  expect(Math.abs(dock.y + dock.height - deck.y)).toBeLessThan(1);
  await expect(status).toBeHidden();

  // phones, before the reveal: no strip at all (no status line), the table reaches the dock
  await alice.locator('#newroundbtn').click();
  await expect(alice.locator('#spread')).toBeHidden();
  await expect(alice.locator('.side')).toBeHidden();
  await expect(status).toBeHidden();
  const tableBox = await box(alice, '#table');
  expect(Math.abs(tableBox.y + tableBox.height - (await box(alice, '.dock')).y)).toBeLessThan(1);
  await pickCard(alice, 'five001');
  await pickCard(bob, 'three01');
  await expect(alice.locator('#spread')).toBeVisible();
  await expect(status).toBeHidden();
  await expect(alice.locator('#spread_bars [data-card="three01"] .spread-seg:not(.out)')).toHaveCount(1);
  await alice.context().close();
  await bob.context().close();
});


test('deck tray: the hint never takes a row of its own, scrolling only as a last resort (B-68)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Deck Tray');
  const t = new URL(url).searchParams.get('t')!;
  await setLegacyDeck(alice, t, [0, 2, 3, 4, 6, 9, 10, 11, 12, 13]); // 10 cards: the 10th key lies far right
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(10);
  const hint = alice.locator('.deck-hint');
  const trayRoom = async () => (await box(alice, '#down-container')).height - (await box(alice, '#ctl')).height;

  // wide: the hint in the row of the keys
  await expect(alice.locator('#down-container')).not.toHaveClass(/hint-off/);
  await expect(hint).toBeVisible();
  const roomWide = await trayRoom();

  // narrower: the hint does not fit next to the keys: hidden, the tray keeps its height
  await alice.setViewportSize({ width: 900, height: 800 });
  await expect(alice.locator('#down-container')).toHaveClass(/hint-off/);
  await expect(hint).toBeHidden();
  expect(Math.abs(await trayRoom() - roomWide)).toBeLessThan(1);
  await alice.setViewportSize(DESKTOP);
  await expect(hint).toBeVisible();

  // a very large deck: the cards shrink to their minimum, only then the deck scrolls
  await setLegacyDeck(alice, t, Array.from({ length: 46 }, (_, i) => i));
  await alice.reload();
  await expect(deckCards(alice)).toHaveCount(46);
  await expect.poll(() => alice.locator('#ctl').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  const w = (await deckCards(alice).first().boundingBox())!.width;
  expect(w).toBeGreaterThanOrEqual(25.5);
  expect(w).toBeLessThan(30);
  await expect(hint).toBeHidden();
  await alice.context().close();
});
