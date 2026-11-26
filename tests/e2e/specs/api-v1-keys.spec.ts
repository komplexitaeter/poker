import { test, expect, APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { asUser, bearer, newV1Member, UID_HEADER, v1CreateKey, v1Join } from './helpers';

/**
 * B-150 PR 2: API keys (docs/api-v1-concept.md, section 5). A key acts as one person in one team; the team comes only
 * from the key row. Every person sees and deletes only their own keys; a foreign id is 404 key_not_found.
 */

const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];
function mysql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-r', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function teamGet(request: APIRequestContext, headers: Record<string, string>) {
  return request.get('/api/v1/team', { headers });
}

async function expectInvalidKey(request: APIRequestContext, key: string) {
  const res = await teamGet(request, bearer(key));
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'invalid_key' });
}

test('create on the board, list, use, delete: the key acts as the person in the team', async ({ request }) => {
  const anna = await newV1Member(request, 'V1 Keys Basic', 'Anna', 'player');
  const created = await v1CreateKey(request, anna, 'Jira');
  expect(created.key).toMatch(/^pok_[A-Z2-7]{32}$/);
  expect(created.hint).toBe(created.key.slice(-4));
  expect(created.name).toBe('Jira');
  expect(created.created).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  // only the hash is stored, never the key
  expect(mysql(`select count(1) from pok_api_keys_tbl where key_hash = unhex(sha2('${created.key}', 256))`)).toBe('1');

  // the key works at once, as Anna in her team; the answer never contains the key or the UID
  const res = await teamGet(request, bearer(created.key));
  expect(res.status()).toBe(200);
  const info = await res.json();
  expect(info.team.id).toBe(anna.t);
  expect(info.member).toEqual({ name: 'Anna', role: 'player' });
  expect(JSON.stringify(info)).not.toContain(anna.uid);

  // list with the key: current = this key, last_used set by the use above
  const listed = await (await request.get('/api/v1/keys', { headers: bearer(created.key) })).json();
  expect(listed.keys).toHaveLength(1);
  expect(listed.keys[0]).toMatchObject({ id: created.id, name: 'Jira', hint: created.hint, created: created.created, current: true });
  expect(listed.keys[0].last_used).toMatch(/Z$/);
  expect(JSON.stringify(listed)).not.toContain(created.key);
  // list in the browser mode: no current key
  const fromBoard = await (await request.get('/api/v1/keys', { headers: anna.headers })).json();
  expect(fromBoard.keys[0].current).toBe(false);

  // Basic (a proxy in front of staging) + board headers: still the browser mode
  const basic = await request.get('/api/v1/keys', { headers: { ...anna.headers, Authorization: 'Basic dXNlcjpwYXNz' } });
  expect(basic.status()).toBe(200);
  expect((await basic.json()).keys[0].current).toBe(false);

  // a key can never create keys (browser only), also not together with valid board headers
  const withKey = await request.post('/api/v1/keys', { headers: { ...anna.headers, ...bearer(created.key) }, data: { name: 'More' } });
  expect(withKey.status()).toBe(403);
  expect(await withKey.json()).toMatchObject({ error: 'browser_only' });

  // "current" exists only with a key
  const noCurrent = await request.delete('/api/v1/keys/current', { headers: anna.headers });
  expect(noCurrent.status()).toBe(400);
  expect(await noCurrent.json()).toMatchObject({ error: 'invalid_param' });

  // delete by id from the board: the key stops working at once
  expect((await request.delete(`/api/v1/keys/${created.id}`, { headers: anna.headers })).status()).toBe(204);
  await expectInvalidKey(request, created.key);
  const again = await request.delete(`/api/v1/keys/${created.id}`, { headers: anna.headers });
  expect(again.status()).toBe(404);
  expect(await again.json()).toMatchObject({ error: 'key_not_found' });

  // DELETE /keys/current with a key: 204, then 401
  const second = await v1CreateKey(request, anna, 'Script');
  expect((await request.delete('/api/v1/keys/current', { headers: bearer(second.key) })).status()).toBe(204);
  await expectInvalidKey(request, second.key);
  expect((await (await request.get('/api/v1/keys', { headers: anna.headers })).json()).keys).toEqual([]);
});

test('ownership: only own keys, a foreign id is 404, the team comes only from the key', async ({ request }) => {
  const anna = await newV1Member(request, 'V1 Keys Owner A', 'Anna', 'player');
  const annaKey = await v1CreateKey(request, anna, 'Anna key');
  const jira = await v1Join(request, anna.t, 'Jira', 'observer', 'Jira key');

  // the second person in the same team sees only its own key
  const jiraKeys = (await (await request.get('/api/v1/keys', { headers: jira.headers })).json()).keys;
  expect(jiraKeys.map((k: { name: string }) => k.name)).toEqual(['Jira key']);
  const annaKeys = (await (await request.get('/api/v1/keys', { headers: anna.headers })).json()).keys;
  expect(annaKeys.map((k: { name: string }) => k.name)).toEqual(['Anna key']);

  // deleting Anna's key with Jira's key: 404 like an unknown id, nothing deleted
  const foreign = await request.delete(`/api/v1/keys/${annaKey.id}`, { headers: jira.headers });
  expect(foreign.status()).toBe(404);
  expect(await foreign.json()).toMatchObject({ error: 'key_not_found' });
  expect((await teamGet(request, bearer(annaKey.key))).status()).toBe(200);

  // key of team A + X-Poker-Team / X-Poker-User of team B: acts in A as Anna
  const other = await newV1Member(request, 'V1 Keys Owner B', 'Bob', 'player');
  const mixed = await teamGet(request, { ...other.headers, ...bearer(annaKey.key) });
  expect(mixed.status()).toBe(200);
  expect(await mixed.json()).toMatchObject({ team: { id: anna.t }, member: { name: 'Anna' } });
  const note = await request.put('/api/v1/team/note', { headers: { ...other.headers, ...bearer(annaKey.key) }, data: { note: 'A only' } });
  expect(note.status()).toBe(200);
  expect((await (await teamGet(request, anna.headers)).json()).team.note).toBe('A only');
  expect((await (await teamGet(request, other.headers)).json()).team.note).toBe('');
});

test('limit: 20 keys per person and team, two simultaneous creations at 19 give exactly one', async ({ request }) => {
  const anna = await newV1Member(request, 'V1 Keys Limit');
  for (let i = 1; i <= 19; i++) await v1CreateKey(request, anna, `Key ${i}`);
  const [a, b] = await Promise.all([1, 2].map(i =>
    request.post('/api/v1/keys', { headers: anna.headers, data: { name: `Race ${i}` } })));
  expect([a.status(), b.status()].sort()).toEqual([201, 409]);
  const loser = a.status() === 409 ? a : b;
  expect(await loser.json()).toMatchObject({ error: 'limit_reached' });
  expect(mysql(`select count(1) from pok_api_keys_tbl where team_id = '${anna.t}'`)).toBe('20');
  // a key of another person in the same team is not limited by Anna's
  expect((await v1Join(request, anna.t)).key).toMatch(/^pok_/);
});

test('a key stops working when its person is gone; delete_user.php deletes the keys over all teams', async ({ request }) => {
  const anna = await newV1Member(request, 'V1 Keys Delete A', 'Anna', 'player');
  const keyA = await v1CreateKey(request, anna, 'A');
  // the same UID in a second team, with a key there
  const second = await newV1Member(request, 'V1 Keys Delete B');
  expect((await request.post(`/api/name.php?${new URLSearchParams({ t: second.t, name: 'Anna', type: 'observer' })}`,
    asUser(anna.uid))).ok()).toBeTruthy();
  const keyB = await v1CreateKey(request, { headers: { [UID_HEADER]: anna.uid, 'X-Poker-Team': second.t } }, 'B');
  expect((await teamGet(request, bearer(keyB.key))).status()).toBe(200);
  // a key of another person stays
  const jira = await v1Join(request, anna.t);

  expect((await request.post('/api/delete_user.php', asUser(anna.uid))).ok()).toBeTruthy();
  await expectInvalidKey(request, keyA.key);
  await expectInvalidKey(request, keyB.key);
  expect(mysql(`select count(1) from pok_api_keys_tbl where user_id = '${anna.uid}'`)).toBe('0');
  expect((await teamGet(request, jira.headers)).status()).toBe(200);
});

test('a key call counts as presence: last_callback_time of the API person moves (concept 5.4)', async ({ request }) => {
  const anna = await newV1Member(request, 'V1 Keys Presence', 'Anna', 'player');
  const jira = await v1Join(request, anna.t, 'Jira', 'observer');
  const age = () => Number(mysql(`select timestampdiff(second, last_callback_time, current_timestamp)
                                    from pok_players_tbl where team_id = '${anna.t}' and name = 'Jira'`));
  // as if Jira had been quiet for three months (the clean-up of start_new_round() deletes after two)
  mysql(`update pok_players_tbl set last_callback_time = current_timestamp - interval 90 day
          where team_id = '${anna.t}' and name = 'Jira'`);
  expect(age()).toBeGreaterThan(80 * 86400);
  expect((await teamGet(request, jira.headers)).status()).toBe(200);
  expect(age()).toBeLessThan(60);
  // a refused request (unknown key) touches nothing
  mysql(`update pok_players_tbl set last_callback_time = current_timestamp - interval 90 day
          where team_id = '${anna.t}' and name = 'Jira'`);
  await expectInvalidKey(request, `pok_${'A'.repeat(32)}`);
  expect(age()).toBeGreaterThan(80 * 86400);

  // quiet: not in the observer list of the board state; right after a call: present
  const observers = async () => JSON.stringify((await (await request.get(`/api/dao.php?t=${encodeURIComponent(anna.t)}`,
    { headers: anna.headers })).json()).observers);
  expect(await observers()).not.toContain('Jira');
  expect((await teamGet(request, jira.headers)).status()).toBe(200);
  expect(await observers()).toContain('Jira');
});

test('keys do not come back: re-joining with the same UID after the row was gone, 2-month clean-up', async ({ request }) => {
  const anna = await newV1Member(request, 'V1 Keys Rejoin', 'Anna', 'player');
  const key = await v1CreateKey(request, anna, 'Old');
  // the player row disappears (as by the clean-up of start_new_round()), then the same UID joins again
  mysql(`delete from pok_players_tbl where team_id = '${anna.t}' and id = '${anna.uid}'`);
  await expectInvalidKey(request, key.key);
  expect((await request.post(`/api/name.php?${new URLSearchParams({ t: anna.t, name: 'Anna', type: 'player' })}`,
    asUser(anna.uid))).ok()).toBeTruthy();
  await expectInvalidKey(request, key.key);
  expect(mysql(`select count(1) from pok_api_keys_tbl where team_id = '${anna.t}'`)).toBe('0');

  // the clean-up of a new round takes the keys of the persons it deletes along, others stay
  const jira = await v1Join(request, anna.t, 'Jira', 'observer');
  const bot = await v1Join(request, anna.t, 'Bot', 'observer');
  mysql(`update pok_players_tbl set last_callback_time = current_timestamp - interval 90 day
          where team_id = '${anna.t}' and name = 'Jira'`);
  expect((await request.post(`/api/newround.php?${new URLSearchParams({ t: anna.t })}`, asUser(anna.uid))).ok()).toBeTruthy();
  expect(mysql(`select name from pok_api_keys_tbl where team_id = '${anna.t}'`)).toBe('API');
  await expectInvalidKey(request, jira.key);
  expect((await teamGet(request, bot.headers)).status()).toBe(200);
});

test('a double submit of the same join is quiet: both answers ok, one row', async ({ request }) => {
  const anna = await newV1Member(request, 'V1 Double Join');
  const uid = (await (await request.post('/api/uid.php')).json()).id as string;
  const url = `/api/name.php?${new URLSearchParams({ t: anna.t, name: 'Bob', type: 'player' })}`;
  for (let round = 0; round < 3; round++) {
    const answers = await Promise.all([1, 2, 3].map(() => request.post(url, asUser(uid))));
    for (const res of answers) expect(res.status()).toBe(200);
  }
  expect(mysql(`select count(1) from pok_players_tbl where team_id = '${anna.t}' and id = '${uid}'`)).toBe('1');
});
