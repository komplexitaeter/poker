import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { newPlayer, createTeam, userRequest } from './helpers';

/**
 * B-127 (API level): api/seen.php is the light heartbeat of the board. It marks the own board as connected (like
 * dao.php, B-110) and returns only {away_sig}: sha1 over the sorted ids of the away persons (players and observers,
 * since B-154 also removed persons, never the own one), '' when nobody is away. dao.php delivers the same away_sig. Never player ids.
 * B-159: a hash of the secret ids, not of the public mkeys (those could be tried out, also in anonymous mode).
 * last_callback_time is moved back per SQL, so the test does not wait.
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

function lastLoadAgo(t: string, id: string, seconds: number): void {
  expect(id).toMatch(/^[A-Z0-9]+$/);
  sql(`update pok_players_tbl set last_callback_time = current_timestamp - interval ${seconds} second
        where team_id = '${t}' and id = '${id}'`);
}

function lastLoadSecondsAgo(t: string, id: string): number {
  return Number(sql(`select timestampdiff(second, last_callback_time, current_timestamp) from pok_players_tbl
                      where team_id = '${t}' and id = '${id}'`));
}

function mkeyOf(t: string, id: string): number {
  return Number(sql(`select mkey from pok_players_tbl where team_id = '${t}' and id = '${id}'`));
}

/** expected signature: sha1 over 'away:' + the sorted ids joined by ',' + '|ai:' (no AI here; '' for none) */
function sig(ids: string[]): string {
  if (ids.length === 0) return '';
  return createHash('sha1').update('away:' + [...ids].sort().join(',') + '|ai:').digest('hex');
}

/** the B-127 signature over mkeys, which any board could compute itself (B-159: must no longer match) */
function mkeySig(mkeys: number[]): string {
  return createHash('sha1').update([...mkeys].sort((a, b) => a - b).join(',')).digest('hex');
}

async function post(page: Page, endpoint: string, params: Record<string, string>) {
  const { query, options } = userRequest(params); // B-152: the id in the header
  return page.request.post(`/api/${endpoint}?${query}`, options);
}

async function get(page: Page, endpoint: string, t: string, id: string) {
  const { query, options } = userRequest({ t, id });
  const res = await page.request.get(`/api/${endpoint}?${query}`, options);
  expect(res.ok()).toBeTruthy();
  return res;
}

const sid = (suffix: string) => `E2ESEEN${Date.now().toString(36)}${suffix}`.slice(0, 16).toUpperCase();

test('seen.php: marks the board connected and returns the same away_sig as dao.php', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = teamIdOf(await createTeam(page, 'Seen Heartbeat'));
  const [alice, bob, olga] = [sid('A'), sid('B'), sid('O')];
  for (const [id, name, type] of [[alice, 'Alice', 'player'], [bob, 'Bob', 'player'], [olga, 'Olga', 'observer']]) {
    expect((await post(page, 'name.php', { t, id, name, type })).ok()).toBeTruthy();
  }
  const [bobMkey, olgaMkey] = [mkeyOf(t, bob), mkeyOf(t, olga)];

  // nobody away: '' in both, seen.php delivers nothing but away_sig
  let res = await get(page, 'seen.php', t, alice);
  expect(await res.json()).toEqual({ away_sig: '' });
  expect((await (await get(page, 'dao.php', t, alice)).json()).away_sig).toBe('');

  // a player and an observer away: same signature in seen.php and dao.php, no ids in the answer
  lastLoadAgo(t, bob, 75);
  lastLoadAgo(t, olga, 75);
  res = await get(page, 'seen.php', t, alice);
  const body = await res.text();
  expect(JSON.parse(body)).toEqual({ away_sig: sig([bob, olga]) });
  expect(JSON.parse(body).away_sig).not.toBe(mkeySig([bobMkey, olgaMkey]));
  for (const id of [alice, bob, olga]) expect(body).not.toContain(id);
  expect((await (await get(page, 'dao.php', t, alice)).json()).away_sig).toBe(sig([bob, olga]));

  // seen.php sets last_callback_time like dao.php, and the own person is never in the set
  lastLoadAgo(t, alice, 300);
  expect(await (await get(page, 'seen.php', t, bob)).json()).toEqual({ away_sig: sig([alice, olga]) });
  expect(await (await get(page, 'seen.php', t, alice)).json()).toEqual({ away_sig: sig([olga]) });
  expect(lastLoadSecondsAgo(t, alice)).toBeLessThan(5);

  // B-154: a removed player counts like an observer (he is in the observer list while connected)
  lastLoadAgo(t, bob, 120);
  expect((await post(page, 'delete.php', { t, mkey: String(bobMkey) })).ok()).toBeTruthy();
  expect(await (await get(page, 'seen.php', t, alice)).json()).toEqual({ away_sig: sig([bob, olga]) });
  expect((await (await get(page, 'dao.php', t, alice)).json()).away_sig).toBe(sig([bob, olga]));
  // his board connects again: no longer away
  await get(page, 'seen.php', t, bob);
  expect(await (await get(page, 'seen.php', t, alice)).json()).toEqual({ away_sig: sig([olga]) });

  // too short id: empty answer like dao.php; unknown team: no error, empty signature, nothing changed
  expect(await (await get(page, 'seen.php', t, 'SHORT')).text()).toBe('');
  lastLoadAgo(t, alice, 300);
  expect(await (await get(page, 'seen.php', 'NoSuchTeam', alice)).json()).toEqual({ away_sig: '' });
  expect(lastLoadSecondsAgo(t, alice)).toBeGreaterThanOrEqual(299);
});
