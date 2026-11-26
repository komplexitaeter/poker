import { test, expect, APIRequestContext, APIResponse } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newV1Member, v1Join, asUser } from './helpers';

/**
 * B-150 PR 4: items through /api/v1 (docs/api-v1-concept.md, 4.4): item_upsert (PUT by key, 201/200, 409 item_closed on
 * a done item), item_reopen, item_get / item_list with the result like the export of the board, item_delete.
 * Keys are compared case-insensitively (collation), only ASCII keys are accepted.
 */

const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];
function mysql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-r', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
const rev = (t: string) => Number(mysql(`select topics_rev from pok_teams_tbl where id = '${t}'`));
const itemId = (t: string, key: string) => mysql(`select id from pok_topic_items_tbl where team_id = '${t}' and ext_id = '${key}'`);

type Member = { t: string; uid: string; headers: Record<string, string> };

async function member(request: APIRequestContext, team: string): Promise<Member> {
  const m = await newV1Member(request, team);
  expect(m.t).toMatch(/^[A-Za-z0-9_-]+$/); // safe for the SQL of the checks
  return m;
}

const put = (request: APIRequestContext, m: Member, key: string, data: Record<string, unknown>) =>
  request.put(`/api/v1/items/${encodeURIComponent(key)}`, { headers: m.headers, data });
const getItem = (request: APIRequestContext, m: Member, key: string) =>
  request.get(`/api/v1/items/${encodeURIComponent(key)}`, { headers: m.headers });
const list = async (request: APIRequestContext, m: Member, query = '') => {
  const res = await request.get(`/api/v1/items${query}`, { headers: m.headers });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
};
const internal = (request: APIRequestContext, m: Member, endpoint: string, params: Record<string, string>, uid = m.uid) =>
  request.post(`/api/${endpoint}?${new URLSearchParams({ t: m.t, ...params })}`, asUser(uid));

async function expectError(res: APIResponse, status: number, error: string, param?: string) {
  const text = await res.text();
  expect(res.status(), text).toBe(status);
  const body = JSON.parse(text);
  expect(body.error).toBe(error);
  if (param !== undefined) expect(body.param).toBe(param);
}

test('item_upsert: 201 then 200 for the same key (any case), description rules, ASCII keys only', async ({ request }) => {
  const m = await member(request, 'V1 Items Upsert');
  const before = rev(m.t);

  const created = await put(request, m, 'DMZ-004', { heading: '  Login with SSO ', description: 'As a user …' });
  expect(created.status(), await created.text()).toBe(201);
  expect(await created.json()).toEqual({
    key: 'DMZ-004', heading: 'Login with SSO', description: 'As a user …', status: 'open', active: true, position: 1,
    result: null, url: `/?t=${m.t}`,
  });
  expect(rev(m.t)).toBeGreaterThan(before); // the board reloads its lists

  // same key in another case: the same item, the stored key stays; description missing = unchanged
  const updated = await put(request, m, 'dmz-004', { heading: 'Login with SAML' });
  expect(updated.status()).toBe(200);
  expect(await updated.json()).toMatchObject({ key: 'DMZ-004', heading: 'Login with SAML', description: 'As a user …' });
  // null removes the description; "" as well
  expect(await (await put(request, m, 'DMZ-004', { heading: 'Login', description: null })).json())
    .toMatchObject({ description: null });
  expect((await list(request, m)).items.map((i: { key: string }) => i.key)).toEqual(['DMZ-004']);

  // a second item: at the end, or 'next' right after the active one
  expect((await put(request, m, 'DMZ-005', { heading: 'Logout' })).status()).toBe(201);
  const next = await put(request, m, 'DMZ-006', { heading: 'Profile', at: 'next' });
  expect(await next.json()).toMatchObject({ key: 'DMZ-006', active: false, position: 2 });
  const all = await list(request, m);
  expect(all.items.map((i: { key: string }) => i.key)).toEqual(['DMZ-004', 'DMZ-006', 'DMZ-005']);
  expect(all).toMatchObject({ open_count: 3, done_count: 0 });
  expect(await (await getItem(request, m, 'dmz-005')).json()).toMatchObject({ key: 'DMZ-005', position: 3 });

  // keys are ASCII letters, digits, _ and - (they stand in the URL path)
  for (const key of ['A.php', 'A#1', 'Ä-1', '-A1', 'A'.repeat(21)]) {
    await expectError(await put(request, m, key, { heading: 'x' }), 400, 'invalid_param', 'key');
  }
  await expectError(await put(request, m, 'A1', { heading: '' }), 400, 'invalid_param', 'heading');
  await expectError(await put(request, m, 'A1', {}), 400, 'missing_param', 'heading');
  await expectError(await put(request, m, 'A1', { heading: 'x', key: 'B1' }), 400, 'unknown_param', 'key');
  expect((await list(request, m)).open_count).toBe(3);
});

test('item_upsert: parallel calls with one key give one item; limit of 100 open items', async ({ request }) => {
  const m = await member(request, 'V1 Items Parallel');
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => put(request, m, 'JIRA-1', { heading: `Take ${i}` })));
  expect(results.map(r => r.status()).sort()).toEqual([200, 200, 200, 200, 200, 201]);
  expect(mysql(`select count(*) from pok_topic_items_tbl where team_id = '${m.t}'`)).toBe('1');

  // 99 more open items (directly, fast), then the 101st is refused; changing one still works
  mysql(`insert into pok_topic_items_tbl(team_id, position, ext_id, heading)
         select '${m.t}', n + 1, concat('L', n), 'x' from (with recursive s(n) as (select 1 union all select n + 1 from s
         where n < 99) select n from s) s`);
  await expectError(await put(request, m, 'L100', { heading: 'one too many' }), 409, 'limit_reached');
  expect((await put(request, m, 'l5', { heading: 'changed' })).status()).toBe(200);
});

test('done items: PUT -> 409 item_closed, reopen at the end (idempotent), delete; unknown keys 404', async ({ request }) => {
  const m = await member(request, 'V1 Items Closed');
  expect((await put(request, m, 'A-1', { heading: 'Alpha' })).status()).toBe(201);
  expect((await put(request, m, 'A-2', { heading: 'Beta' })).status()).toBe(201);
  expect((await internal(request, m, 'topic_item_next.php', { item: itemId(m.t, 'A-1') })).ok()).toBeTruthy();

  const closed = await getItem(request, m, 'a-1');
  expect(await closed.json()).toMatchObject({ key: 'A-1', status: 'done', active: false, position: null });
  await expectError(await put(request, m, 'A-1', { heading: 'Alpha 2' }), 409, 'item_closed');
  expect((await (await getItem(request, m, 'A-1')).json()).heading).toBe('Alpha'); // nothing changed

  const reopen = () => request.post('/api/v1/items/a-1/reopen', { headers: m.headers });
  const reopened = await reopen();
  expect(reopened.status(), await reopened.text()).toBe(200);
  expect(await reopened.json()).toMatchObject({ key: 'A-1', status: 'open', active: false, position: 2 });
  const before = rev(m.t);
  expect(await (await reopen()).json()).toMatchObject({ status: 'open', position: 2 }); // open already: unchanged
  expect(rev(m.t)).toBe(before);
  // the old endpoint (now a wrapper of the same core function) keeps its answer for an open item
  const old = await internal(request, m, 'topic_item_reopen.php', { item: itemId(m.t, 'A-1') });
  expect(old.status()).toBe(409);
  expect(await old.json()).toEqual({ error: 'not_done' });
  expect((await put(request, m, 'A-1', { heading: 'Alpha 2' })).status()).toBe(200);

  const del = await request.delete('/api/v1/items/A-1', { headers: m.headers });
  expect(del.status()).toBe(204);
  expect(await del.text()).toBe('');
  await expectError(await request.delete('/api/v1/items/A-1', { headers: m.headers }), 404, 'item_not_found');
  await expectError(await getItem(request, m, 'A-1'), 404, 'item_not_found');
  await expectError(await request.post('/api/v1/items/A-9/reopen', { headers: m.headers }), 404, 'item_not_found');
  expect((await list(request, m, '?status=all')).items.map((i: { key: string }) => i.key)).toEqual(['A-2']);
});

test('result like the export: proposal while open, final result when done, perspectives without value', async ({ request }) => {
  const m = await member(request, 'V1 Items Result');
  const ben = (await (await request.post('/api/uid.php')).json()).id as string;
  expect((await request.post(`/api/name.php?${new URLSearchParams({ t: m.t, name: 'Ben', type: 'player' })}`,
    asUser(ben))).ok()).toBeTruthy();
  const play = async (anna: string, benCard: string) => {
    expect((await internal(request, m, 'setc.php', { cardkey: anna })).ok()).toBeTruthy();
    expect((await internal(request, m, 'setc.php', { cardkey: benCard }, ben)).ok()).toBeTruthy();
  };

  expect((await put(request, m, 'R-1', { heading: 'Estimate me' })).status()).toBe(201);
  await play('eight01', 'five001'); // revealed: the running round of the active item is the proposal
  expect((await (await getItem(request, m, 'R-1')).json()).result).toEqual({
    value: '8', card_key: 'eight01', chosen: false,
    votes: [{ value: '5', card_key: 'five001', count: 1 }, { value: '8', card_key: 'eight01', count: 1 }],
    votes_text: '5 ×1, 8 ×1', rounds: 0, last_round_date: null, done_date: null,
  });
  expect((await internal(request, m, 'newround.php', {})).ok()).toBeTruthy();
  await play('1pnt501', '1pnt501');
  expect((await internal(request, m, 'topic_item_next.php', { item: itemId(m.t, 'R-1') })).ok()).toBeTruthy();

  const done = await (await getItem(request, m, 'R-1')).json();
  expect(done).toMatchObject({ status: 'done', position: null, active: false });
  expect(done.result).toMatchObject({ value: '½', card_key: '1pnt501', chosen: false, votes_text: '½ ×2', rounds: 2 });
  expect(done.result.last_round_date).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  expect(done.result.done_date).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  const lists = await list(request, m, '?status=done&limit=1&offset=0');
  expect(lists).toMatchObject({ open_count: 0, done_count: 1 });
  expect(lists.items).toEqual([done]);
  expect((await list(request, m, '?status=done&offset=1')).items).toEqual([]);

  // traffic lights (deck aim perspectives): only the votes, no value
  expect((await internal(request, m, 'newround.php', {})).ok()).toBeTruthy();
  expect((await internal(request, m, 'update_deck.php', { deck: 'traffic' })).ok()).toBeTruthy();
  expect((await put(request, m, 'R-2', { heading: 'Feeling' })).status()).toBe(201);
  await play('green01', 'red0001');
  const lights = (await (await getItem(request, m, 'R-2')).json()).result;
  expect(lights).toMatchObject({ value: null, card_key: null, chosen: false, votes_text: '🟢 ×1, 🔴 ×1' });
});

test('API key: items of its own team only, the board headers of another team are ignored', async ({ request }) => {
  const a = await member(request, 'V1 Items Team A');
  const b = await member(request, 'V1 Items Team B');
  expect((await put(request, b, 'B-1', { heading: 'Only in B' })).status()).toBe(201);
  const key = await v1Join(request, a.t);

  const res = await request.get('/api/v1/items/B-1', { headers: { ...key.headers, 'X-Poker-Team': b.t, 'X-Poker-User': b.uid } });
  await expectError(res, 404, 'item_not_found');
  const created = await request.put('/api/v1/items/B-1', { headers: key.headers, data: { heading: 'In A' } });
  expect(created.status()).toBe(201);
  expect((await created.json()).url).toBe(`/?t=${a.t}`);
  expect((await (await getItem(request, b, 'B-1')).json()).heading).toBe('Only in B');
});
