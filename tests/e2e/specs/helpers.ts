import { Browser, Page, Locator, expect } from '@playwright/test';
import path from 'node:path';

const modules = path.join(__dirname, '..', 'node_modules');

/**
 * Third-party scripts the pages load from CDNs, served from the same versions installed via npm,
 * so the tests don't depend on CDN availability or an outgoing proxy.
 */
const cdnFiles: Record<string, string> = {
  'https://cdn.jsdelivr.net/remarkable/1.7.1/remarkable.min.js': 'remarkable/dist/remarkable.min.js',
  'https://unpkg.com/qr-code-styling@1.5.0/lib/qr-code-styling.js': 'qr-code-styling/lib/qr-code-styling.js',
  // production loads js-confetti@latest
  'https://cdn.jsdelivr.net/npm/js-confetti@latest/dist/js-confetti.browser.js': 'js-confetti/dist/js-confetti.browser.js',
};

/** Opens a new browser context, i.e. a separate player with its own localStorage session. */
export async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.route(/^https:\/\//, route => {
    const file = cdnFiles[route.request().url()];
    if (file) return route.fulfill({ path: path.join(modules, file), contentType: 'text/javascript' });
    // icons only
    if (route.request().url().includes('font-awesome')) return route.fulfill({ body: '', contentType: 'text/css' });
    // everything else, in particular the production analytics (plausible.io), stays blocked
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
