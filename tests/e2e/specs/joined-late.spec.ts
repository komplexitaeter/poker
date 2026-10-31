import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi } from './helpers';

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
  // an observer joins (no card) and then becomes a player
  const erin = sid('E');
  expect((await post(page, 'name.php', { t, id: erin, name: 'Erin', type: 'observer' })).ok()).toBeTruthy();
  expect(sql(`select ifnull(card_key, 'NULL') from pok_players_tbl where id = '${erin}' and team_id = '${t}'`)).toBe('NULL');
  expect((await post(page, 'name.php', { t, id: erin, name: 'Erin', type: 'player' })).ok()).toBeTruthy();

  let state = await dao(page, t, dave);
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
