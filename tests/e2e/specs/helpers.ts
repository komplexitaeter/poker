import { Browser, BrowserContextOptions, Page, Locator, expect } from '@playwright/test';

/**
 * Every third-party library the board needs (remarkable, qr-code-styling, js-confetti) is now
 * self-hosted under src/vendor/ and served same-origin by the test nginx, exactly as in production
 * (B-15). The tests therefore block all external hosts and keep only 127.0.0.1/localhost reachable.
 * This also covers production analytics (plausible.io), which must stay blocked.
 */
export async function newPlayer(browser: Browser, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext(options);
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
export async function addPlayersViaApi(page: Page, boardUrl: string, names: string[]): Promise<void> {
  const t = new URL(boardUrl).searchParams.get('t') ?? '';
  for (const [i, name] of names.entries()) {
    const id = `E2EAPI${Date.now().toString(36)}${i}`.slice(0, 16).toUpperCase();
    const res = await page.request.post(
      `/api/name.php?id=${id}&type=player&name=${encodeURIComponent(name)}&t=${encodeURIComponent(t)}`);
    expect(res.ok()).toBeTruthy();
  }
}

/** The card of a player on the table. */
export function tableCard(page: Page, playerName: string): Locator {
  return page.locator('#cbox .c').filter({
    has: page.locator('.card_player_name', { hasText: new RegExp(`^${playerName}$`) }),
  });
}

/** Expects the card image shown for a player, e.g. 'prgrss1' (not chosen), 'done001' (chosen, hidden), 'three01'. */
export async function expectTableCard(page: Page, playerName: string, displayCardKey: string): Promise<void> {
  await expect(tableCard(page, playerName).locator('img.card_image'))
    .toHaveAttribute('src', `src/c_${displayCardKey}.png`);
}

/** Picks a card from the player's own deck. */
export async function pickCard(page: Page, cardKey: string): Promise<void> {
  await page.locator(`#ctl img#${cardKey}`).click();
  await expect(page.locator(`#ctl img#${cardKey}`)).toHaveClass(/selected/);
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
