import { test, expect, APIRequestContext } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { asUser, joinAsPlayer, newPlayer, pickCard } from './helpers';

/**
 * B-151 PR C: wait_for_change (docs/mcp-concept.md, sections 5.3 and 8). The MCP request is not held by PHP: PHP hands
 * it via X-Accel-Redirect to poker-msg (/_mcp_wait/ -> 127.0.0.1:8445), which hands it back (/_mcp_result/) on a pull
 * of the team or at the deadline. Called like an AI client, with Playwright's request; changes come from a board in
 * the browser and from API writes.
 */

const MCP = '/mcp';
let rpcId = 0;

async function call(request: APIRequestContext, name: string, args: Record<string, unknown>, url = MCP) {
  const res = await request.post(url, {
    data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } },
    timeout: 40_000,
  });
  expect(res.status(), await res.text()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  expect(res.headers()['x-accel-redirect']).toBeUndefined(); // internal, never reaches the client
  const answer = await res.json();
  expect(answer.id).toBe(rpcId);                             // the original body is read again after the wait
  expect(answer.error, JSON.stringify(answer)).toBeUndefined();
  return answer.result as { content: { type: string; text: string }[]; structuredContent: any; isError?: boolean };
}

async function ok(request: APIRequestContext, name: string, args: Record<string, unknown>, url = MCP) {
  const result = await call(request, name, args, url);
  expect(result.isError, JSON.stringify(result)).toBeFalsy();
  return { data: result.structuredContent, text: result.content[0].text };
}

/** a team created over MCP: Anna (player) with her seat */
async function mcpTeam(request: APIRequestContext, name: string) {
  const { data } = await ok(request, 'create_team', { name, member_name: 'Anna', role: 'player' });
  return { seat: { team_id: data.team.id as string, uid: data.you.uid as string }, data };
}

async function timed<T>(work: Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const result = await work;
  return [result, Date.now() - start];
}

test('tools/list: wait_for_change with since, timeout and the seat; results with a board carry a version', async ({ request }) => {
  const res = await request.post(MCP, { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  const tools = (await res.json()).result.tools as any[];
  const wait = tools.find(tool => tool.name === 'wait_for_change');
  expect(Object.keys(wait.inputSchema.properties)).toEqual(['team_id', 'uid', 'api_key', 'since', 'timeout']);
  expect(wait.inputSchema.required).toEqual(['since']);
  expect(wait.inputSchema.properties.timeout).toMatchObject({ minimum: 1, maximum: 25, default: 25 });
  expect(wait.annotations.readOnlyHint).toBe(true);
  const init = await request.post(MCP, { data: { jsonrpc: '2.0', id: 2, method: 'initialize', params: {} } });
  expect((await init.json()).result.instructions).toContain('Stay at the table with wait_for_change');

  const { seat, data } = await mcpTeam(request, 'MCP Version');
  expect(data.version).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  const board = await ok(request, 'get_board', seat);
  expect(board.data.version).toBe(data.version);                   // same view, same version
  expect(board.text).toContain(`version (pass it as since to wait_for_change): ${data.version}`);
  expect(JSON.stringify(board.data.version)).not.toContain(seat.uid);

  // errors as for every tool: no seat, a removed seat, a malformed since
  const noSeat = await call(request, 'wait_for_change', { since: data.version });
  expect(noSeat.structuredContent.error).toBe('unauthorized');
  const gone = await call(request, 'wait_for_change', { ...seat, uid: 'ABCDEFGHIJKLMNOP', since: data.version });
  expect(gone.structuredContent.error).toBe('not_a_member');
  const bad = await call(request, 'wait_for_change', { ...seat, since: 'not a version!' });
  expect(bad.structuredContent).toMatchObject({ error: 'invalid_param', param: 'since' });
});

test('wakes within about a second when someone plays in the browser; the reveal and a note via the API', async ({ request, browser }) => {
  const { seat, data } = await mcpTeam(request, 'MCP Wait Wake');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, data.team.invite_link, 'Bob');
  const before = await ok(request, 'get_board', seat);

  // Bob plays while the agent waits
  const waiting = timed(ok(request, 'wait_for_change', { ...seat, since: before.data.version }));
  await bob.waitForTimeout(1_000);
  const played = Date.now();
  await pickCard(bob, 'five001');
  const [woke] = await waiting;
  expect(Date.now() - played).toBeLessThan(2_500);
  expect(woke.data).toMatchObject({ changed: true, changes: ['"Bob" played a card.', 'Waiting for: "Anna".'] });
  expect(woke.data.board.players.find((p: any) => p.name === 'Bob')).toMatchObject({ played: true, card: null });
  // one short line of what changed on top, then the table block
  expect(woke.text).toMatch(/^"Bob" played a card\. Waiting for: "Anna"\.\n\nMCP Wait Wake · voting · waiting for you\n/);
  expect(woke.text).toContain(`version (pass it as since to wait_for_change): ${woke.data.version}`);
  expect(woke.data.version).not.toBe(before.data.version);

  // since outdated: the answer comes at once
  const [again, quick] = await timed(ok(request, 'wait_for_change', { ...seat, since: before.data.version }));
  expect(quick).toBeLessThan(1_500);
  expect(again.data.changed).toBe(true);
  expect(again.data.version).toBe(woke.data.version);

  // Anna's card through the board API (another tab of hers): everyone has played -> revealed
  const waitReveal = timed(ok(request, 'wait_for_change', { ...seat, since: woke.data.version }));
  await bob.waitForTimeout(500);
  const setc = await request.post(`/api/setc.php?${new URLSearchParams({ t: seat.team_id, cardkey: 'three01' })}`,
    asUser(seat.uid));
  expect(setc.ok()).toBeTruthy();
  const [revealed, revealTime] = await waitReveal;
  expect(revealTime).toBeLessThan(3_000);
  expect(revealed.data.changes).toContain('Your card: "3".');
  expect(revealed.data.changes.find((c: string) => c.startsWith('Cards revealed: '))).toMatch(/3 ×1, 5 ×1/);
  expect(revealed.data.board.round.state).toBe('revealed');

  // a note through /api/v1 (browser mode of the REST API)
  const waitNote = ok(request, 'wait_for_change', { ...seat, since: revealed.data.version, timeout: 10 });
  await bob.waitForTimeout(500);
  const note = await request.put('/api/v1/team/note',
    { headers: { 'X-Poker-User': seat.uid, 'X-Poker-Team': seat.team_id }, data: { note: 'Sprint 7' } });
  expect(note.ok(), await note.text()).toBeTruthy();
  const noted = await waitNote;
  expect(noted.data.changes).toEqual(['Note changed: "Sprint 7".']);

  // a new round in the browser
  const waitRound = ok(request, 'wait_for_change', { ...seat, since: noted.data.version, timeout: 10 });
  await bob.waitForTimeout(500);
  const round = await request.post(`/api/newround.php?${new URLSearchParams({ t: seat.team_id })}`, asUser(seat.uid));
  expect(round.ok()).toBeTruthy();
  const next = await waitRound;
  expect(next.data.changes).toContain('New round started.');
  expect(next.data.board.round.state).toBe('voting');
});

test('timeout: unchanged board -> changed=false after the timeout, the own write does not wake it', async ({ request }) => {
  const { seat } = await mcpTeam(request, 'MCP Wait Timeout');
  // a write of the agent itself (here: a second seat joining) - its pull reaches poker-msg after the version
  const joined = await ok(request, 'join_team', { invite: seat.team_id, name: 'Cleo', role: 'observer' });
  const cleo = { team_id: seat.team_id, uid: joined.data.you.uid };
  const [result, took] = await timed(ok(request, 'wait_for_change', { ...cleo, since: joined.data.version, timeout: 2 }));
  expect(result.data).toMatchObject({ changed: false, version: joined.data.version, changes: [] });
  expect(result.data.board.observers.map((o: any) => o.name)).toEqual(['Cleo']);
  expect(result.text).toContain('Nothing changed at the table.');
  expect(took).toBeGreaterThanOrEqual(1_000);
  expect(took).toBeLessThan(5_000);
});

test('since of no version of ours: the whole board at once', async ({ request }) => {
  const { seat } = await mcpTeam(request, 'MCP Wait Since');
  const [result, took] = await timed(ok(request, 'wait_for_change', { ...seat, since: 'abc' }));
  expect(took).toBeLessThan(1_500);
  expect(result.data.changed).toBe(true);
  expect(result.data.changes).toEqual(['since was no version of this board: here is the whole board.']);
  expect(result.data.board.players.map((p: any) => p.name)).toEqual(['Anna']);
});

test('poker-msg not reachable: busy with retry_after, at once', async ({ request }) => {
  const { seat, data } = await mcpTeam(request, 'MCP Wait Down');
  // a test location of setup.sh: /mcp, but the wait goes to a port without poker-msg -> @mcp_wait_failed
  const [result, took] = await timed(ok(request, 'wait_for_change', { ...seat, since: data.version },
    '/_e2e/mcp-msg-down'));
  expect(took).toBeLessThan(2_000);
  expect(result.data).toEqual({ changed: false, busy: true, retry_after: 5, version: data.version });
  expect(result.text).toContain('busy');
});

test('the internal locations are not reachable from outside', async ({ request }) => {
  for (const path of ['/_mcp_wait/0123456789abcdef0123456789abcdef/1700000000000/1700000025/1',
                      '/_mcp_result/1700000025/1?r=pull']) {
    expect((await request.get(path)).status()).toBe(404);
  }
});

test('access log: only POST /mcp, no uid, team id or team hash', async ({ request }) => {
  const log = `${process.env.E2E_DIR ?? '/tmp/poker-e2e'}/logs/nginx-access.log`;
  test.skip(!existsSync(log), 'no access log of setup.sh');
  const { seat, data } = await mcpTeam(request, 'MCP Wait Log');
  await ok(request, 'wait_for_change', { ...seat, since: data.version, timeout: 1 });
  const hash = (await import('crypto')).createHash('sha256').update(seat.team_id).digest('hex').slice(0, 32);
  await expect.poll(() => readFileSync(log, 'utf8')).toMatch(/"POST \/mcp HTTP/);
  const text = readFileSync(log, 'utf8');
  expect(text).not.toContain(seat.uid);
  expect(text).not.toContain(seat.team_id);
  expect(text).not.toContain(hash);
});
