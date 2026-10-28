import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, setTimer } from './helpers';

/**
 * B-68: from 800px a column is always there on the right, as wide as the menu panel: where the round
 * is (#round_status), the topic and, once the cards are revealed, the spread with the average pointer
 * (board setting show_avg). The spread keeps its room before the reveal, so nothing moves. Its foot
 * is the bottom right corner with timer and round button; the button keeps its place when the timer
 * is switched on or off. The menu panel covers the column. Phones: the spread and the round actions
 * are a strip right above the deck. The deck is input only (no usage bars, no pointer); keys 1–9
 * and 0 pick a card.
 */
const DESKTOP = { width: 1280, height: 800 };

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test('column: status, topic, spread and the corner (B-68)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Side Column');
  const t = new URL(url).searchParams.get('t')!;
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP });
  await joinAsPlayer(bob, url, 'Bob');

  // the column on the right edge, the table left of it, the corner below it, as wide as the column
  const status = alice.locator('#round_status');
  await expect(status).toBeVisible();
  await expect(status).toHaveText('voting · 0/2 voted');
  const side = await box(alice, '.side');
  const table = await box(alice, '#table');
  expect(Math.round(side.x + side.width)).toBe(DESKTOP.width);
  expect(Math.round(side.width)).toBe(380); // --panel-w
  expect(table.x + table.width).toBeLessThanOrEqual(side.x + 1);
  await expect.poll(async () => {
    const dock = await box(alice, '.dock');
    return Math.abs(dock.x - side.x) < 1 && Math.abs(dock.width - side.width) < 1
      && Math.abs(dock.y - (side.y + side.height)) < 1 && Math.round(dock.y + dock.height) === DESKTOP.height;
  }).toBe(true);

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
  await expect(alice.locator('#ctl img#five001')).toHaveClass(/selected/);
  await expect(status).toHaveText('voting · 1/2 voted');
  await expect(alice.locator('#spread')).toBeHidden();
  const spreadBefore = await box(alice, '#spread');
  expect(spreadBefore.height).toBeGreaterThan(100);
  const btnBefore = await box(alice, '#newroundbtn');
  await setTimer(alice, true);
  expect(await box(alice, '#newroundbtn')).toEqual(btnBefore);
  const timer = await box(alice, '#timer');
  expect(timer.y + timer.height).toBeLessThanOrEqual(btnBefore.y);
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

  // a key in the menu does not pick a card
  await alice.locator('#cset_btn').click();
  await alice.keyboard.press('1');
  await expect(alice.locator('#ctl img#five001')).toHaveClass(/selected/);
  await alice.keyboard.press('Escape');

  // still the column at 820px
  await alice.setViewportSize({ width: 820, height: 800 });
  await expect(status).toBeVisible();
  expect(Math.round((await box(alice, '.side')).x)).toBe(820 - 380);

  // phones: no status, the topic strip below the header, the spread and the round actions right
  // above the deck
  await alice.setViewportSize({ width: 390, height: 844 });
  await expect(status).toBeHidden();
  await expect(alice.locator('.topic-bar')).toBeVisible();
  await expect(alice.locator('#spread')).toBeVisible();
  const strip = await box(alice, '.side');
  const dock = await box(alice, '.dock');
  const deck = await box(alice, '#down-container');
  expect(Math.abs(strip.y + strip.height - dock.y)).toBeLessThan(1);
  expect(Math.abs(dock.y + dock.height - deck.y)).toBeLessThan(1);
  await alice.context().close();
  await bob.context().close();
});
