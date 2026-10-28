import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, pickCard, teamWithTwoPlayers } from './helpers';

/**
 * B-46: The board is one screen-high grid. Only the table scrolls, the deck stays at the bottom.
 * The topic is a full-width bar between header and table (step 2b: no round panel on the right).
 * New Round and the stopwatch follow the cards and stick to the bottom of the table when it
 * scrolls (large screens); on phones they sit in a dock right above the deck.
 * On phones the topic is a one-line strip that unfolds with its arrow button.
 * Copy Link and the own stopwatch switch confirm with a toast from the bottom edge (showToast);
 * the header has no hover hints any more.
 * B-51: without a topic there is no topic bar at all (the topic is set in the menu).
 */
const SMALL = { width: 375, height: 667 };

test('only the table scrolls, deck and New Round stay in view (B-46)', async ({ browser }) => {
  for (const viewport of [{ width: 1280, height: 600 }, SMALL]) {
    const alice = await newPlayer(browser, { viewport });
    const url = await createTeam(alice, 'Layout Grid');
    // B-51: without a topic bar the table has more room, so enough players that it surely overflows;
    // B-49: the cards shrink to fit the table down to --card-min (64px), so even more of them
    await addPlayersViaApi(alice, url, Array.from({ length: 69 }, (_, i) => `P${i + 1}`));
    await joinAsPlayer(alice, url, 'Alice');
    await pickCard(alice, 'three01');
    await expect(alice.locator('#cbox .c')).toHaveCount(70);
    await expect(alice.locator('.topic-bar')).toBeHidden();

    // the page itself does not scroll, the table does
    await expect.poll(() => alice.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight))
      .toBeLessThanOrEqual(0);
    // poll: #cbox grows with its height animation (B-41), so the table overflows only after it ends
    await expect.poll(() => alice.locator('#table').evaluate(el => el.scrollHeight - el.clientHeight))
      .toBeGreaterThan(0);

    // deck at the bottom edge, New Round visible above it (stuck to the bottom of the table);
    // polled, the heights settle only after their animations
    await expect.poll(async () => {
      const deck = (await alice.locator('#ctl').boundingBox())!;
      return Math.round(deck.y + deck.height);
    }).toBe(viewport.height);
    await expect(alice.locator('#newroundbtn')).toBeVisible();
    await expect.poll(async () => {
      const deck = (await alice.locator('#ctl').boundingBox())!;
      const btn = (await alice.locator('#newroundbtn').boundingBox())!;
      return btn.y + btn.height <= deck.y + 1;
    }).toBe(true);
    await alice.context().close();
  }
});

test('phone: the topic strip shows one line and unfolds with its button (B-46)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: SMALL });
  const url = await createTeam(alice, 'Layout Topic');
  await joinAsPlayer(alice, url, 'Alice');
  const t = new URL(url).searchParams.get('t')!;
  const topic = 'First line of a long topic that does not fit\n\nsecond paragraph\n\nthird paragraph';
  await alice.request.post(`/api/update_topic.php?t=${encodeURIComponent(t)}`, { form: { topic } });
  await alice.reload();

  const strip = alice.locator('#topic');
  const toggle = alice.locator('#topic_toggle');
  await expect(strip).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const collapsed = (await strip.boundingBox())!.height;

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await strip.boundingBox())!.height).toBeGreaterThan(collapsed * 2);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await strip.boundingBox())!.height).toBe(collapsed);
});

test('Copy Link shows a toast instead of growing the button', async ({ browser }) => {
  const alice = await newPlayer(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  const url = await createTeam(alice, 'Layout Toast');
  await joinAsPlayer(alice, url, 'Alice');

  const toast = alice.locator('#toast');
  await expect(toast).not.toHaveClass(/toast-on/);
  // the toast is up for 2.2 s only: watch it inside the page (every frame) instead of polling from the test,
  // which can miss the window on a slow runner. Resolves true once it is fully inside the screen.
  const rose = alice.evaluate(() => new Promise<boolean>((resolve) => {
    const el = document.getElementById('toast')!;
    const start = performance.now();
    let seenOn = false;
    const check = () => {
      const on = el.classList.contains('toast-on');
      seenOn = seenOn || on;
      if (on && el.getBoundingClientRect().bottom <= window.innerHeight) return resolve(true);
      if ((seenOn && !on) || performance.now() - start > 5000) return resolve(false);
      requestAnimationFrame(check);
    };
    check();
  }));
  await alice.locator('#copy_link_btn').click();
  // inside the screen once it is up, then it drops back
  expect(await rose).toBe(true);
  await expect(toast).toHaveText('Board link copied');
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await expect(toast).not.toHaveClass(/toast-on/, { timeout: 5000 });
});

test('large screen: topic bar above the table, New Round right below the cards (B-46)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 800 } });
  const url = await createTeam(alice, 'Layout Topic Bar');
  await addPlayersViaApi(alice, url, ['Bob']);
  await joinAsPlayer(alice, url, 'Alice');

  // no topic: no topic bar at all, the table starts right below the header (B-51);
  // the topic is set from the header button
  const topicBar = alice.locator('.topic-bar');
  await expect(topicBar).toBeHidden();
  await expect(alice.locator('.topic-edit')).toBeHidden();
  expect(Math.round((await alice.locator('#table').boundingBox())!.y))
    .toBe(Math.round((await alice.locator('header.head').boundingBox())!.y + (await alice.locator('header.head').boundingBox())!.height));
  await alice.locator('#topic_btn').click();
  await expect(alice.locator('#topic_box')).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(alice.locator('#topic_box')).toBeHidden();

  // a long topic: full width between header and table, its height is capped (the table keeps its room)
  const t = new URL(url).searchParams.get('t')!;
  const topic = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}`).join('\n\n');
  await alice.request.post(`/api/update_topic.php?t=${encodeURIComponent(t)}`, { form: { topic } });
  await alice.reload();
  const bar = (await alice.locator('.topic-bar').boundingBox())!;
  const head = (await alice.locator('header.head').boundingBox())!;
  const table = (await alice.locator('#table').boundingBox())!;
  expect(Math.round(bar.y)).toBe(Math.round(head.y + head.height));
  expect(bar.width).toBeGreaterThanOrEqual(1270);
  expect(Math.round(table.y)).toBe(Math.round(bar.y + bar.height));
  expect(bar.height).toBeLessThanOrEqual(800 * 0.25 + 16);
  expect(await alice.locator('#topic').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(topicBar).toBeVisible();
  await expect(alice.locator('.topic-edit')).toBeVisible();
  // the pen in the bar opens the topic in the menu as well
  await alice.locator('.topic-edit').click();
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(alice.locator('#topic_txt')).toHaveValue(topic);
  await alice.keyboard.press('Escape');

  // few cards: New Round sits right below them, not at the bottom of the screen
  await pickCard(alice, 'three01');
  await expect(alice.locator('#newroundbtn')).toBeVisible();
  const cbox = (await alice.locator('#cbox').boundingBox())!;
  const btn = (await alice.locator('#newroundbtn').boundingBox())!;
  expect(btn.y).toBeGreaterThanOrEqual(cbox.y + cbox.height - 1);
  expect(btn.y - (cbox.y + cbox.height)).toBeLessThan(40);

  // no hover hints in the header
  expect(await alice.locator('[data-hint]').count()).toBe(0);
  await alice.context().close();
});

test('stopwatch switch: a toast for the own click only (B-46)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Layout Stopwatch Toast');
  const aliceToast = alice.locator('#toast');
  const bobToast = bob.locator('#toast');

  await alice.locator('#stopwatch_btn').click();
  await expect(aliceToast).toHaveClass(/toast-on/);
  await expect(aliceToast).toHaveText('Stopwatch on \u2013 everyone on the board sees it');
  // Bob sees the stopwatch, but no toast
  await expect(bob.locator('#stopwatch')).toBeVisible();
  await expect(bob.locator('#stopwatch_btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(bobToast).not.toHaveClass(/toast-on/);

  await alice.locator('#stopwatch_btn').click();
  await expect(aliceToast).toHaveText('Stopwatch off');
  await expect(bob.locator('#stopwatch')).toBeHidden();
  await expect(bobToast).not.toHaveClass(/toast-on/);
  await alice.context().close();
  await bob.context().close();
});
