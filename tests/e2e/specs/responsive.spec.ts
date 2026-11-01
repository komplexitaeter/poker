import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, tableCard, addPlayersViaApi } from './helpers';

/**
 * B-36: The layout switches purely by CSS media queries at 800 px (style/style.css,
 * max-width: 799.98px / min-width: 800px). No element carries the former JS classes
 * mobile/desktop/sizefit any more. The analytics display type (xs/m/md/lg) is still sent.
 * B-46: New Round is no longer part of the burger menu: below the cards on large screens, in a
 * dock above the deck on phones.
 * B-51: phones have a menu button (#menu_btn) that opens the menu index as a bottom sheet;
 * large screens show the header shortcuts instead.
 */
const SMALL = { width: 375, height: 800 };
const LARGE = { width: 1280, height: 900 };

/** Collects the display_type of every measure_event.php call per event code. */
function recordDisplayTypes(page: Page): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  page.on('request', request => {
    if (!request.url().includes('/api/measure_event.php')) return;
    const params = new URL(request.url()).searchParams;
    const code = params.get('event_code') ?? '';
    seen.set(code, [...(seen.get(code) ?? []), params.get('display_type') ?? '']);
  });
  return seen;
}

/** Alice joins with a waiting second player and picks a card: the round stays open, New Round shows. */
async function aliceInOpenRound(page: Page, teamName: string) {
  const url = await createTeam(page, teamName);
  await addPlayersViaApi(page, url, ['Bob']);
  await joinAsPlayer(page, url, 'Alice');
  await pickCard(page, 'three01');
}

const legacyClassCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.mobile, .desktop, .sizefit').length);

const burger = (page: Page) => page.locator('#menu_btn');
const closeMenu = (page: Page) => page.locator('#menu_close');

async function expectSmallLayout(page: Page) {
  await expect(burger(page)).toBeVisible();
  await expect(page.locator('#topic_btn')).toBeHidden();
  await expect(page.locator('#cset_btn')).toBeHidden();
  await expect(page.locator('#newroundbtn')).toBeVisible(); // B-46: in the dock, not in the menu
  // B-49: two players fit easily, so the cards get the phone maximum (--card-max, 110px below 800px)
  await expect.poll(async () => (await tableCard(page, 'Alice').boundingBox())?.width).toBe(110);
}

async function expectLargeLayout(page: Page) {
  await expect(burger(page)).toBeHidden();
  await expect(page.locator('#topic_btn')).toBeVisible();
  await expect(page.locator('#cset_btn')).toBeVisible();
  await expect(page.locator('#newroundbtn')).toBeVisible();
  await expect(page.locator('#ctl img.on').first()).toHaveCSS('width', '45px');
  // B-49: two players on a large table: the cards use the room up to --card-max (150px)
  await expect.poll(async () => (await tableCard(page, 'Alice').boundingBox())?.width).toBe(150);
}

test('small screen: burger menu holds the topnav, New Round stays in the dock (B-36, B-46)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: SMALL });
  const displayTypes = recordDisplayTypes(alice);
  await aliceInOpenRound(alice, 'RespSmall');

  await expectSmallLayout(alice);

  // New Round sits in the dock right above the deck
  const dock = await alice.locator('#newroundbtn').boundingBox();
  const deck = await alice.locator('#ctl').boundingBox();
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(deck!.y + 1);

  // open the menu: the index with all sections appears
  await burger(alice).click();
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  const index = alice.locator('#menu_index');
  await expect(index).toBeVisible();
  // B-67 (Andreas): timer before board, as in the header
  await expect(index.locator('.m-index b')).toHaveText(['Topic', 'Timer', 'Board settings', 'You', 'Feedback']);

  // close it again
  await closeMenu(alice).click();
  await expect(alice.locator('dialog#menu')).not.toHaveAttribute('open');
  await expect(index).toBeHidden();
  await expect(alice.locator('#newroundbtn')).toBeVisible();

  expect(await legacyClassCount(alice)).toBe(0);
  await expect.poll(() => displayTypes.get('INIT_ON_LOAD')).toEqual(['xs']);
  await expect.poll(() => displayTypes.get('BOARD_ON_LOAD')?.[0]).toBe('xs');
});

test('large screen: topnav in place, no burger (B-36)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: LARGE });
  const displayTypes = recordDisplayTypes(alice);
  await aliceInOpenRound(alice, 'RespLarge');

  await expectLargeLayout(alice);
  expect(await legacyClassCount(alice)).toBe(0);
  await expect.poll(() => displayTypes.get('INIT_ON_LOAD')).toEqual(['lg']);
  await expect.poll(() => displayTypes.get('BOARD_ON_LOAD')?.[0]).toBe('lg');
});

test('resizing switches the layout and display type without a reload (B-36)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: LARGE });
  const displayTypes = recordDisplayTypes(alice);
  await aliceInOpenRound(alice, 'RespSwitch');
  await expectLargeLayout(alice);

  // no reload in between: a marker on window survives
  await alice.evaluate(() => { (window as any).__noReload = true; });

  await alice.setViewportSize(SMALL);
  await expectSmallLayout(alice);
  // an analytics event now reports the small display type (phones: "Appearance" in "You")
  await burger(alice).click();
  await alice.locator('#menu_index').getByRole('button', { name: /^You/ }).click();
  await alice.locator('input[name=cet_color_mode][value=light]').check();
  await expect.poll(() => displayTypes.get('USE_COLOR_SWITCH')).toEqual(['xs']);
  await closeMenu(alice).click();

  await alice.setViewportSize(LARGE);
  await expectLargeLayout(alice);
  await alice.locator('#cmode_btn').click();
  await expect.poll(() => displayTypes.get('USE_COLOR_SWITCH')).toEqual(['xs', 'lg']);

  expect(await alice.evaluate(() => (window as any).__noReload)).toBe(true);
  expect(await legacyClassCount(alice)).toBe(0);
});

test('start page on a small screen shows logo, color switch and feedback (B-36)', async ({ browser }) => {
  const page = await newPlayer(browser, { viewport: SMALL });
  await page.goto('/');
  await expect(page.locator('#brand')).toBeVisible();
  await expect(page.locator('#cmode_btn')).toBeVisible();
  await expect(page.locator('#feedback_btn')).toBeVisible();
  await expect(page.locator('#teaminput')).toBeVisible();
  expect(await legacyClassCount(page)).toBe(0);
});

test('touch tablet: delete icon visible without hover (B-36)', async ({ browser }) => {
  const viewport = { width: 1024, height: 768 };
  const alice = await newPlayer(browser, { viewport, hasTouch: true });
  const url = await createTeam(alice, 'RespTouch');
  await joinAsPlayer(alice, url, 'Alice');
  await expect(tableCard(alice, 'Alice').locator('.delete')).toBeVisible();

  // a mouse device of the same size shows it on hover only
  const bob = await newPlayer(browser, { viewport });
  await joinAsPlayer(bob, url, 'Bob');
  await expect(tableCard(bob, 'Alice')).toBeVisible();
  await bob.mouse.move(0, 0);
  await expect(tableCard(bob, 'Alice').locator('.delete')).toBeHidden();
  await tableCard(bob, 'Alice').hover();
  await expect(tableCard(bob, 'Alice').locator('.delete')).toBeVisible();
});
