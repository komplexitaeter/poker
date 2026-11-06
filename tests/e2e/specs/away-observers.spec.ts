import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam } from './helpers';

/**
 * B-110 (steps 1+2, API level): dao.php delivers "away" per player (no dao.php load for AWAY_AFTER_SEC = 70 s, the own
 * card never) and the connected observers ({name, mkey}, never the id); observers without connection are left out.
 * api/delete.php removes players only, never observers (400, nothing changed). last_callback_time is moved back per
 * SQL, so the test does not wait.
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

/** moves the last dao.php load of a user back by the given seconds */
function lastLoadAgo(t: string, id: string, seconds: number): void {
  expect(id).toMatch(/^[A-Z0-9]+$/);
  sql(`update pok_players_tbl set last_callback_time = current_timestamp - interval ${seconds} second
        where team_id = '${t}' and id = '${id}'`);
}

async function post(page: Page, endpoint: string, params: Record<string, string>) {
  return page.request.post(`/api/${endpoint}?${new URLSearchParams(params).toString()}`);
}

async function dao(page: Page, t: string, id: string) {
  const res = await page.request.get(`/api/dao.php?${new URLSearchParams({ t, id }).toString()}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

const sid = (suffix: string) => `E2EAWAY${Date.now().toString(36)}${suffix}`.slice(0, 16).toUpperCase();

type Player = { name: string; mkey: string; away: boolean };
type Observer = { name: string; mkey: string };

test('dao.php: away per player, connected observers only, delete.php spares observers', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = teamIdOf(await createTeam(page, 'Away Observers'));
  const [alice, bob, olga, oscar] = [sid('A'), sid('B'), sid('O'), sid('S')];
  for (const [id, name, type] of [[alice, 'Alice', 'player'], [bob, 'Bob', 'player'],
    [olga, 'Olga', 'observer'], [oscar, 'Oscar', 'observer']]) {
    expect((await post(page, 'name.php', { t, id, name, type })).ok()).toBeTruthy();
  }

  // everybody just joined: nobody away, both observers delivered (ordered by name), mkey as string, no ids
  let state = await dao(page, t, alice);
  expect(state.players.map((p: Player) => `${p.name}:${p.away}`)).toEqual(['Alice:false', 'Bob:false']);
  expect(state.observers.map((o: Observer) => o.name)).toEqual(['Olga', 'Oscar']);
  for (const o of state.observers) {
    expect(Object.keys(o).sort()).toEqual(['mkey', 'name']);
    expect(typeof o.mkey).toBe('string');
  }
  expect(JSON.stringify(state.observers)).not.toContain(olga);

  // Bob and Oscar missed two heartbeats; below the threshold (60 s) is still connected
  lastLoadAgo(t, bob, 75);
  lastLoadAgo(t, oscar, 75);
  lastLoadAgo(t, olga, 60);
  state = await dao(page, t, alice);
  expect(state.players.map((p: Player) => `${p.name}:${p.away}`)).toEqual(['Alice:false', 'Bob:true']);
  expect(state.observers.map((o: Observer) => o.name)).toEqual(['Olga']);

  // a load brings a player back; the own person is never away (the own load sets the time), also as an observer
  lastLoadAgo(t, alice, 300);
  state = await dao(page, t, bob);
  expect(state.players.map((p: Player) => `${p.name}:${p.away}`)).toEqual(['Alice:true', 'Bob:false']);
  state = await dao(page, t, alice);
  expect(state.players.map((p: Player) => `${p.name}:${p.away}`)).toEqual(['Alice:false', 'Bob:false']);
  state = await dao(page, t, oscar);
  expect(state.player_type).toBe('OBSERVER');
  const ownMkey = state.mkey;
  expect(state.observers.map((o: Observer) => `${o.name}:${o.mkey === ownMkey}`)).toEqual(['Olga:false', 'Oscar:true']);

  // delete.php: an observer cannot be removed (400, no change), a player can (also when away)
  const olgaMkey = state.observers.find((o: Observer) => o.name === 'Olga').mkey;
  expect((await post(page, 'delete.php', { t, mkey: olgaMkey })).status()).toBe(400);
  expect(sql(`select player_type from pok_players_tbl where team_id = '${t}' and id = '${olga}'`)).toBe('OBSERVER');

  lastLoadAgo(t, bob, 120);
  const bobMkey = (await dao(page, t, alice)).players.find((p: Player) => p.name === 'Bob').mkey;
  expect((await post(page, 'delete.php', { t, mkey: bobMkey })).ok()).toBeTruthy();
  expect(sql(`select player_type from pok_players_tbl where team_id = '${t}' and id = '${bob}'`)).toBe('REMOVED');
  // a second click on the removed card changes nothing
  expect((await post(page, 'delete.php', { t, mkey: bobMkey })).status()).toBe(400);
  state = await dao(page, t, alice);
  expect(state.players.map((p: Player) => p.name)).toEqual(['Alice']);
});
