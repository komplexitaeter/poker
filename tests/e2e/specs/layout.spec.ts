import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, pickCard, teamWithTwoPlayers, openTimerPanel, setTimer, deckCards, setTeamDeck } from './helpers';

/**
 * B-46: The board is one screen-high grid. Only the table scrolls, the deck stays at the bottom.
 * B-68: large screens (from 800px) have a column on the right: round status, topic, spread and at its
 * foot New Round and the timer, next to the deck (side-column.spec.ts); on phones the spread and
 * the round actions sit in a strip right above the deck (the spread only once revealed, no status line).
 * On phones the topic is a one-line strip that unfolds with its arrow button.
 * Copy Link and the own timer switch (B-67: in the timer panel) confirm with a toast from the bottom edge (showToast);
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

    // deck at the bottom edge, New Round visible next to it (large screens, B-66) or above it
    // (phones, stuck to the bottom of the table); polled, the heights settle only after their animations
    // (B-68: from 800px the deck is a tray floating a little above the bottom edge)
    await expect.poll(async () => {
      const deck = (await alice.locator('#down-container').boundingBox())!;
      const gap = viewport.height - Math.round(deck.y + deck.height);
      return viewport.width >= 800 ? gap >= 0 && gap <= 24 : gap === 0;
    }).toBe(true);
    await expect(alice.locator('#newroundbtn')).toBeVisible();
    await expect.poll(async () => {
      const deck = (await alice.locator('#ctl').boundingBox())!;
      const btn = (await alice.locator('#newroundbtn').boundingBox())!;
      if (viewport.width >= 800) {
        return btn.x >= deck.x + deck.width - 1 && btn.x + btn.width <= viewport.width
          && btn.y + btn.height <= viewport.height;
      }
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

test('large screen: topic in the column, New Round at its foot next to the deck (B-46, B-66, B-68)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1100, height: 800 } });
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

  // a long topic: in the column below the round status, its height is capped
  const t = new URL(url).searchParams.get('t')!;
  const topic = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}`).join('\n\n');
  await alice.request.post(`/api/update_topic.php?t=${encodeURIComponent(t)}`, { form: { topic } });
  await alice.reload();
  const bar = (await alice.locator('.topic-bar').boundingBox())!;
  const head = (await alice.locator('header.head').boundingBox())!;
  const table = (await alice.locator('#table').boundingBox())!;
  const status = (await alice.locator('#round_status').boundingBox())!;
  expect(Math.round(bar.y)).toBe(Math.round(status.y + status.height));
  expect(Math.round(bar.x + bar.width)).toBe(1100);
  expect(bar.x).toBeGreaterThanOrEqual(table.x + table.width - 1);
  expect(Math.round(table.y)).toBe(Math.round(head.y + head.height));
  expect(bar.height).toBeLessThanOrEqual(800 * 0.4 + 80); // topic up to 40vh, label and padding
  expect(await alice.locator('#topic').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(topicBar).toBeVisible();
  await expect(alice.locator('.topic-edit')).toBeVisible();
  // the pen in the bar opens the topic in the menu as well
  await alice.locator('.topic-edit').click();
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(alice.locator('#topic_txt')).toHaveValue(topic);
  await alice.keyboard.press('Escape');

  // B-66/B-68: New Round sits at the foot of the column, right of the deck, within its height
  await pickCard(alice, 'three01');
  await expect(alice.locator('#newroundbtn')).toBeEnabled();
  const deck = (await alice.locator('#ctl').boundingBox())!;
  const btn = (await alice.locator('#newroundbtn').boundingBox())!;
  expect(btn.x).toBeGreaterThanOrEqual(deck.x + deck.width);
  expect(1100 - (btn.x + btn.width)).toBeLessThan(40);
  expect(btn.y).toBeGreaterThanOrEqual(deck.y);
  expect(btn.y + btn.height).toBeLessThanOrEqual(deck.y + deck.height);

  // no hover hints in the header
  expect(await alice.locator('[data-hint]').count()).toBe(0);
  await alice.context().close();
});

test('timer switch: a toast for the own click only (B-46, B-67)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Layout Timer Toast');
  const aliceToast = alice.locator('#toast');
  const bobToast = bob.locator('#toast');

  await openTimerPanel(alice);
  await alice.locator('input[name=tmr_visibility][value="1"]').check();
  await expect(aliceToast).toHaveClass(/toast-on/);
  await expect(aliceToast).toHaveText('Timer on \u2013 everyone on the board sees it');
  // Bob sees the timer, but no toast
  await expect(bob.locator('#timer')).toBeVisible();
  await expect(bobToast).not.toHaveClass(/toast-on/);

  await alice.locator('input[name=tmr_visibility][value="0"]').check();
  await expect(aliceToast).toHaveText('Timer off');
  await expect(bob.locator('#timer')).toBeHidden();
  await expect(bobToast).not.toHaveClass(/toast-on/);
  await alice.context().close();
  await bob.context().close();
});

test('round button always there; many deck cards in a narrow window: the deck scrolls, the corner stays (B-67, B-68)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1440, height: 900 } });
  const url = await createTeam(alice, 'Layout Corner');
  // Fibonacci Classic plus coffee, ? and ! (15 cards)
  await setTeamDeck(alice, url, 'fib-classic', null, ['break01', 'qstmrk1', 'xclam01']);
  await addPlayersViaApi(alice, url, ['Bob']);
  await joinAsPlayer(alice, url, 'Alice');
  await alice.reload();
  await expect(deckCards(alice)).toHaveCount(15);

  // before the first card: there, but disabled (Andreas)
  const btn = alice.locator('#newroundbtn');
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveValue('Cancel Round');

  // the header buttons keep their place when the timer (green dot) is switched on
  const boardBtnX = async () => (await alice.locator('#cset_btn').boundingBox())!.x;
  const before = await boardBtnX();
  await setTimer(alice, true);
  expect(await boardBtnX()).toBe(before);
  await pickCard(alice, 'three01');
  await expect(btn).toBeEnabled();

  const box = async (sel: string) => (await alice.locator(sel).boundingBox())!;
  // B-68: from 800px always the corner on the right edge; the deck's cards shrink to fit, it does
  // not scroll (15 cards at 900px)
  for (const width of [1440, 1100, 900]) {
    await alice.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const deck = await box('#ctl');
      const dock = await box('.dock');
      return dock.x >= deck.x + deck.width - 0.5 && Math.abs(dock.x + dock.width - width) < 1;
    }, { message: `width ${width}` }).toBe(true);
    // the timer above the button
    const timer = await box('#timer');
    const b = await box('#newroundbtn');
    expect(timer.y + timer.height).toBeLessThanOrEqual(b.y);
  }
  expect(await alice.locator('#ctl').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await alice.context().close();
});
