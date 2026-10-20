import { Browser, Page, Locator, expect } from '@playwright/test';

/**
 * Every third-party library the board needs (remarkable, qr-code-styling, js-confetti) is now
 * self-hosted under src/vendor/ and served same-origin by the test nginx, exactly as in production
 * (B-15). The tests therefore block all external hosts and keep only 127.0.0.1/localhost reachable.
 * This also covers production analytics (plausible.io), which must stay blocked.
 */
export async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
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
