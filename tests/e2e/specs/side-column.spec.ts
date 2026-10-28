import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, setTimer } from './helpers';

/**
 * B-68: from 1200px a right column is always there: where the round is (#round_status), the topic and,
 * once the cards are revealed, the spread with the average pointer (board setting show_avg). Its foot
 * is the bottom right corner with timer and round button; the button keeps its place when the timer
 * is switched on or off. The menu panel covers the column. Below 1200px: no column (as before).
 */
const DESKTOP = { width: 1280, height: 800 };

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test('right column: status, topic, spread and the corner (B-68)', async ({ browser }) => {
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

  // voting: no spread yet; the round button keeps its place when the timer goes on and off
  await pickCard(alice, 'five001');
  await expect(status).toHaveText('voting · 1/2 voted');
  await expect(alice.locator('#spread')).toBeHidden();
  const btnBefore = await box(alice, '#newroundbtn');
  await setTimer(alice, true);
  expect(await box(alice, '#newroundbtn')).toEqual(btnBefore);
  const timer = await box(alice, '#timer');
  expect(timer.y + timer.height).toBeLessThanOrEqual(btnBefore.y);
  await setTimer(alice, false);
  expect(await box(alice, '#newroundbtn')).toEqual(btnBefore);

  // revealed: the spread in the column, the deck does not grow; no pointer while show_avg is off
  const deckHeight = (await box(alice, '#ctl')).height;
  await pickCard(bob, 'five001');
  await expect(status).toHaveText('revealed');
  await expect(alice.locator('#spread')).toBeVisible();
  const five = alice.locator('#spread_bars [data-card="five001"]');
  await expect(five.locator('.spread-count')).toHaveText('2');
  await expect(five).toHaveClass(/top/);
  await expect(alice.locator('#spread_bars [data-card="three01"] .spread-count')).toHaveText('');
  await alice.waitForTimeout(900); // the deck would grow with a transition
  expect((await box(alice, '#ctl')).height).toBe(deckHeight);
  await expect(alice.locator('#index')).toBeHidden();
  await expect(alice.locator('#spread_index')).toHaveClass(/hidden/);

  // the menu panel lies over the column
  await alice.locator('#cset_btn').click();
  await expect.poll(async () => {
    const menu = await box(alice, 'dialog#menu'); // polled: it slides in
    return menu.x <= side.x && Math.round(menu.x + menu.width) === DESKTOP.width;
  }).toBe(true);
  await alice.keyboard.press('Escape');

  // below 1200px: no column, the topic above the table, the spread on the deck
  await alice.setViewportSize({ width: 1100, height: 800 });
  await expect(status).toBeHidden();
  await expect(alice.locator('.side')).toBeHidden();
  await expect(alice.locator('.topic-bar')).toBeVisible();
  await expect(alice.locator('#ctl')).toHaveClass(/show_card_stats/);
  await alice.context().close();
  await bob.context().close();
});
