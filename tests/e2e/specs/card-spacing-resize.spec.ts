import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, expectTableCard, pickCard } from './helpers';

/**
 * B-41: While the window is resized, the horizontal distance between neighbouring cards of the same
 * row must stay constant (the cards jump to their new place, nothing glides).
 *
 * Root cause on the old layout (absolute positioning + `.c_move` transition, B-39's `no-anim` class):
 * `no-anim` was removed two animation frames after a resize. During a real drag the next resize
 * arrives exactly in that frame, so the new left/top was applied in the same frame the class went
 * away and the 1s left/top transition started anyway. When the drag paused for a moment, the cards
 * glided - a card wrapping into another row slid diagonally across its neighbours.
 *
 * The test therefore resizes like a mouse drag: per width step a few 1px resizes in consecutive
 * frames, then a short pause (as when the mouse slows down), then it measures. Rows are grouped by
 * the card's rendered top (within half a card height), so a card that is still on its way to another
 * row counts as part of the row it is visually in.
 */
function measureNeighbourDistances(page: Page) {
  return page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('#cbox .c')).map(c => c.getBoundingClientRect());
    const rows: { top: number; lefts: number[] }[] = [];
    rects.forEach(r => {
      const row = rows.find(x => Math.abs(x.top - r.top) < r.height / 2);
      if (row) row.lefts.push(r.left);
      else rows.push({ top: r.top, lefts: [r.left] });
    });
    const distances: number[] = [];
    rows.forEach(({ lefts }) => {
      lefts.sort((a, b) => a - b);
      for (let i = 1; i < lefts.length; i++) distances.push(lefts[i] - lefts[i - 1]);
    });
    return { distances, rows: rows.length };
  });
}

test('distance between neighbouring cards stays constant while resizing (B-41)', async ({ browser }) => {
  test.setTimeout(90_000);
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Spacing Team');
  await joinAsPlayer(alice, url, 'Alice');
  // 21 cards: 2 rows at 1500px, 4 rows at 650px, so the sweep crosses several wrap points
  await addPlayersViaApi(alice, url, Array.from({ length: 20 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`));
  await alice.reload();
  await expect(alice.locator('#cbox .c')).toHaveCount(21);
  // one more state change after loading, as in a running session
  await pickCard(alice, 'three01');
  await expectTableCard(alice, 'Alice', 'done001');
  await alice.waitForTimeout(1500); // initial fade-in/glides are over

  const deviations: string[] = [];
  let reference: number | null = null;
  let maxRows = 0;
  // 1499 -> 649px in 10px steps, crosses the display type thresholds 1199/991/800 as well. The old
  // layout wrapped at multiples of 110px; ending each step on 110n-1 makes every wrap happen in the
  // last resize of a step, which is the one that glided.
  for (let width = 1499; width >= 649; width -= 10) {
    for (const w of [width + 3, width + 2, width + 1, width]) {
      await alice.setViewportSize({ width: w, height: 900 });
    }
    await alice.waitForTimeout(80);
    const { distances, rows } = await measureNeighbourDistances(alice);
    maxRows = Math.max(maxRows, rows);
    for (const d of distances) {
      reference ??= d;
      if (Math.abs(d - reference) > 1) deviations.push(`${width}px: ${d.toFixed(1)}px`);
    }
  }

  expect(maxRows).toBeGreaterThan(2); // the sweep really covered several rows
  expect(deviations, `distance should stay at ${reference}px`).toEqual([]);
});
