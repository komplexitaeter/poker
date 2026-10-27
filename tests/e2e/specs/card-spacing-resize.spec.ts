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
 *
 * B-49: the card size follows the table ("fit to table"), so the distance is no longer a fixed number
 * of pixels: it stays at 110% of the card width (the gap is 10% of the card). A card that still glides
 * or scales would show a different distance or width than its neighbours.
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
    const widths = rects.map(r => r.width);
    return { distances, widths, rows: rows.length };
  });
}

test('distance between neighbouring cards stays constant while resizing (B-41)', async ({ browser }) => {
  test.setTimeout(90_000);
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Spacing Team');
  await joinAsPlayer(alice, url, 'Alice');
  // 21 cards: the sweep crosses several wrap points and card sizes (B-49: fit to table)
  await addPlayersViaApi(alice, url, Array.from({ length: 20 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`));
  await alice.reload();
  await expect(alice.locator('#cbox .c')).toHaveCount(21);
  // one more state change after loading, as in a running session
  await pickCard(alice, 'three01');
  await expectTableCard(alice, 'Alice', 'done001');
  await alice.waitForTimeout(1500); // initial fade-in/glides are over

  const deviations: string[] = [];
  const cardWidths = new Set<number>();
  let maxRows = 0;
  // 1499 -> 649px in 10px steps, crosses the display type thresholds 1199/991/800 as well. The old
  // layout wrapped at multiples of 110px; ending each step on 110n-1 makes every wrap happen in the
  // last resize of a step, which is the one that glided.
  for (let width = 1499; width >= 649; width -= 10) {
    for (const w of [width + 3, width + 2, width + 1, width]) {
      await alice.setViewportSize({ width: w, height: 900 });
    }
    await alice.waitForTimeout(80);
    const { distances, widths, rows } = await measureNeighbourDistances(alice);
    maxRows = Math.max(maxRows, rows);
    // all cards have the same size (none is still scaling) ...
    const cardWidth = widths[0];
    cardWidths.add(Math.round(cardWidth));
    for (const w of widths) {
      if (Math.abs(w - cardWidth) > 0.5) deviations.push(`${width}px: card ${w.toFixed(1)}px wide, not ${cardWidth.toFixed(1)}px`);
    }
    // ... and stand 110% of their width apart (none is still gliding)
    for (const d of distances) {
      if (Math.abs(d - 1.1 * cardWidth) > 1) deviations.push(`${width}px: ${d.toFixed(1)}px apart at ${cardWidth.toFixed(1)}px`);
    }
  }

  expect(maxRows).toBeGreaterThan(2); // the sweep really covered several rows
  expect(cardWidths.size).toBeGreaterThan(1); // ... and several card sizes
  expect(deviations).toEqual([]);
});
