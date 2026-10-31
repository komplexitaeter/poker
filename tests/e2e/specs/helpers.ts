import { test, Browser, BrowserContext, BrowserContextOptions, Page, Locator, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

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

/** R3 F5: sets the deck of a team through the API (api/update_deck.php, api/update_controls.php): a variant of
 * card_catalog.json, optionally single cards of its group and the control cards (null: leave them). */
export async function setTeamDeck(page: Page, boardUrl: string, deck: string, cards: string[] | null = null,
                                  controls: string[] | null = null): Promise<void> {
  const t = encodeURIComponent(new URL(boardUrl).searchParams.get('t') ?? '');
  const cardsParam = cards === null ? '' : `&cards=${cards.join(',')}`;
  expect((await page.request.post(`/api/update_deck.php?t=${t}&deck=${deck}${cardsParam}`)).ok()).toBeTruthy();
  if (controls !== null) {
    expect((await page.request.post(`/api/update_controls.php?t=${t}&controls=${controls.join(',')}`)).ok()).toBeTruthy();
  }
}

/** R3 F5: all cards of the Fibonacci group plus all control cards (19 cards, the largest deck) */
export const FIB_ALL = ['zero001', '1pnt501', 'one0001', 'two0001', 'three01', 'five001', 'eight01', 'thrtn01', 'twnty01',
  '2tyone1', '3tyfr01', '4ty0001', '5tyfve1', 'hundro1', 'infin01'];
export const CONTROLS_ALL = ['break01', 'qstmrk1', 'xclam01', 'veto'];

/** R3 F5: chooses a card set in the deck menu (Board settings -> Deck -> change), menu open or closed */
export async function chooseCardSet(page: Page, setName: string): Promise<void> {
  if (!(await page.locator('#deck_menu').isVisible())) await page.locator('#cset_btn').click();
  await page.locator('#deck_change').click();
  await page.locator('#deck_menu .dm-prow-b').filter({ hasText: setName }).click();
}

/**
 * R3 F4: decks from card_catalog.json have at most 19 cards and never mix groups. Specs about the tray layout that
 * need larger or mixed decks set cardset_flags in the database and let the board use its fallback: dao.php without
 * "deck" (as with a missing card_catalog.json on the server), so the deck comes from cardset_flags (deck.js adapter).
 */
const legacyDeckPages = new WeakSet<Page>();

export async function setLegacyDeck(page: Page, t: string, indexes: number[]): Promise<void> {
  expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // checked before it goes into the statement
  const flags = Array(46).fill('0');
  indexes.forEach(i => flags[i] = '1');
  execFileSync('mysql', ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e', '-e',
    `update pok_teams_tbl set cardset_flags='${flags.join('')}' where id='${t}'`]);
  if (legacyDeckPages.has(page)) return;
  legacyDeckPages.add(page);
  await page.route('**/api/dao.php*', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.deck = null;
    await route.fulfill({ response, json });
  });
}

/** R3 F5: back to the server's deck (dao.php with "deck") after setLegacyDeck */
export async function clearLegacyDeck(page: Page): Promise<void> {
  await page.unroute('**/api/dao.php*');
  legacyDeckPages.delete(page);
}
