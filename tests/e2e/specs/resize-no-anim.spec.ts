import { test, expect } from '@playwright/test';
import { teamWithTwoPlayers, tableCard } from './helpers';

/**
 * B-39: On resize the player cards must jump straight to their new position
 * instead of gliding there over the 1s `transition: left/top` of `.c_move`.
 * The slide animation is meant for real state changes (reveal, new round,
 * card played) and has to stay intact there.
 *
 * Card positions depend on the viewport width (the horizontal margin is
 * recomputed from body.clientWidth), so changing the width reliably moves the
 * cards. We resize, then well within the 1s transition window check that the
 * card has already reached its new target left (no glide). Without the fix the
 * card would still be interpolating towards the target at that point.
 */
test('cards jump to their new position on resize without a 1s slide (B-39)', async ({ browser }) => {
  const { alice } = await teamWithTwoPlayers(browser, 'ResizeNoAnim');

  const card = tableCard(alice, 'Alice');
  await expect(card).toBeVisible();
  // Bob joining pushed a refresh, so the slide animation class is active.
  await expect(card).toHaveClass(/c_move/);

  const px = (v: string) => parseFloat(v);
  const readLeft = () =>
    card.evaluate((el) => ({
      computed: getComputedStyle(el as HTMLElement).left, // currently rendered (animated) value
      target: (el as HTMLElement).style.left,             // target set inline on resize
    }));

  // Settle at the start width and record the current target.
  const before = await readLeft();
  expect(Math.abs(px(before.computed) - px(before.target))).toBeLessThan(2);

  // Resize: this fires `resize`, recomputes the margin and sets a new target left.
  await alice.setViewportSize({ width: 1600, height: 900 });

  // Wait clearly less than the 1s transition. With the fix the card is already
  // at its new target; with the slide it would still be far away.
  await alice.waitForTimeout(250);

  const after = await readLeft();

  // The target really moved (otherwise the test would be vacuous).
  expect(Math.abs(px(after.target) - px(before.target))).toBeGreaterThan(50);
  // ...and the card is already there: it jumped, it did not glide.
  expect(Math.abs(px(after.computed) - px(after.target))).toBeLessThan(5);
});
