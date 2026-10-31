import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi, joinAsPlayer, pickCard, setTeamDeck, tableCard, expectTableCard } from './helpers';

/**
 * B-102: whoever joins as a player (or switches from observer to player) while every player has a card down, i.e.
 * the cards are revealed, gets the system card 'late001' instead of the coffee cup 'break01'. The round stays
 * revealed, the card is no vote (no celebration) and cannot be picked via setc.php (400). A real card replaces it.
 */

// same credentials as the test config written by tests/e2e/setup.sh
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function teamIdOf(url: string): string {
  const teamId = new URL(url).searchParams.get('t') as string;
  expect(teamId).toMatch(/^[A-Za-z0-9_-]+$/); // safe to put into the SQL below
  return teamId;
}

async function post(page: Page, endpoint: string, params: Record<string, string>) {
  return page.request.post(`/api/${endpoint}?${new URLSearchParams(params).toString()}`);
}

async function dao(page: Page, t: string, id: string) {
  const res = await page.request.get(`/api/dao.php?${new URLSearchParams({ t, id }).toString()}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

const sid = (suffix: string) => `E2ELATE${Date.now().toString(36)}${suffix}`.slice(0, 16).toUpperCase();

test('joining or becoming a player after the reveal gives late001, the round stays revealed', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Joined Late');
  const t = teamIdOf(url);
  const [bob, carol] = await addPlayersViaApi(page, url, ['Bob', 'Carol']);
  for (const id of [bob, carol]) expect((await post(page, 'setc.php', { t, id, cardkey: 'five001' })).ok()).toBeTruthy();
  expect((await dao(page, t, bob)).all_players_ready).toBe(true);
  expect((await dao(page, t, bob)).needs_celebration).toBe(true);

  // a new player joins after the reveal
  const dave = sid('D');
  expect((await post(page, 'name.php', { t, id: dave, name: 'Dave', type: 'player' })).ok()).toBeTruthy();
  // an observer joins after the reveal: late001 as well, but no player and no vote
  const erin = sid('E');
  expect((await post(page, 'name.php', { t, id: erin, name: 'Erin', type: 'observer' })).ok()).toBeTruthy();
  expect(sql(`select card_key from pok_players_tbl where id = '${erin}' and team_id = '${t}'`)).toBe('late001');
  let state = await dao(page, t, erin);
  expect(state.player_type).toBe('OBSERVER');
  expect(state.players_count).toBe(3);
  expect(state.ready_players_count).toBe(3);
  expect(state.players.map((p: { name: string }) => p.name)).toEqual(['Bob', 'Carol', 'Dave']);
  // ... then becomes a player: keeps late001, the round stays revealed
  expect((await post(page, 'name.php', { t, id: erin, name: 'Erin', type: 'player' })).ok()).toBeTruthy();
  expect(sql(`select card_key from pok_players_tbl where id = '${erin}' and team_id = '${t}'`)).toBe('late001');

  state = await dao(page, t, dave);
  expect(state.all_players_ready).toBe(true);
  expect(state.selected_card_key).toBe('late001');
  expect(state.ready_players_count).toBe(4);
  expect(state.needs_celebration).toBe(true); // late001 is no vote: Bob and Carol still agree
  const keys = state.players.map((p: { name: string; display_card_key: string }) => `${p.name}:${p.display_card_key}`);
  expect(keys).toEqual(['Bob:five001', 'Carol:five001', 'Dave:late001', 'Erin:late001']); // late001 sorts last
  expect(sql(`select count(1) from pok_players_tbl where team_id = '${t}' and card_key = 'break01'`)).toBe('0');

  // late001 cannot be picked; a real card replaces it
  expect((await post(page, 'setc.php', { t, id: bob, cardkey: 'late001' })).status()).toBe(400);
  expect((await post(page, 'setc.php', { t, id: dave, cardkey: 'three01' })).ok()).toBeTruthy();
  state = await dao(page, t, dave);
  expect(state.selected_card_key).toBe('three01');
  expect(state.needs_celebration).toBe(false);
  expect(sql(`select card_key from pok_players_tbl where id = '${bob}' and team_id = '${t}'`)).toBe('five001');

  // the snapshot of the round keeps the own key
  expect((await post(page, 'newround.php', { t, id: bob })).ok()).toBeTruthy();
  expect(sql(`select d.card_key from pok_roundstat_details_tbl d
               where d.team_id = '${t}' and d.player_id = '${erin}'`)).toBe('late001');
});

const DESKTOP = { width: 1400, height: 800 };
const SHOTS = process.env.B102_SHOTS; // optional: directory for screenshots of the table (review)

test('the table shows "joined in" with its symbol; no vote in the spread or the tips (B-102)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Joined In');
  const t = teamIdOf(url);
  await setTeamDeck(alice, url, 'fib-classic', null, ['break01', 'qstmrk1']);
  const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
  await joinAsPlayer(alice, url, 'Alice');
  expect((await post(alice, 'setc.php', { t, id: bob, cardkey: 'five001' })).ok()).toBeTruthy();
  await pickCard(alice, 'five001');
  const tip = alice.locator('#round_tip');
  await expect(tip).toHaveText('Everyone agrees \u2013 on to the next topic.');

  // Dave joins after the reveal: the round stays revealed, his card is the status card "joined in"
  const dave = sid('D');
  expect((await post(alice, 'name.php', { t, id: dave, name: 'Dave', type: 'player' })).ok()).toBeTruthy();
  await expectTableCard(alice, 'Dave', 'late001');
  const face = tableCard(alice, 'Dave').locator('.pc');
  await expect(face).toHaveClass(/is-status/);
  await expect(face).toHaveClass(/one-text/);
  await expect(face).toHaveAttribute('aria-label', 'joined in, no card yet');
  await expect(face.locator('use')).toHaveAttribute('href', /#s-late$/);
  await expect(face.locator('.stl')).toHaveText('joined in');
  await expect(face.locator('.stl')).toHaveCSS('font-weight', '700');
  // sorted last, the status line counts him as ready
  await expect(alice.locator('#cbox .c .card_player_name')).toHaveText(['Alice', 'Bob', 'Dave']);
  await expect(alice.locator('#round_status')).toHaveText('revealed');

  // no vote: no column in the spread, 5 keeps its two votes, still a consensus, no break hint
  await expect(alice.locator('#spread_bars [data-card="late001"]')).toHaveCount(0);
  await expect(alice.locator('#spread_bars [data-card="five001"] .spread-count')).toHaveText('2');
  await expect(alice.locator('#spread_bars .spread-col:not(.zero)')).toHaveCount(1);
  await expect(tip).toHaveText('Everyone agrees \u2013 on to the next topic.');
  await expect(tip).not.toContainText('break');
  await expect(alice.locator('#ctl .ctl[data-card="late001"]')).toHaveCount(0); // not in the deck
  if (SHOTS) {
    for (const mode of ['light', 'dark']) {
      await alice.evaluate(m => (window as unknown as { setColorMode: (m: string) => void }).setColorMode(m), mode);
      await alice.waitForTimeout(400);
      await alice.screenshot({ path: `${SHOTS}/table-${mode}.png` });
    }
  }

  // a real card replaces it: shown like any card, now a vote with its own column
  expect((await post(alice, 'setc.php', { t, id: dave, cardkey: 'eight01' })).ok()).toBeTruthy();
  await expectTableCard(alice, 'Dave', 'eight01');
  await expect(tableCard(alice, 'Dave').locator('.pc')).not.toHaveClass(/is-status/);
  await expect(alice.locator('#spread_bars [data-card="eight01"] .spread-count')).toHaveText('1');
  await expect(tip).toContainText('Let them explain');
});

test('"joined in" in anonymous mode: same card, general tip without a break hint (B-102)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Joined In Anonymous');
  const t = teamIdOf(url);
  await setTeamDeck(alice, url, 'fib-classic', null, ['break01']);
  expect((await alice.request.post(`/api/update_team.php?t=${t}&anonymous_request_toggle=1`)).ok()).toBeTruthy();
  const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
  await joinAsPlayer(alice, url, 'Alice');
  expect((await post(alice, 'setc.php', { t, id: bob, cardkey: 'three01' })).ok()).toBeTruthy();
  await pickCard(alice, 'eight01');
  await expect(alice.locator('#round_status')).toHaveText('revealed');

  const dave = sid('A');
  expect((await post(alice, 'name.php', { t, id: dave, name: 'Dave', type: 'player' })).ok()).toBeTruthy();
  await expect(alice.locator('#cbox .c[data-card="late001"]')).toHaveCount(1);
  const face = alice.locator('#cbox .c[data-card="late001"] .pc');
  await expect(face.locator('use')).toHaveAttribute('href', /#s-late$/);
  await expect(face.locator('.stl')).toHaveText('joined in');
  // last in the anonymous order (by card)
  await expect(alice.locator('#cbox .c').last()).toHaveAttribute('data-card', 'late001');
  await expect(alice.locator('#spread_bars [data-card="late001"]')).toHaveCount(0);
  await expect(alice.locator('#round_tip')).toHaveText('Take the chance and talk about what you see.');
  if (SHOTS) await alice.screenshot({ path: `${SHOTS}/table-anonymous.png` });
});
