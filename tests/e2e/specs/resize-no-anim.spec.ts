import { test, expect, Page } from '@playwright/test';
import { teamWithTwoPlayers, tableCard, newPlayer, joinAsPlayer } from './helpers';

/**
 * B-39 / B-41: On resize the cards must jump straight to their new position. The glide (FLIP,
 * Web Animations API with id 'flip') is meant for real changes of the order and must not run
 * after a resize: a resize starts no glide and ends one that is still running.
 */
const runningFlips = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('#cbox .c'))
      .flatMap(card => card.getAnimations())
      .filter(animation => animation.id === 'flip' && animation.playState === 'running').length);

/** Waits until the browser has rendered the next frame (the resize event has been handled). */
const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Left edge of a card as rendered vs. its place in the layout (without transforms). */
const cardLeft = (page: Page, name: string) =>
  tableCard(page, name).evaluate(card => {
    const box = document.getElementById('cbox')!.getBoundingClientRect();
    return { rendered: card.getBoundingClientRect().left - box.left, layout: (card as HTMLElement).offsetLeft };
  });

test('cards jump to their new position on resize without a glide (B-39, B-41)', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'ResizeNoAnim');
  await expect(tableCard(alice, 'Bob')).toBeVisible();

  // Aaron sorts in front of Alice and Bob: their cards start a 1s glide on Alice's board
  const aaron = await newPlayer(browser);
  await joinAsPlayer(aaron, url, 'Aaron');
  await expect.poll(() => runningFlips(alice)).toBeGreaterThan(0);

  // resize while the glide is running: it ends at once, the cards are at their place
  const before = await cardLeft(alice, 'Alice');
  await alice.setViewportSize({ width: 1600, height: 900 });
  await nextFrame(alice);
  expect(await runningFlips(alice)).toBe(0);
  const after = await cardLeft(alice, 'Alice');
  expect(Math.abs(after.layout - before.layout)).toBeGreaterThan(50); // the card really moved
  expect(Math.abs(after.rendered - after.layout)).toBeLessThan(1);

  // further resizes start no glide at all
  for (const width of [1400, 1100, 900, 700]) {
    await alice.setViewportSize({ width, height: 900 });
    await nextFrame(alice);
    expect(await runningFlips(alice)).toBe(0);
  }
});
