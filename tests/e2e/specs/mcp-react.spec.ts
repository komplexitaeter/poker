import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { createTeam, expectTableCard, joinAsPlayer, newPlayer } from './helpers';

/**
 * B-151 PR F2: the MCP tool react (docs/mcp-concept.md 5.3, 8.6). PHP answers with X-Accel-Redirect /_mcp_react/...,
 * nginx proxies it to poker-msg, which checks the limits of the web (each emoji once per UTC day and thrower, 3 per
 * second, 10 per minute; the nudge only the rate), sends "react:<from>:<to>:<code>" to the boards of the team and
 * hands the result back (r=ok|rate|quota, used=...). poker-msg not reachable -> busy.
 */

const MCP = '/mcp';
let rpcId = 0;

type ToolResult = { content: { type: string; text: string }[]; structuredContent: any; isError?: boolean };

async function call(request: APIRequestContext, name: string, args: Record<string, unknown> = {}, path = MCP): Promise<ToolResult> {
  const res = await request.post(path, { data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } } });
  expect(res.status(), await res.text()).toBe(200);
  const answer = await res.json();
  expect(answer.error, JSON.stringify(answer)).toBeUndefined();
  return answer.result;
}

async function ok(request: APIRequestContext, name: string, args: Record<string, unknown> = {}) {
  const result = await call(request, name, args);
  expect(result.isError, JSON.stringify(result)).toBeFalsy();
  return { data: result.structuredContent, text: result.content[0].text };
}

async function fails(request: APIRequestContext, name: string, args: Record<string, unknown>, error: string, param?: string,
                     path = MCP) {
  const result = await call(request, name, args, path);
  expect(result.isError, JSON.stringify(result)).toBe(true);
  expect(result.structuredContent).toMatchObject(param === undefined ? { error } : { error, param });
  return result.structuredContent as { error: string; message: string };
}

/** records the reaction messages a board receives over its WebSocket */
async function recordReceived(page: Page): Promise<() => Promise<string[]>> {
  // gConn is a global let of connection.js (not on window): evaluated as a script
  await page.evaluate(`window.gotReact = []; gConn.addEventListener('message', e => {
    if (String(e.data).startsWith('react:')) window.gotReact.push(String(e.data));
  });`);
  return () => page.evaluate(() => ((window as unknown as { gotReact: string[] }).gotReact ?? []).slice());
}

/** Alice in the browser, Anna through MCP at the same table */
async function tableWithAgent(browser: any, request: APIRequestContext, teamName: string) {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, teamName);
  await joinAsPlayer(alice, url, 'Alice');
  await expect.poll(() => alice.evaluate('gConn !== null && gConn.readyState === 1')).toBe(true);
  const t = new URL(url).searchParams.get('t') as string;
  const anna = (await ok(request, 'join_team', { invite: url, name: 'Anna', role: 'player' })).data;
  await expectTableCard(alice, 'Anna', 'prgrss1');
  const aliceMkey = anna.board.players.find((p: any) => p.name === 'Alice').mkey as string;
  return { alice, seat: { team_id: t, uid: anna.you.uid as string }, annaMkey: anna.you.mkey as string, aliceMkey };
}

test('react: thrown at a person, the browser receives it; used up today; errors', async ({ browser, request }) => {
  const { alice, seat, annaMkey, aliceMkey } = await tableWithAgent(browser, request, 'MCP React');
  const received = await recordReceived(alice);

  const heart = await ok(request, 'react', { ...seat, to: 'Alice', emoji: 'heart' });
  expect(heart.data).toEqual({ sent: true, reason: null, emoji: 'heart', to: { mkey: aliceMkey, name: 'Alice' },
    left_today: { cake: 1, heart: 0, clap: 1, party: 1, think: 1, thumbs: 1, fish: 1 } });
  expect(heart.text).toContain('You threw ❤️ heart at "Alice"');
  // the board gets the same message as from a browser: from = Anna's mkey (set by the server, not by the agent)
  await expect.poll(received).toContain(`react:${annaMkey}:${aliceMkey}:heart`);

  // the fish: once a day, never more (poker-msg counts per thrower)
  expect((await ok(request, 'react', { ...seat, to: aliceMkey, emoji: 'fish' })).data.sent).toBe(true);
  const again = await ok(request, 'react', { ...seat, to: aliceMkey, emoji: 'fish' });
  expect(again.data).toMatchObject({ sent: false, reason: 'used_today', left_today: { fish: 0, heart: 0, cake: 1 } });
  expect(again.text).toContain('back tomorrow');
  await alice.waitForTimeout(300);
  expect((await received()).filter(m => m.endsWith(':fish'))).toHaveLength(1);

  // the nudge is anonymous (from 0, like the board) and has no daily limit
  await alice.waitForTimeout(1100); // clear of the rate limit of the second
  const nudged = await ok(request, 'react', { ...seat, to: 'Alice', emoji: 'nudge' });
  expect(nudged.data.sent).toBe(true);
  expect(nudged.data.left_today).toBeUndefined(); // thrown as 0: poker-msg's used is not the user's
  expect(nudged.text).not.toContain('Left today');
  await expect.poll(received).toContain(`react:0:${aliceMkey}:nudge`);

  await fails(request, 'react', { ...seat, to: 'Nobody', emoji: 'cake' }, 'player_not_found', 'to');
  await fails(request, 'react', { ...seat, to: annaMkey, emoji: 'cake' }, 'invalid_param', 'to');
  await fails(request, 'react', { ...seat, to: 'Alice', emoji: 'pull' }, 'invalid_param', 'emoji');
  await fails(request, 'react', { ...seat, emoji: 'cake' }, 'missing_param', 'to');
  // nothing of that was thrown
  expect((await received()).filter(m => m.endsWith(':cake'))).toHaveLength(0);
});

test('react: at most 3 per second (rate), nothing counted then', async ({ browser, request }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP React Rate');
  const received = await recordReceived(alice);
  const results = [];
  for (const emoji of ['cake', 'clap', 'party', 'think']) results.push((await ok(request, 'react', { ...seat, to: 'Alice', emoji })).data);
  expect(results.slice(0, 3).map(r => r.sent)).toEqual([true, true, true]);
  expect(results[3]).toMatchObject({ sent: false, reason: 'too_fast', left_today: { think: 1, cake: 0 } });
  await alice.waitForTimeout(300);
  expect((await received()).filter(m => m.endsWith(':think'))).toHaveLength(0);
  // a second later the same emoji goes out (the dropped throw was not counted)
  await alice.waitForTimeout(1100);
  expect((await ok(request, 'react', { ...seat, to: 'Alice', emoji: 'think' })).data.sent).toBe(true);
});

test('react: poker-msg not reachable -> busy, the internal locations are closed', async ({ browser, request }) => {
  const { seat } = await tableWithAgent(browser, request, 'MCP React Down');
  // a test location of setup.sh: /mcp, but the throw goes to a port without poker-msg -> @mcp_react_failed
  const err = await fails(request, 'react', { ...seat, to: 'Alice', emoji: 'cake' }, 'busy', undefined, '/_e2e/mcp-msg-down');
  expect(err.message).toContain('Nothing was thrown');
  for (const path of ['/_mcp_react/0123456789abcdef0123456789abcdef/1/2/cake', '/_mcp_result/react?r=ok&used=']) {
    expect((await request.get(path)).status()).toBe(404);
  }
});

test('react in anonymous mode after the reveal: nobody can be targeted, players and observers are masked (B-163)', async ({ browser, request }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP React Anon');
  const t = seat.team_id;
  await ok(request, 'join_team', { invite: t, name: 'Olga', role: 'observer' });
  const anon = await request.post(`/api/update_team.php?${new URLSearchParams({ t, anonymous_request_toggle: '1' })}`,
    { headers: { 'X-Poker-User': seat.uid } });
  expect(anon.ok()).toBeTruthy();
  // the anonymous mode starts with the next round
  expect((await request.post(`/api/newround.php?${new URLSearchParams({ t })}`, { headers: { 'X-Poker-User': seat.uid } })).ok()).toBeTruthy();
  await ok(request, 'play_card', { ...seat, action: 'play', card: '5' });
  await alice.locator('#ctl .ctl[data-card="eight01"]').click();
  await expect(alice.locator('#round_status')).toHaveText('revealed');

  const board = (await ok(request, 'get_board', seat)).data;
  expect(board.observers).toEqual([{ name: '******', mkey: null, via_ai: false }]);
  expect(board.players.filter((p: any) => p.mkey !== null)).toHaveLength(1); // only the own one
  const received = await recordReceived(alice);
  for (const to of ['Olga', 'Alice']) await fails(request, 'react', { ...seat, to, emoji: 'heart' }, 'player_not_found', 'to');
  await alice.waitForTimeout(300);
  expect(await received()).toEqual([]);
});
