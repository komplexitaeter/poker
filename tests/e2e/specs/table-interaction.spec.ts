import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, tableCard, stopHbLoads, pickCard } from './helpers';

/**
 * B-110 part 1 (board): the board loads dao.php on every hb; away players show with a dimmed card and the trash can
 * without hover; the connected observers in a row below the cards; the smiley (.react) opens the emoji bar; touch
 * devices open the circles by a tap on the card, ask before removing and show a hint once.
 * last_callback_time is moved back per SQL and the board is updated by calling updateDao() (the hb of poker-msg comes
 * every 30 s, POKER_MSG_HEARTBEAT, so the tests do not wait for it).
 * SHOT_DIR (optional): screenshots of the states.
 */
const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 1024, height: 768 };
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function teamIdOf(url: string): string {
  const teamId = new URL(url).searchParams.get('t') as string;
  expect(teamId).toMatch(/^[A-Za-z0-9_-]+$/); // safe to put into the SQL below
  return teamId;
}

/** moves the last dao.php load of a user back by the given seconds */
function lastLoadAgo(t: string, id: string, seconds: number): void {
  expect(id).toMatch(/^[A-Z0-9]+$/);
  execFileSync('mysql', [...DB_ARGS, '-e', `update pok_players_tbl set last_callback_time =
    current_timestamp - interval ${seconds} second where team_id = '${t}' and id = '${id}'`]);
}

async function addObserver(page: Page, t: string, name: string): Promise<string> {
  const id = `E2EOBS${Date.now().toString(36)}${name.length}`.slice(0, 16).toUpperCase();
  const res = await page.request.post(`/api/name.php?${new URLSearchParams({ t, id, name, type: 'observer' })}`);
  expect(res.ok()).toBeTruthy();
  return id;
}

/** loads the board state now, as on a hb or a pull */
async function reload(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { updateDao: (onLoad: boolean) => void }).updateDao(false));
}

async function shot(page: Page, name: string): Promise<void> {
  if (!process.env.SHOT_DIR) return;
  await page.waitForTimeout(800); // colour switch, popover and glide are over
  await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
}

async function colorMode(page: Page, mode: 'dark' | 'light'): Promise<void> {
  await page.evaluate(m => (window as unknown as { setColorMode: (m: string) => void }).setColorMode(m), mode);
}

test('hb: the board loads dao.php 0-5 s after a heartbeat, once (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Table Hb');
  await joinAsPlayer(alice, url, 'Alice');
  await expect(tableCard(alice, 'Alice')).toBeVisible();
  await alice.waitForTimeout(500);
  let loads = 0;
  alice.on('request', r => { if (r.url().includes('/api/dao.php')) loads++; });
  // three heartbeats in a row: one load (a pending one is not doubled)
  // gConn is a global let (not on window): evaluated as a script in the page
  await alice.evaluate(`for (let i = 0; i < 3; i++) gConn.onmessage(new MessageEvent('message', { data: 'hb' }))`);
  await expect.poll(() => loads, { timeout: 7000 }).toBe(1);
  await alice.waitForTimeout(1000);
  expect(loads).toBe(1);
});

test('away: dimmed card, trash can without hover, named for screen readers (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Table Away');
  const t = teamIdOf(url);
  await joinAsPlayer(alice, url, 'Alice');
  const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
  await alice.reload();
  const bobCard = tableCard(alice, 'Bob');
  await expect(bobCard).toBeVisible();
  await alice.mouse.move(0, 0);
  await expect(bobCard).not.toHaveClass(/is-away/);
  await expect(bobCard.locator('.delete')).toHaveCSS('opacity', '0');

  lastLoadAgo(t, bob, 120);
  await reload(alice);
  await expect(bobCard).toHaveClass(/is-away/);
  await expect(bobCard.locator('.delete')).toHaveCSS('opacity', '1');
  await expect(bobCard.locator('.delete')).toHaveAttribute('aria-label', 'Remove Bob from the table (no connection)');
  await expect(tableCard(alice, 'Alice')).not.toHaveClass(/is-away/); // never the own card
  // R3 review V10 (L30a): no card yet and away: "away" instead of "thinking"; the tip says who to remove
  await expect(bobCard.locator('.pc .stl')).toHaveText('away');
  await expect(bobCard.locator('.pc')).toHaveAttribute('aria-label', 'away \u2013 no connection');
  await pickCard(alice, 'five001');
  await expect(alice.locator('#round_tip')).toHaveText('Waiting for Bob (away). Remove Bob from the table to reveal.');
  await colorMode(alice, 'dark');
  await shot(alice, 'desktop-dark-away');

  // Bob is back (his board loads dao.php)
  expect((await alice.request.get(`/api/dao.php?${new URLSearchParams({ t, id: bob })}`)).ok()).toBeTruthy();
  await reload(alice);
  await expect(bobCard).not.toHaveClass(/is-away/);
  await expect(bobCard.locator('.pc .stl')).toHaveText('thinking');
  await expect(alice.locator('#round_tip')).toHaveText('Waiting for Bob. Once everyone has voted, cards are revealed automatically.');
  await expect(bobCard.locator('.delete')).toHaveCSS('opacity', '0');
  await expect(bobCard.locator('.delete')).toHaveAttribute('aria-label', 'Remove Bob from the table');
});

test('observers row: connected observers only, names as text, own one marked (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Table Observers');
  const t = teamIdOf(url);
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#observers')).toBeHidden();

  const olga = await addObserver(alice, t, 'Olga');
  const eve = await addObserver(alice, t, '<i>Eve</i>');
  await reload(alice);
  const row = alice.locator('#observers');
  await expect(row).toBeVisible();
  await expect(row.locator('.obs-name')).toHaveText(['<i>Eve</i>', 'Olga']);
  await expect(row.locator('i')).toHaveCount(0);
  await expect(row.locator('.obs .react')).toHaveCount(2);
  await expect(row.locator('.delete')).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Throw a reaction at Olga' })).toHaveCount(1);
  // the nudge circle before the smiley, no popup
  await expect(row.locator('.obs .nudge')).toHaveCount(2);
  const olgaNudge = row.getByRole('button', { name: 'Nudge Olga' });
  await expect(olgaNudge).toHaveCount(1);
  await expect(olgaNudge).not.toHaveAttribute('aria-haspopup', /./);
  expect(await row.locator('.obs').filter({ hasText: 'Olga' }).evaluate(li =>
    Array.from(li.children).map(c => c.className))).toEqual(['obs-name', 'nudge', 'react']);

  // the row takes room from the cards: nothing overflows the table
  const overflow = await alice.locator('#table').evaluate(el => el.scrollHeight - el.clientHeight);
  expect(overflow).toBeLessThanOrEqual(0);
  await colorMode(alice, 'dark');
  await shot(alice, 'desktop-dark-observers');

  // Eve lost her connection: left out
  lastLoadAgo(t, eve, 120);
  await reload(alice);
  await expect(row.locator('.obs-name')).toHaveText(['Olga']);
  lastLoadAgo(t, olga, 120);
  await reload(alice);
  await expect(row).toBeHidden();

  // an observer sees herself as a name tag, without a smiley
  const oscar = await newPlayer(browser, { viewport: DESKTOP });
  await oscar.goto(url);
  await oscar.locator('#nameinput').fill('Oscar');
  await oscar.locator('#become_observer_btn').click();
  await expect(oscar.locator('#observers .obs.is-me .obs-name')).toHaveText('Oscar');
  await expect(oscar.locator('#observers .obs.is-me :is(.react, .nudge)')).toHaveCount(0);
  await reload(alice);
  await expect(row.locator('.obs-name')).toHaveText(['Oscar']);
});

test('smiley: opens the emoji bar, keys, Esc closes, focus back (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Table React');
  await joinAsPlayer(alice, url, 'Alice');
  await addPlayersViaApi(alice, url, ['Bob']);
  await alice.reload();
  const bobCard = tableCard(alice, 'Bob');
  await expect(bobCard).toBeVisible();
  await expect(tableCard(alice, 'Alice').locator('.react, .nudge')).toHaveCount(0); // not on the own card
  // the circles of a card: nudge, smiley, trash can (after the face)
  expect(await bobCard.evaluate(c => Array.from(c.children).map(e => e.className.split(' ')[0])))
    .toEqual(['card_player_name', 'pc', 'nudge', 'react', 'delete']);
  await expect(bobCard.locator('.nudge')).toHaveAttribute('aria-label', 'Nudge Bob');
  const smiley = bobCard.getByRole('button', { name: 'Throw a reaction at Bob' });
  const bar = alice.locator('#react_bar');

  await bobCard.hover();
  await smiley.click();
  await expect(bar).toBeVisible();
  await expect(bar.locator('.react-bar-name')).toHaveText('Bob');
  await expect(smiley).toHaveAttribute('aria-expanded', 'true');
  await expect(bar.locator('button[data-react="cake"]')).toBeFocused();
  await expect(bar.locator('button[data-react]')).toHaveCount(7); // seven emojis (the nudge is a circle of its own)
  // the bar sits above the smiley
  const [b, s] = [await bar.boundingBox(), await smiley.boundingBox()];
  expect(b!.y + b!.height).toBeLessThanOrEqual(s!.y);
  await colorMode(alice, 'dark');
  await shot(alice, 'desktop-dark-react-bar');

  await alice.keyboard.press('ArrowRight');
  await expect(bar.locator('button[data-react="heart"]')).toBeFocused();
  await alice.keyboard.press('ArrowLeft');
  await alice.keyboard.press('ArrowLeft');
  await expect(bar.locator('button[data-react="fish"]')).toBeFocused();
  // a letter key does not pick a card while the bar has the focus
  await alice.keyboard.press('KeyA');
  await expect(alice.locator('#ctl .ctl.selected')).toHaveCount(0);

  await alice.keyboard.press('Escape');
  await expect(bar).toBeHidden();
  await expect(smiley).toBeFocused();
  await expect(smiley).toHaveAttribute('aria-expanded', 'false');

  // Enter opens it again, an emoji closes it
  await alice.keyboard.press('Enter');
  await expect(bar).toBeVisible();
  await bar.locator('button[data-react="party"]').click();
  await expect(bar).toBeHidden();
  await expect(tableCard(alice, 'Bob')).toBeVisible();

  // a click elsewhere closes it; a double click on the smiley does not load the board
  await smiley.click();
  await expect(bar).toBeVisible();
  await alice.locator('#team_name').click();
  await expect(bar).toBeHidden();
  await stopHbLoads(alice); // a load after a hb is no load by the double click
  let loads = 0;
  alice.on('request', r => { if (r.url().includes('/api/dao.php')) loads++; });
  await bobCard.hover();
  await smiley.dblclick();
  await alice.waitForTimeout(500);
  expect(loads).toBe(0);
});

test('touch: a tap opens the circles, removing asks first (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: TABLET, hasTouch: true });
  const url = await createTeam(alice, 'Table Touch');
  await joinAsPlayer(alice, url, 'Alice');
  await addPlayersViaApi(alice, url, ['Bob', 'Carl']);
  await addObserver(alice, teamIdOf(url), 'Olga');
  await alice.reload();
  const bobCard = tableCard(alice, 'Bob');
  await expect(bobCard).toBeVisible();
  await colorMode(alice, 'light');
  await expect(bobCard.locator('.delete')).toHaveCSS('opacity', '0');
  await expect(bobCard.locator('.react')).toHaveCSS('opacity', '0');

  await bobCard.locator('.pc').tap();
  await expect(bobCard).toHaveClass(/is-open/);
  await expect(bobCard.locator('.delete')).toHaveCSS('opacity', '1');
  await expect(bobCard.locator('.react')).toHaveCSS('opacity', '1');
  await shot(alice, 'touch-light-open');

  // one card at a time; a tap elsewhere closes it
  await tableCard(alice, 'Carl').locator('.pc').tap();
  await expect(tableCard(alice, 'Carl')).toHaveClass(/is-open/);
  await expect(bobCard).not.toHaveClass(/is-open/);
  await alice.locator('#team_name').tap();
  await expect(tableCard(alice, 'Carl')).not.toHaveClass(/is-open/);

  // an observer opens its smiley by a tap, too
  const olga = alice.locator('#observers .obs').filter({ hasText: 'Olga' });
  await olga.locator('.obs-name').tap();
  await expect(olga).toHaveClass(/is-open/);
  await olga.locator('.react').tap();
  await expect(alice.locator('#react_bar')).toBeVisible();
  await expect(alice.locator('#react_bar .react-bar-name')).toHaveText('Olga');
  await shot(alice, 'touch-light-react-bar');
  await alice.locator('#team_name').tap(); // closes the bar
  await expect(alice.locator('#react_bar')).toBeHidden();

  // remove: ask first; Cancel keeps Bob, Remove removes him
  await bobCard.locator('.pc').tap();
  await bobCard.locator('.delete').tap();
  const confirm = alice.locator('#rm_confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm.locator('#rm_confirm_text')).toContainText('Remove Bob from the table?');
  await expect(confirm.locator('#rm_confirm_text small')).toHaveText('Bob can rejoin at any time.');
  await expect(bobCard).toHaveClass(/is-open/);
  await shot(alice, 'touch-light-remove-confirm');
  await confirm.getByRole('button', { name: 'Cancel' }).tap();
  await expect(confirm).toBeHidden();
  await expect(bobCard).toBeVisible();
  await bobCard.locator('.delete').tap();
  await confirm.getByRole('button', { name: 'Remove' }).tap();
  await expect(confirm).toBeHidden();
  await expect(tableCard(alice, 'Bob')).toHaveCount(0);
});

test('touch: the tap hint shows once (B-110)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: TABLET, hasTouch: true }, { tapHint: true });
  const url = await createTeam(alice, 'Table Hint');
  await joinAsPlayer(alice, url, 'Alice');
  const hint = alice.locator('#tap_hint');
  await expect(tableCard(alice, 'Alice')).toBeVisible();
  await expect(hint).toBeHidden(); // alone at the table: nothing to tap

  await addPlayersViaApi(alice, url, ['Bob']);
  await reload(alice);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Tap someone's card to nudge them");
  await colorMode(alice, 'light');
  await shot(alice, 'touch-light-tap-hint');
  await hint.getByRole('button', { name: 'Got it' }).tap();
  await expect(hint).toBeHidden();
  await alice.reload();
  await expect(tableCard(alice, 'Bob')).toBeVisible();
  await alice.waitForTimeout(500);
  await expect(hint).toBeHidden();
});

test('a load with the same state changes nothing on the page (B-110: dao.php on every hb)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Table Quiet');
  const t = teamIdOf(url);
  await joinAsPlayer(alice, url, 'Alice');
  const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
  await addObserver(alice, t, 'Olga');
  lastLoadAgo(t, bob, 120);
  await alice.reload();
  await expect(tableCard(alice, 'Bob')).toHaveClass(/is-away/);
  await alice.waitForTimeout(1500); // fade-ins and glides are over
  await reload(alice);
  await alice.waitForTimeout(500);

  await alice.evaluate(() => {
    const w = window as unknown as { gMutations: string[] };
    w.gMutations = [];
    new MutationObserver(records => records.forEach(r => {
      const el = r.target as Element;
      const where = el.nodeType === 1 ? `${el.tagName}#${el.id}.${el.getAttribute?.('class') ?? ''}` : 'text';
      if (r.type === 'attributes') {
        const now = el.getAttribute(r.attributeName!);
        if (now !== r.oldValue) w.gMutations.push(`${where} @${r.attributeName}: ${r.oldValue} -> ${now}`);
      } else if (r.type === 'childList') {
        w.gMutations.push(`${where} children +${r.addedNodes.length} -${r.removedNodes.length}`);
      } else {
        w.gMutations.push(`${where} text`);
      }
    })).observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  });
  await reload(alice);
  await reload(alice);
  await alice.waitForTimeout(1000);
  const mutations = await alice.evaluate(() => (window as unknown as { gMutations: string[] }).gMutations);
  expect(mutations).toEqual([]);
});
