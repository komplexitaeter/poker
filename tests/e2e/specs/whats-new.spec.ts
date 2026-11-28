import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-164: "What's new" – release notes behind a line on top of the feedback panel, in a full-screen dialog.
 * The red dot of the feedback menu also marks a release the browser has not opened yet, but only for returning
 * people (a stored NOTES_SEEN, or a UID from before the feature); new people get the current release as seen.
 */

const NOTES_KEY = 'NOTES_SEEN';

async function latestRelease(page: Page): Promise<string> {
  const response = await page.request.get('/release_notes.json');
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  return json.releases[0].number as string;
}

/** opens the feedback panel, which clears the B-57 dot of a new user (a server flag), so only the notes dot is left */
async function openFeedback(page: Page) {
  const sent = page.waitForResponse(r => r.url().includes('hide_teaser=1'));
  await page.locator('#feedback_btn').click();
  await expect(page.locator('#wn_open')).toBeVisible();
  await sent;
}

test('a new person gets no dot; the latest release counts as seen', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const url = await createTeam(alice, 'Notes New');
  await joinAsPlayer(alice, url, 'Alice');
  const latest = await latestRelease(alice);

  await openFeedback(alice);
  await expect(alice.locator('#wn_open')).toHaveText(new RegExp(`What's new in ${latest.replace(/\./g, '\\.')}`));
  await expect(alice.locator('#wn_open')).not.toHaveClass(/\bis-new\b/);
  await expect(alice.locator('body')).not.toHaveClass(/\bfb-new\b/);
  await expect(alice.locator('#feedback_btn')).toHaveAttribute('aria-label', 'Feedback');
  expect(await alice.evaluate(k => localStorage.getItem(k), NOTES_KEY)).toBe(latest);
});

test('returning people see the dot until they open the notes; Escape closes, the focus goes back', async ({ browser }) => {
  const bob = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const url = await createTeam(bob, 'Notes Back');
  await joinAsPlayer(bob, url, 'Bob');
  const latest = await latestRelease(bob);
  await openFeedback(bob); // B-57 dot gone for good

  // a browser that saw an older release
  await bob.evaluate(k => localStorage.setItem(k, '2026.3.1'), NOTES_KEY);
  await bob.reload();
  await expect(bob.locator('body')).toHaveClass(/\bfb-new\b/);
  await expect(bob.locator('#feedback_btn')).toHaveAttribute('aria-label', 'Feedback – new');

  // opening the feedback panel alone does not clear it; the line in the panel carries the dot
  await bob.locator('#feedback_btn').click();
  const entry = bob.locator('#wn_open');
  await expect(entry).toHaveClass(/\bis-new\b/);
  await expect(bob.locator('body')).toHaveClass(/\bfb-new\b/);

  await entry.click();
  const dialog = bob.locator('#whats_new');
  await expect(dialog).toBeVisible();
  await expect(bob.locator('#wn_close')).toBeFocused();
  await expect(dialog.locator('.wn-rel-h').first()).toContainText(latest);
  await expect(dialog.locator('.wn-rel').first().locator('.wn-item').first()).toContainText('Find it in:');
  await expect(bob.locator('body')).not.toHaveClass(/\bfb-new\b/);
  await expect(entry).not.toHaveClass(/\bis-new\b/);
  expect(await bob.evaluate(k => localStorage.getItem(k), NOTES_KEY)).toBe(latest);

  // a modal dialog: Tab stays inside (only "Close" can take the focus)
  await bob.keyboard.press('Tab');
  expect(await bob.evaluate(() => !!document.activeElement?.closest('#whats_new') || document.activeElement === document.body)).toBe(true);

  await bob.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(entry).toBeFocused();
  await expect(bob.locator('#menu')).toBeVisible(); // the panel behind stays open

  await bob.reload();
  await expect(bob.locator('#team_name')).toHaveText('Notes Back');
  await expect(bob.locator('body')).not.toHaveClass(/\bfb-new\b/);
});

test('a UID from before the feature (no NOTES_SEEN yet) counts as returning', async ({ browser }) => {
  const cara = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const url = await createTeam(cara, 'Notes Legacy');
  await joinAsPlayer(cara, url, 'Cara');
  await openFeedback(cara);
  await cara.evaluate(k => localStorage.removeItem(k), NOTES_KEY);
  await cara.reload();
  await expect(cara.locator('#team_name')).toHaveText('Notes Legacy');
  await expect(cara.locator('body')).toHaveClass(/\bfb-new\b/);
});

test('the version in whats_new.js is the first release of release_notes.json', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Notes Version');
  await joinAsPlayer(page, url, 'Dan');
  expect(await page.evaluate('NOTES_LATEST')).toBe(await latestRelease(page)); // a global const (classic script)
});

test('screenshots follow the colour mode of the app', async ({ browser }) => {
  const eve = await newPlayer(browser, { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  const url = await createTeam(eve, 'Notes Mode');
  await joinAsPlayer(eve, url, 'Eve');
  await openFeedback(eve);
  await eve.locator('#wn_open').click();
  const img = eve.locator('#wn_list img.wn-img').first();
  await expect(img).toHaveAttribute('src', /-dark\.webp$/);
  await expect(img).toHaveAttribute('loading', 'lazy');
  expect(await img.getAttribute('alt')).toBeTruthy();
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  // the mode switches while the notes are open (as the header switch or another tab would)
  await eve.evaluate(() => (window as any).switchColorMode());
  await expect(img).toHaveAttribute('src', /-light\.webp$/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  await eve.locator('#wn_close').click();
  await expect(eve.locator('#whats_new')).toBeHidden();
  await expect(eve.locator('#wn_open')).toBeFocused();
});

test('phones: the notes open from the menu and nothing runs out of the screen', async ({ browser }) => {
  const fay = await newPlayer(browser, { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  const url = await createTeam(fay, 'Notes Phone');
  await joinAsPlayer(fay, url, 'Fay');

  await fay.locator('#menu_btn').click();
  await fay.locator('#menu_index [data-open="feedback"]').click();
  await fay.locator('#wn_open').click();
  const dialog = fay.locator('#whats_new');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.wn-rel').first()).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(375);
  const overflow = await dialog.evaluate(d => d.scrollWidth - d.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // every image and heading fits the width
  const widest = await dialog.evaluate(d => Math.max(...Array.from(d.querySelectorAll('.wn-img, .wn-rel-h, .wn-item'))
    .map(e => e.getBoundingClientRect().right)));
  expect(widest).toBeLessThanOrEqual(375);
  const close = fay.locator('#wn_close');
  const closeBox = await close.boundingBox();
  expect(closeBox!.height).toBeGreaterThanOrEqual(44); // touch target

  await close.click();
  await expect(dialog).toBeHidden();
  await expect(fay.locator('#menu')).toBeVisible();
});

test('items people asked for carry the "From your feedback" chip, the others do not', async ({ browser }) => {
  const gil = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const url = await createTeam(gil, 'Notes Asked');
  await joinAsPlayer(gil, url, 'Gil');
  const response = await gil.request.get('/release_notes.json');
  const items = (await response.json()).releases.flatMap((r: any) => r.items);
  const asked = items.find((i: any) => i.asked === true);
  const plain = items.find((i: any) => i.asked !== true && i.text !== '');
  expect(asked && plain).toBeTruthy();

  await openFeedback(gil);
  await gil.locator('#wn_open').click();
  const list = gil.locator('#wn_list');
  await expect(list.locator('.wn-asked')).toHaveCount(items.filter((i: any) => i.asked === true).length);
  const withChip = list.locator('.wn-item').filter({ has: gil.locator('.wn-item-t', { hasText: asked.title }) });
  await expect(withChip.locator('.wn-asked')).toHaveText('From your feedback');
  await expect(withChip.locator('.wn-asked svg')).toHaveAttribute('aria-hidden', 'true');
  const without = list.locator('.wn-item').filter({ has: gil.locator('.wn-item-t', { hasText: plain.title }) });
  await expect(without.locator('.wn-asked')).toHaveCount(0);

  // desktop light, for the review: the first item with the chip
  if (process.env.NOTES_BADGE_SHOT) {
    await gil.evaluate(() => { if (!document.documentElement.classList.contains('pk-light')) (window as any).switchColorMode(); });
    await withChip.scrollIntoViewIfNeeded();
    await withChip.screenshot({ path: process.env.NOTES_BADGE_SHOT });
  }
});
