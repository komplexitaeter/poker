import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, pickCard } from './helpers';

/**
 * B-46: The board is one screen-high grid. Only the table scrolls, the deck stays at the bottom,
 * New Round sits in the round panel (large screens) or the dock above the deck (phones).
 * On phones the topic is a one-line strip that unfolds with its arrow button.
 * Copy Link confirms with a toast from the bottom edge (showToast).
 */
const SMALL = { width: 375, height: 667 };

test('only the table scrolls, deck and New Round stay in view (B-46)', async ({ browser }) => {
  for (const viewport of [{ width: 1280, height: 600 }, SMALL]) {
    const alice = await newPlayer(browser, { viewport });
    const url = await createTeam(alice, 'Layout Grid');
    await addPlayersViaApi(alice, url, Array.from({ length: 20 }, (_, i) => `P${i + 1}`));
    await joinAsPlayer(alice, url, 'Alice');
    await pickCard(alice, 'three01');
    await expect(alice.locator('#cbox .c')).toHaveCount(21);

    // the page itself does not scroll, the table does
    await expect.poll(() => alice.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight))
      .toBeLessThanOrEqual(0);
    const table = await alice.locator('#table').evaluate(el => el.scrollHeight - el.clientHeight);
    expect(table).toBeGreaterThan(0);

    // deck at the bottom edge, New Round visible above it
    const deck = (await alice.locator('#ctl').boundingBox())!;
    expect(Math.round(deck.y + deck.height)).toBe(viewport.height);
    await expect(alice.locator('#newroundbtn')).toBeVisible();
    const btn = (await alice.locator('#newroundbtn').boundingBox())!;
    expect(btn.y + btn.height).toBeLessThanOrEqual(deck.y + 1);
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
  await alice.locator('#copy_link_btn').click();
  await expect(toast).toHaveClass(/toast-on/);
  await expect(toast).toHaveText('Board link copied');
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toBe(url);
  // inside the screen once it is up, then it drops back
  await expect.poll(async () => {
    const box = (await toast.boundingBox())!;
    return box.y + box.height <= 900;
  }).toBe(true);
  await expect(toast).not.toHaveClass(/toast-on/, { timeout: 5000 });
});
