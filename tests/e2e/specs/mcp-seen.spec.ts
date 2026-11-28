import { test, expect, APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newV1Member, userRequest, v1CreateKey } from './helpers';

/**
 * B-151 mcp seen (API level): every MCP tool call with a seat (team_id + uid or api_key, also a key that takes over a
 * browser seat) sets pok_players_tbl.mcp_seen_time; dao.php and the MCP board show via_ai per player/observer while it
 * is younger than AWAY_AFTER_SEC (70 s), plus the team count ai_count. In anonymous mode after the reveal other
 * players have via_ai and away false (no card linked to a person), only ai_count and away_count tell. away_sig
 * changes with the set of AI persons, so the boards reload. Times are moved back per SQL, the test does not wait.
 */

// same credentials as the test config written by tests/e2e/setup.sh
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function safe(value: string): string {
  expect(value).toMatch(/^[A-Za-z0-9_-]+$/); // safe to put into the SQL below
  return value;
}

let rpcId = 0;

/** an MCP tool call that must succeed: its structuredContent */
async function mcp(request: APIRequestContext, name: string, args: Record<string, unknown>) {
  const res = await request.post('/mcp', { data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call',
                                                   params: { name, arguments: args } } });
  expect(res.status(), await res.text()).toBe(200);
  const result = (await res.json()).result;
  expect(result.isError, JSON.stringify(result)).toBeFalsy();
  return result.structuredContent;
}

async function dao(request: APIRequestContext, t: string, id: string) {
  const { query, options } = userRequest({ t, id });
  const res = await request.get(`/api/dao.php?${query}`, options);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function seen(request: APIRequestContext, t: string, id: string): Promise<string> {
  const { query, options } = userRequest({ t, id });
  const res = await request.post(`/api/seen.php?${query}`, options);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).away_sig;
}

const flags = (list: any[]) => Object.fromEntries(list.map((p: any) => [p.name, !!p.via_ai]));

test('via_ai and ai_count: MCP seats, key take-over, the window, away_sig', async ({ request }) => {
  const anna = await newV1Member(request, 'MCP Seen', 'Anna'); // browser seat
  const t = anna.t;
  const bob = (await mcp(request, 'join_team', { invite: t, name: 'Bob', role: 'player' })).you;
  const mo = (await mcp(request, 'join_team', { invite: t, name: 'Mo', role: 'observer' })).you;

  // a fresh join is via AI at once; the browser seat is not
  let d = await dao(request, t, anna.uid);
  expect(flags(d.players)).toEqual({ Anna: false, Bob: true });
  expect(d.observers).toEqual([{ name: 'Mo', mkey: mo.mkey, via_ai: true }]);
  expect(d.ai_count).toBe(2);
  expect(d.away_count).toBe(0);
  expect(d.away_sig).not.toBe('');
  expect(await seen(request, t, anna.uid)).toBe(d.away_sig); // same signature as seen.php
  const sigBoth = d.away_sig;

  // the MCP board shows it too (with the counts)
  const board = await mcp(request, 'get_board', { team_id: t, uid: bob.uid });
  expect(flags(board.players)).toEqual({ Anna: false, Bob: true });
  expect(board.observers).toEqual([{ name: 'Mo', mkey: mo.mkey, via_ai: true }]);
  expect(board.ai_count).toBe(2);
  expect(board.away_count).toBe(0);

  // Bob's last MCP call older than the window: no symbol any more, the signature changes (boards reload)
  sql(`update pok_players_tbl set mcp_seen_time = current_timestamp - interval 80 second
        where team_id = '${safe(t)}' and id = '${safe(bob.uid)}'`);
  d = await dao(request, t, anna.uid);
  expect(flags(d.players)).toEqual({ Anna: false, Bob: false });
  expect(d.ai_count).toBe(1);
  expect(d.away_sig).not.toBe(sigBoth);
  expect(await seen(request, t, anna.uid)).toBe(d.away_sig);

  // his next MCP call brings it back
  await mcp(request, 'get_board', { team_id: t, uid: bob.uid });
  d = await dao(request, t, anna.uid);
  expect(flags(d.players)).toEqual({ Anna: false, Bob: true });
  expect(d.away_sig).toBe(sigBoth);

  // a key that takes over Anna's browser seat marks her seat (also seen by her own board)
  const created = await v1CreateKey(request, anna, 'AI');
  await mcp(request, 'join_team', { api_key: created.key });
  d = await dao(request, t, anna.uid);
  expect(flags(d.players)).toEqual({ Anna: true, Bob: true });
  expect(d.ai_count).toBe(3);

  // the REST API with a key is no AI assistant: it does not mark
  sql(`update pok_players_tbl set mcp_seen_time = null where team_id = '${safe(t)}' and id = '${safe(anna.uid)}'`);
  const rest = await request.get('/api/v1/team',
                                 { headers: { Authorization: `Bearer ${created.key}` } });
  expect(rest.status(), await rest.text()).toBe(200);
  expect(sql(`select ifnull(mcp_seen_time, 'null') from pok_players_tbl where id = '${safe(anna.uid)}'`)).toBe('null');
});

test('anonymous mode after the reveal: no via_ai or away per other player, only the team counts', async ({ request }) => {
  const anna = await newV1Member(request, 'MCP Seen Anon', 'Anna'); // browser seat
  const t = anna.t;
  const bob = (await mcp(request, 'join_team', { invite: t, name: 'Bob', role: 'player' })).you;
  const cleo = await newV1Member(request, 'unused', 'Cleo'); // a UID of its own, joins team t through name.php
  const joined = await request.post(`/api/name.php?${new URLSearchParams({ t, name: 'Cleo', type: 'player' })}`,
                                    { headers: { 'X-Poker-User': cleo.uid } });
  expect(joined.ok()).toBeTruthy();
  await mcp(request, 'join_team', { invite: t, name: 'Mo', role: 'observer' });
  // Cleo's board is gone (away)
  sql(`update pok_players_tbl set last_callback_time = current_timestamp - interval 100 second
        where team_id = '${safe(t)}' and id = '${safe(cleo.uid)}'`);
  sql(`update pok_teams_tbl set anonymous_mode = 1 where id = '${safe(t)}'`);

  // before the reveal: names are shown, so are away and via_ai
  let d = await dao(request, t, anna.uid);
  expect(d.all_players_ready).toBe(false);
  expect(flags(d.players)).toEqual({ Anna: false, Bob: true, Cleo: false });
  expect(d.players.find((p: any) => p.name === 'Cleo').away).toBe(true);
  expect(d.ai_count).toBe(2);
  expect(d.away_count).toBe(1);

  // revealed: names '******', away and via_ai false for all others, the counts stay; B-163: observers masked the same way
  sql(`update pok_players_tbl set card_key = 'five001' where team_id = '${safe(t)}' and player_type = 'PLAYER'`);
  d = await dao(request, t, anna.uid);
  expect(d.all_players_ready).toBe(true);
  for (const p of d.players) {
    expect(p.name).toBe('******');
    if (p.mkey !== d.card_mkey) expect([p.away, p.via_ai]).toEqual([false, false]);
  }
  expect(d.ai_count).toBe(2);
  expect(d.away_count).toBe(1);
  expect(d.observers).toEqual([{ name: '******', mkey: '', via_ai: false }]);

  // the MCP board of Bob: his own row keeps via_ai, the others are false; the counts tell
  const board = await mcp(request, 'get_board', { team_id: t, uid: bob.uid });
  const own = board.players.filter((p: any) => p.mkey === bob.mkey);
  const others = board.players.filter((p: any) => p.mkey !== bob.mkey);
  expect(own.map((p: any) => p.via_ai)).toEqual([true]);
  expect(others.map((p: any) => [p.away, p.via_ai])).toEqual([[false, false], [false, false]]);
  expect(board.ai_count).toBe(2);
  expect(board.away_count).toBe(1);
  expect(board.observers).toEqual([{ name: '******', mkey: null, via_ai: false }]);
});
