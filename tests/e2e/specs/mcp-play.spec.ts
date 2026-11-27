import { test, expect, APIRequestContext } from '@playwright/test';
import {
  UID_HEADER, createTeam, expectTableCard, getSid, joinAsPlayer, newPlayer, pickCard, tableCard, userRequest, v1CreateKey,
} from './helpers';

/**
 * B-151 PR D: the MCP tools play_card, round and me (docs/mcp-concept.md 5.3) - same core functions as the board
 * (setc.php, newround.php, delete.php, name.php, delete_user.php). Called like an AI client would, with Playwright's
 * request; a board in the browser shows the effect.
 */

const MCP = '/mcp';
let rpcId = 0;

type ToolResult = { content: { type: string; text: string }[]; structuredContent: any; isError?: boolean };

async function call(request: APIRequestContext, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const res = await request.post(MCP, { data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } } });
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

async function fails(request: APIRequestContext, name: string, args: Record<string, unknown>, error: string, param?: string) {
  const result = await call(request, name, args);
  expect(result.isError, JSON.stringify(result)).toBe(true);
  expect(result.structuredContent).toMatchObject(param === undefined ? { error } : { error, param });
  return result.structuredContent as { error: string; message: string; param?: string };
}

/** a board in the browser with Alice, and Anna at the same table through MCP */
async function tableWithAgent(browser: any, request: APIRequestContext, teamName: string) {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, teamName);
  await joinAsPlayer(alice, url, 'Alice');
  const t = new URL(url).searchParams.get('t') as string;
  const anna = (await ok(request, 'join_team', { invite: url, name: 'Anna', role: 'player' })).data.you;
  await expectTableCard(alice, 'Anna', 'prgrss1');
  return { alice, url, t, seat: { team_id: t, uid: anna.uid as string }, mkey: anna.mkey as string };
}

test('tools/list: play_card, round and me with their actions', async ({ request }) => {
  const res = await request.post(MCP, { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  const tools = (await res.json()).result.tools as any[];
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
  expect(byName.play_card.inputSchema.properties.action.enum).toEqual(['play', 'withdraw']);
  expect(byName.round.inputSchema.properties.action.enum).toEqual(['new_round', 'remove_player']);
  expect(byName.me.inputSchema.properties.action.enum)
    .toEqual(['rename', 'set_role', 'leave', 'end_session', 'api_keys', 'delete_key', 'delete_my_data']);
  for (const name of ['play_card', 'round', 'me']) {
    expect(byName[name].inputSchema.required).toEqual(['action']);
    expect(byName[name].annotations.readOnlyHint).toBe(false);
    expect(Object.keys(byName[name].inputSchema.properties).slice(0, 3)).toEqual(['team_id', 'uid', 'api_key']);
  }
  expect(Object.keys(byName.play_card.inputSchema.properties)).toEqual(['team_id', 'uid', 'api_key', 'action', 'card']);
  expect(byName.me.description).toContain('delete_my_data is NOT possible when you act with an api_key');
  expect(byName.me.annotations.destructiveHint).toBe(true);
  expect(byName.me.inputSchema.properties.key_id.type).toBe('string'); // numbers are accepted all the same

  const init = await request.post(MCP, { data: { jsonrpc: '2.0', id: 2, method: 'initialize', params: {} } });
  const instructions = (await init.json()).result.instructions as string;
  expect(instructions).toContain('play_card only after the user named it');
  // B-151 end session: "stop" = end_session (like closing the tab), never delete_my_data unless asked
  const flat = instructions.replace(/\s+/g, ' ');
  expect(flat).toContain('When the user says stop, bye, end, stop watching, close or similar, call me end_session');
  expect(flat).toContain('leave = stop playing but stay at the table as observer');
  expect(flat).toContain('ONLY when the user explicitly asks to delete their data');
  expect(byName.me.description).toContain('end_session (End session, like closing the tab');
  expect(byName.wait_for_change.description).toContain('call me end_session');
  expect(byName.show_board.description).toContain('do NOT call show_board afterwards');
});

test('play_card and round new_round: play, change, reveal with two players, withdraw, hidden cards', async ({ request, browser }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Play');

  await fails(request, 'play_card', { ...seat }, 'missing_param', 'action');
  await fails(request, 'play_card', { ...seat, action: 'play' }, 'missing_param', 'card');
  const invalid = await fails(request, 'play_card', { ...seat, action: 'play', card: '99' }, 'invalid_card', 'card');
  expect(invalid.message).toContain('"13"');
  await fails(request, 'play_card', { ...seat, action: 'play', card: 'late001' }, 'invalid_card');
  await fails(request, 'play_card', { ...seat, action: 'reveal' }, 'invalid_param', 'action');

  // the value as shown: the browser sees a card down, but not which
  const played = await ok(request, 'play_card', { ...seat, action: 'play', card: '5' });
  expect(played.data.message).toBe('You played "5".');
  expect(played.data.you.card).toBe('5');
  expect(played.data.board.round).toEqual({ state: 'voting', waiting_for: ['Alice'], result: null });
  expect(played.text).toMatch(/^  You +5   \(hidden from others\)$/m);
  await expectTableCard(alice, 'Anna', 'done001');

  // change it, by its key
  expect((await ok(request, 'play_card', { ...seat, action: 'play', card: 'eight01' })).data.you.card).toBe('8');

  // Alice plays: two players, two cards -> revealed by itself
  await pickCard(alice, 'thrtn01');
  const revealed = await ok(request, 'get_board', seat);
  expect(revealed.data.round.state).toBe('revealed');
  expect(revealed.data.round.result.text).toBe('8 ×1, 13 ×1');
  await expectTableCard(alice, 'Anna', 'eight01');

  // after the reveal a change is still possible; taking the card back covers the round again
  expect((await ok(request, 'play_card', { ...seat, action: 'play', card: '3' })).data.board.round.result.text)
    .toBe('3 ×1, 13 ×1');
  await expectTableCard(alice, 'Anna', 'three01');
  const withdrawn = await ok(request, 'play_card', { ...seat, action: 'withdraw' });
  expect(withdrawn.data.you.card).toBeNull();
  expect(withdrawn.data.board.round).toEqual({ state: 'voting', waiting_for: ['Anna'], result: null });
  expect(withdrawn.data.board.players.map((p: any) => p.card)).toEqual([null, null]); // Alice's card is hidden again
  await expectTableCard(alice, 'Anna', 'prgrss1');

  // new round: all cards up, also Alice's in the browser
  const fresh = await ok(request, 'round', { ...seat, action: 'new_round' });
  expect(fresh.data.message).toContain('New round');
  expect(fresh.data.board.players.every((p: any) => !p.played)).toBe(true);
  await expectTableCard(alice, 'Alice', 'prgrss1');

  // Alice plays first: the agent only sees that she played
  await pickCard(alice, 'twnty01');
  const voting = await ok(request, 'get_board', seat);
  expect(voting.data.players.find((p: any) => p.name === 'Alice')).toMatchObject({ played: true, card: null });
  expect(voting.data.players.map((p: any) => p.card)).toEqual([null, null]);
  expect(voting.text).toMatch(/^  Alice +played$/m);
  expect(voting.text.split('\n').filter((l: string) => !l.includes('pick:')).join('\n')).not.toContain('20');
});

test('round remove_player and the role rules of play_card; me rename, set_role, leave', async ({ request, browser }) => {
  const { alice, seat, mkey } = await tableWithAgent(browser, request, 'MCP Round');
  const bob = (await ok(request, 'join_team', { invite: seat.team_id, name: 'Bob', role: 'player' })).data.you;
  const bobSeat = { team_id: seat.team_id, uid: bob.uid };
  await ok(request, 'join_team', { invite: seat.team_id, name: 'Cleo', role: 'observer' });
  await expectTableCard(alice, 'Bob', 'prgrss1');

  await fails(request, 'round', { ...seat, action: 'remove_player' }, 'missing_param', 'player');
  await fails(request, 'round', { ...seat, action: 'remove_player', player: 'Cleo' }, 'player_not_found'); // observer
  await fails(request, 'round', { ...seat, action: 'remove_player', player: 'Nobody' }, 'player_not_found');
  await fails(request, 'round', { ...seat, action: 'remove_player', player: '99999999' }, 'player_not_found');

  // by name: Bob leaves the table, the browser shows it, he may not play any more
  const removed = await ok(request, 'round', { ...seat, action: 'remove_player', player: 'Bob' });
  expect(removed.data.message).toBe('"Bob" was taken off the table.');
  expect(removed.data.board.players.map((p: any) => p.name).sort()).toEqual(['Alice', 'Anna']);
  await expect(tableCard(alice, 'Bob')).toHaveCount(0);
  const refused = await fails(request, 'play_card', { ...bobSeat, action: 'play', card: '5' }, 'role_not_allowed');
  expect(refused.message).toContain('no longer at the table');
  await fails(request, 'play_card', { ...bobSeat, action: 'withdraw' }, 'role_not_allowed');

  // a removed person may still do everything else, and comes back with set_role
  const back = await ok(request, 'me', { ...bobSeat, action: 'set_role', role: 'player' });
  expect(back.data.you).toMatchObject({ name: 'Bob', role: 'player' });
  await expectTableCard(alice, 'Bob', 'prgrss1');
  await ok(request, 'play_card', { ...bobSeat, action: 'play', card: '1' });
  // by mkey
  await ok(request, 'round', { ...seat, action: 'remove_player', player: bob.mkey });
  await expect(tableCard(alice, 'Bob')).toHaveCount(0);

  // observer: no card
  await fails(request, 'me', { ...seat, action: 'set_role' }, 'missing_param', 'role');
  const observer = await ok(request, 'me', { ...seat, action: 'set_role', role: 'observer' });
  expect(observer.data.you.role).toBe('observer');
  expect(observer.text).toMatch(/^Observers: .*\bYou\b/m);
  await expect(tableCard(alice, 'Anna')).toHaveCount(0);
  const noCard = await fails(request, 'play_card', { ...seat, action: 'play', card: '5' }, 'role_not_allowed');
  expect(noCard.message).toContain('Observers cannot play cards');

  // rename (role stays), back as player, leave
  await fails(request, 'me', { ...seat, action: 'rename', name: 'A'.repeat(16) }, 'invalid_param', 'name');
  const renamed = await ok(request, 'me', { ...seat, action: 'rename', name: 'Annie' });
  expect(renamed.data.you).toEqual({ name: 'Annie', role: 'observer', mkey, card: null, card_key: null });
  await ok(request, 'me', { ...seat, action: 'set_role', role: 'player' });
  await expectTableCard(alice, 'Annie', 'prgrss1');
  const left = await ok(request, 'me', { ...seat, action: 'leave' });
  expect(left.data.you.role).toBe('removed');
  expect(left.text).toContain('You left the table: you no longer play, the others see you as observer.');
  expect(left.text).toContain('You (not at the table - others see you as observer; me set_role to come back)');
  expect(left.text).not.toMatch(/^Observers: .*You/m);
  expect(left.text).not.toContain('browser seat'); // only with an API key
  await expect(tableCard(alice, 'Annie')).toHaveCount(0);
  // still a seat: renaming keeps it removed
  expect((await ok(request, 'me', { ...seat, action: 'rename', name: 'Anna' })).data.you)
    .toMatchObject({ name: 'Anna', role: 'removed' });
});

test('me with an API key: api_keys, delete_my_data refused (browser_only), delete_key current ends the access', async ({ request, browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'MCP Me Key');
  await joinAsPlayer(alice, url, 'Alice');
  const t = new URL(url).searchParams.get('t') as string;
  const uid = await getSid(alice);
  const created = await v1CreateKey(request, { headers: { [UID_HEADER]: uid, 'X-Poker-Team': t } }, 'AI');
  const key = { api_key: created.key };

  const keys = await ok(request, 'me', { ...key, action: 'api_keys' });
  expect(keys.data.keys).toEqual([expect.objectContaining({ id: created.id, name: 'AI', current: true })]);
  expect(keys.text).toContain(`key_id ${created.id}: "AI"`);
  expect(keys.text).toContain('(the key you are using)');
  expect(keys.text).not.toContain(created.key);

  const refused = await fails(request, 'me', { ...key, action: 'delete_my_data' }, 'browser_only');
  expect(refused.message).toContain('leave');
  expect(refused.message).toContain('delete_key with key_id "current"');
  expect(refused.message).toContain('Delete my data');
  await expectTableCard(alice, 'Alice', 'prgrss1'); // nothing deleted

  // leave with a key: the user's browser seat left the table too - say so; back with set_role
  const leftKey = await ok(request, 'me', { ...key, action: 'leave' });
  expect(leftKey.text).toContain('that seat left the table too');
  await ok(request, 'me', { ...key, action: 'set_role', role: 'player' });
  await expectTableCard(alice, 'Alice', 'prgrss1');

  await fails(request, 'me', { ...key, action: 'delete_key', key_id: '999999' }, 'key_not_found');
  await fails(request, 'me', { ...key, action: 'delete_key', key_id: 'all' }, 'invalid_param', 'key_id');
  await fails(request, 'me', { ...key, action: 'delete_key', key_id: 0 }, 'invalid_param', 'key_id');
  await fails(request, 'me', { ...key, action: 'delete_key', key_id: 999999 }, 'key_not_found'); // a number works too
  // a second key, deleted by its id as JSON number
  const second = await v1CreateKey(request, { headers: { [UID_HEADER]: uid, 'X-Poker-Team': t } }, 'Other');
  const byNumber = await ok(request, 'me', { ...key, action: 'delete_key', key_id: second.id });
  expect(byNumber.data.message).toBe(`API key ${second.id} is deleted.`);
  expect(byNumber.data.keys.map((k: any) => k.id)).toEqual([created.id]);
  // a seat without key has no current key
  const anna = (await ok(request, 'join_team', { invite: url, name: 'Anna', role: 'observer' })).data.you;
  await fails(request, 'me', { team_id: t, uid: anna.uid, action: 'delete_key', key_id: 'current' }, 'invalid_param', 'key_id');

  const gone = await ok(request, 'me', { ...key, action: 'delete_key', key_id: 'current' });
  expect(gone.data.message).toContain('your access ends now');
  await fails(request, 'get_board', key, 'invalid_key');
  await expectTableCard(alice, 'Alice', 'prgrss1'); // the browser seat stays
});

test('me delete_my_data with the own seat deletes the person; the seat is gone', async ({ request, browser }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Delete');
  await ok(request, 'play_card', { ...seat, action: 'play', card: '5' });
  const deleted = await ok(request, 'me', { ...seat, action: 'delete_my_data' });
  expect(deleted.data.message).toContain('All data of the user is deleted (1 team)');
  expect(deleted.data.board).toBeUndefined();
  await expect(tableCard(alice, 'Anna')).toHaveCount(0);
  await fails(request, 'get_board', seat, 'not_a_member');
  await fails(request, 'me', { ...seat, action: 'delete_my_data' }, 'not_a_member');
});

/** dao.php as the browser of Alice sees it (players with away, connected observers) */
async function daoOf(request: APIRequestContext, t: string, id: string) {
  const { query, options } = userRequest({ t, id });
  const res = await request.get(`/api/dao.php?${query}`, options);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test('me end_session: like closing the tab - player away, observer and removed seat gone at once, the next call reconnects', async ({ request, browser }) => {
  const { alice, url, t, seat } = await tableWithAgent(browser, request, 'MCP End');
  const aliceId = await getSid(alice);
  const olli = (await ok(request, 'join_team', { invite: url, name: 'Olli', role: 'observer' })).data.you;
  const olliSeat = { team_id: t, uid: olli.uid as string };
  await ok(request, 'play_card', { ...seat, action: 'play', card: '5' });
  const before = await daoOf(request, t, aliceId);
  expect(before.players.find((p: any) => p.name === 'Anna')).toMatchObject({ away: false, via_ai: true });
  expect(before.observers.map((o: any) => o.name)).toEqual(['Olli']);

  // the player: away at once, the card stays, no AI symbol; the result says so and tells the agent to stop
  const ended = await ok(request, 'me', { ...seat, action: 'end_session' });
  expect(ended.data.ended).toBe(true);
  expect(ended.text).toContain('Session ended, like closing the browser tab');
  expect(ended.text).toContain('the others see you as away');
  expect(ended.text).toContain('nothing was deleted');
  let dao = await daoOf(request, t, aliceId);
  expect(dao.players.find((p: any) => p.name === 'Anna')).toMatchObject({ away: true, via_ai: false });
  await expectTableCard(alice, 'Anna', 'done001'); // card still down

  // a live loop of this seat stops: wait_for_change answers ended at once and does not reconnect
  const t0 = Date.now();
  const stopped = await ok(request, 'wait_for_change', { ...seat, since: ended.data.version, timeout: 10 });
  expect(Date.now() - t0).toBeLessThan(3_000);
  expect(stopped.data).toMatchObject({ ended: true, changed: false });
  expect(stopped.data.board).toBeUndefined();
  expect(stopped.text).toContain('Stop calling wait_for_change');
  expect((await daoOf(request, t, aliceId)).players.find((p: any) => p.name === 'Anna').away).toBe(true);

  // the next real call reconnects (like opening the link again): present, same seat, same card
  const back = await ok(request, 'get_board', seat);
  expect(back.data.you).toMatchObject({ name: 'Anna', role: 'player', card: '5' });
  dao = await daoOf(request, t, aliceId);
  expect(dao.players.find((p: any) => p.name === 'Anna')).toMatchObject({ away: false, via_ai: true });
  const waiting = await call(request, 'wait_for_change', { ...seat, since: back.data.version, timeout: 1 });
  expect(waiting.structuredContent.ended).toBeUndefined();

  // an observer drops out of the observer list at once
  await ok(request, 'me', { ...olliSeat, action: 'end_session' });
  expect((await daoOf(request, t, aliceId)).observers).toEqual([]);
  await ok(request, 'get_board', olliSeat);
  expect((await daoOf(request, t, aliceId)).observers.map((o: any) => o.name)).toEqual(['Olli']);

  // a removed seat (left the table, B-154 observer for the others) too
  await ok(request, 'me', { ...seat, action: 'leave' });
  expect((await daoOf(request, t, aliceId)).observers.map((o: any) => o.name)).toEqual(['Anna', 'Olli']);
  const endRemoved = await ok(request, 'me', { ...seat, action: 'end_session' });
  expect(endRemoved.text).toContain('you drop out of the observers');
  expect((await daoOf(request, t, aliceId)).observers.map((o: any) => o.name)).toEqual(['Olli']);
  // nothing deleted: the seat comes back as it was
  expect((await ok(request, 'get_board', seat)).data.you).toMatchObject({ name: 'Anna', role: 'removed' });
  expect((await daoOf(request, t, aliceId)).observers.map((o: any) => o.name)).toEqual(['Anna', 'Olli']);
});
