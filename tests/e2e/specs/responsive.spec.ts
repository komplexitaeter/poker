import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, tableCard, addPlayersViaApi } from './helpers';

/**
 * B-36: The layout switches purely by CSS media queries at 800 px (style/style.css,
 * max-width: 799.98px / min-width: 800px). No element carries the former JS classes
 * mobile/desktop/sizefit any more. The analytics display type (xs/m/md/lg) is still sent.
 * B-46: New Round has its own zone on every screen size (round panel on large screens, dock above
 * the deck on phones), it is no longer part of the burger menu.
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
  await expect(page.locator('#ctl')).not.toHaveClass(/show_card_stats/);
}

const legacyClassCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.mobile, .desktop, .sizefit').length);

const burger = (page: Page) => page.locator('#mobile-menu .open_menu');
const closeMenu = (page: Page) => page.locator('#mobile-menu .close-menu');

async function expectSmallLayout(page: Page) {
  await expect(burger(page)).toBeVisible();
  await expect(page.locator('#topic_btn')).toBeHidden();
  await expect(page.locator('#cset_btn')).toBeHidden();
  await expect(page.locator('#newroundbtn')).toBeVisible(); // B-46: in the dock, not in the menu
  await expect.poll(async () => (await tableCard(page, 'Alice').boundingBox())?.width).toBe(100);
}

async function expectLargeLayout(page: Page) {
  await expect(burger(page)).toBeHidden();
  await expect(page.locator('#topic_btn')).toBeVisible();
  await expect(page.locator('#cset_btn')).toBeVisible();
  await expect(page.locator('#newroundbtn')).toBeVisible();
  await expect(page.locator('#ctl')).toHaveCSS('height', '90px');
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

  // open the menu: the topnav buttons appear
  await burger(alice).click();
  await expect(alice.locator('#mobile-menu')).toHaveAttribute('data-state', 'open');
  await expect(alice.locator('#topic_btn')).toBeVisible();
  await expect(alice.locator('#feedback_btn')).toBeVisible();

  // close it again
  await closeMenu(alice).click();
  await expect(alice.locator('#mobile-menu')).toHaveAttribute('data-state', 'closed');
  await expect(alice.locator('#topic_btn')).toBeHidden();
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
  // an analytics event now reports the small display type
  await burger(alice).click();
  await alice.locator('#cmode_btn').click();
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
