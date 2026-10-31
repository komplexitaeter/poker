import { test, Browser, BrowserContext, BrowserContextOptions, Page, Locator, expect } from '@playwright/test';

/**
 * Contexts from newPlayer() are not closed by Playwright, and most specs do not close them either. A worker
 * runs many tests with one browser, so it piled up dozens of live boards (WebSocket, pulls, CSS animations)
 * until every action of the late specs took seconds (B-67: timer.spec.ts timed out in CI with 60+ open
 * pages). The first newPlayer() of a test therefore closes the contexts left over from earlier tests.
 */
let playerContexts: { testId: string; context: BrowserContext }[] = [];

async function closeContextsOfEarlierTests(testId: string): Promise<void> {
  const old = playerContexts.filter(entry => entry.testId !== testId);
  playerContexts = playerContexts.filter(entry => entry.testId === testId);
  await Promise.all(old.map(entry => entry.context.close().catch(() => undefined)));
}

/**
 * Every third-party library the board needs (remarkable, qr-code-styling, js-confetti) is now
 * self-hosted under src/vendor/ and served same-origin by the test nginx, exactly as in production
 * (B-15). The tests therefore block all external hosts and keep only 127.0.0.1/localhost reachable.
 * This also covers production analytics (plausible.io), which must stay blocked.
 */
export async function newPlayer(browser: Browser, options: BrowserContextOptions = {}): Promise<Page> {
  const testId = test.info().testId;
  await closeContextsOfEarlierTests(testId);
  const context = await browser.newContext(options);
  playerContexts.push({ testId, context });
  await context.route(/^https?:\/\//, route => {
    const host = new URL(route.request().url()).hostname;
    if (host === '127.0.0.1' || host === 'localhost') return route.continue();
    return route.abort();
  });
  return context.newPage();
}

/** Creates a team via the start page and returns the board URL. */
export async function createTeam(page: Page, teamName: string): Promise<string> {
  await page.goto('/');
  await page.locator('#teaminput').fill(teamName);
  await page.locator('#teambtn').click();
  await page.waitForURL(/\?t=/);
  return page.url();
}

/** Opens the board and joins as a player. */
export async function joinAsPlayer(page: Page, boardUrl: string, name: string): Promise<void> {
  if (page.url() !== boardUrl) await page.goto(boardUrl);
  await expect(page.locator('#overlay_name_input')).toHaveClass(/visible/);
  await page.locator('#nameinput').fill(name);
  await page.locator('#become_player_btn').click();
  await expect(page.locator('#overlay_name_input')).toHaveClass(/hidden/);
}

/**
 * Adds players to a team straight through the API (no browser context per player), for tests
 * that need many cards on the table. The page showing the board has to reload afterwards.
 */
export async function addPlayersViaApi(page: Page, boardUrl: string, names: string[]): Promise<string[]> {
  const t = new URL(boardUrl).searchParams.get('t') ?? '';
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    const id = `E2EAPI${Date.now().toString(36)}${i}`.slice(0, 16).toUpperCase();
    const res = await page.request.post(
      `/api/name.php?id=${id}&type=player&name=${encodeURIComponent(name)}&t=${encodeURIComponent(t)}`);
    expect(res.ok()).toBeTruthy();
    ids.push(id);
  }
  return ids; // the player ids (e.g. for api/setc.php)
}

/** The card of a player on the table. */
export function tableCard(page: Page, playerName: string): Locator {
  return page.locator('#cbox .c').filter({
    has: page.locator('.card_player_name', { hasText: new RegExp(`^${playerName}$`) }),
  });
}

/** Expects the card shown for a player, e.g. 'prgrss1' (not chosen), 'done001' (chosen, hidden), 'three01'.
 * By its key (data-card), not by the way it is drawn (B-99). */
export async function expectTableCard(page: Page, playerName: string, displayCardKey: string): Promise<void> {
  await expect(tableCard(page, playerName)).toHaveAttribute('data-card', displayCardKey);
}

/** A card in the player's own deck (the tray only holds the cards of the team's deck, B-99). */
export function deckCard(page: Page, cardKey: string): Locator {
  return page.locator(`#ctl .ctl[data-card="${cardKey}"]`);
}

/** All cards in the player's own deck, in deck order. */
export function deckCards(page: Page): Locator {
  return page.locator('#ctl .ctl');
}

/** The picked card(s) in the player's own deck. */
export function selectedDeckCards(page: Page): Locator {
  return page.locator('#ctl .ctl.selected');
}

/** Picks a card from the player's own deck. */
export async function pickCard(page: Page, cardKey: string): Promise<void> {
  await deckCard(page, cardKey).click();
  await expect(deckCard(page, cardKey)).toHaveClass(/selected/);
}

/** Team with two joined players, Alice (creator) and Bob. */
export async function teamWithTwoPlayers(browser: Browser, teamName: string) {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, teamName);
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  return { alice, bob, url };
}

/** Login of stats.php (B-63), as written to the htpasswd file by setup.sh. */
export const STATS_USER = 'e2e-admin';
export const STATS_PASSWORD = 'e2e-secret';

/** Opens a page of stats.php and logs in through the form if it shows the login page. */
export async function gotoStats(page: Page, path = '/stats.php'): Promise<void> {
  await page.goto(path);
  const login = page.locator('form.login');
  if (await login.count() === 0) return;
  await login.locator('input[name=user]').fill(STATS_USER);
  await login.locator('input[name=password]').fill(STATS_PASSWORD);
  await login.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('form.logout')).toBeVisible();
}

/** B-67: opens the timer panel (large screens: the header button, phones: via the menu index). */
export async function openTimerPanel(page: Page): Promise<void> {
  if (await page.locator('#timer_btn').isVisible()) {
    await page.locator('#timer_btn').click();
  } else {
    await page.locator('#menu_btn').click();
    await page.locator('#menu_index [data-open="timer"]').click();
  }
  await expect(page.locator('#timer_box')).toBeVisible();
}

/** B-67: switches the timer on or off for the whole board in the timer panel and closes the menu again. */
export async function setTimer(page: Page, on: boolean): Promise<void> {
  await openTimerPanel(page);
  await page.locator(`input[name=tmr_visibility][value="${on ? 1 : 0}"]`).check();
  if (on) await expect(page.locator('#timer')).toBeVisible();
  else await expect(page.locator('#timer')).toBeHidden();
  await page.locator('#menu_close').click();
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');
}
