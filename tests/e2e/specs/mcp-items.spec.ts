import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { createTeam, expectTableCard, joinAsPlayer, newPlayer, pickCard } from './helpers';

/**
 * B-151 PR E: the MCP tools items and board_settings (docs/mcp-concept.md 5.3) - same core functions as the board
 * (topic_item_*.php, update_team.php, update_results_order.php, update_show_avg.php, update_topic.php). Called like an
 * AI client would, with Playwright's request; a board in the browser shows the effect.
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

/** the board state the browser shows last (dao.php answer) */
const shown = (page: Page, expression: string) => expect.poll(() => page.evaluate(`gLastJson && (${expression})`));

/** a board in the browser with Alice, and Anna at the same table through MCP */
async function tableWithAgent(browser: any, request: APIRequestContext, teamName: string) {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, teamName);
  await joinAsPlayer(alice, url, 'Alice');
  const t = new URL(url).searchParams.get('t') as string;
  const anna = (await ok(request, 'join_team', { invite: url, name: 'Anna', role: 'player' })).data.you;
  await expectTableCard(alice, 'Anna', 'prgrss1');
  return { alice, url, t, seat: { team_id: t, uid: anna.uid as string } };
}

test('tools/list: items and board_settings with their actions', async ({ request }) => {
  const res = await request.post(MCP, { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  const tools = (await res.json()).result.tools as any[];
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
  expect(byName.items.inputSchema.properties.action.enum)
    .toEqual(['list', 'get', 'add', 'edit', 'move', 'next', 'set_result', 'reopen', 'delete']);
  expect(byName.board_settings.inputSchema.properties.action.enum).toEqual(['set_note', 'rename', 'set']);
  for (const name of ['items', 'board_settings']) {
    expect(byName[name].inputSchema.required).toEqual(['action']);
    expect(byName[name].annotations.readOnlyHint).toBe(false);
  }
  expect(byName.items.annotations.destructiveHint).toBe(true);
  expect(byName.items.description).toContain('ask the user first');
  expect(byName.items.description).toContain('close_empty = done without a value');
  expect(byName.items.inputSchema.properties.key.description).toContain('Required for get, edit');
  expect(byName.items.inputSchema.properties.mode.enum).toEqual(['close', 'close_empty', 'later']);
  expect(Object.keys(byName.board_settings.inputSchema.properties)).toEqual(['team_id', 'uid', 'api_key', 'action',
    'note', 'name', 'anonymous', 'results_order', 'show_average', 'show_tips', 'show_card_changes']);

  const init = await request.post(MCP, { data: { jsonrpc: '2.0', id: 2, method: 'initialize', params: {} } });
  expect((await init.json()).result.instructions).toContain('Before items next with mode close');

  // the public REST API stays as it is: the new routes are not in the spec
  const spec = await (await request.get('/api/v1/openapi.json')).json();
  expect(Object.keys(spec.paths).sort()).toEqual(['/items', '/items/{key}', '/items/{key}/reopen', '/keys', '/keys/current',
    '/keys/{id}', '/team', '/team/note', '/teams', '/teams/{team_id}/members']);
  expect(Object.keys(spec.paths['/items/{key}'])).toEqual(['put', 'get', 'delete']);
  const allow = await request.fetch('/api/v1/team', { method: 'PUT', data: {} });
  expect(allow.headers()['allow']).toBe('GET');
});

test('items add, edit, move, list, get, delete - the browser shows it', async ({ request, browser }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Items');

  await fails(request, 'items', { ...seat, action: 'add' }, 'missing_param', 'heading');
  const first = await ok(request, 'items', { ...seat, action: 'add', heading: 'Login with SSO', key: 'TIX-1',
    description: 'As a user …', maturity: 'rough' });
  expect(first.data.message).toBe('Item TIX-1 "Login with SSO" added. It is the active item now.');
  expect(first.data.item).toMatchObject({ key: 'TIX-1', status: 'open', active: true, position: 1, result: null });
  expect(first.data.board.active_item).toMatchObject({ key: 'TIX-1', heading: 'Login with SSO' });
  expect(first.data.version).toBeTruthy();
  await shown(alice, 'gLastJson.topic_items.active && gLastJson.topic_items.active.heading').toBe('Login with SSO');
  await fails(request, 'items', { ...seat, action: 'add', heading: 'Again', key: 'tix-1' }, 'key_taken');

  const second = await ok(request, 'items', { ...seat, action: 'add', heading: 'Password reset' });
  expect(second.data.item.key).toBe('TIX-2'); // suggested
  const third = await ok(request, 'items', { ...seat, action: 'add', heading: 'Profile page', position: 1 });
  expect(third.data.item).toMatchObject({ position: 1, active: true });
  await shown(alice, 'gLastJson.topic_items.active.heading').toBe('Profile page');

  // edit: only what is passed changes
  await fails(request, 'items', { ...seat, action: 'edit', key: 'TIX-2' }, 'missing_param');
  const edited = await ok(request, 'items', { ...seat, action: 'edit', key: 'TIX-2', heading: 'Reset password',
    new_key: 'TIX-20', maturity: 'ready' });
  expect(edited.data.message).toBe('Item TIX-20 "Reset password" changed.');
  expect(edited.data.item).toMatchObject({ key: 'TIX-20', heading: 'Reset password', description: null });
  await fails(request, 'items', { ...seat, action: 'edit', key: 'TIX-2', heading: 'x' }, 'item_not_found');

  // move: position 1 makes it active
  await fails(request, 'items', { ...seat, action: 'move', key: 'TIX-20' }, 'missing_param', 'position');
  const moved = await ok(request, 'items', { ...seat, action: 'move', key: 'TIX-20', position: 1 });
  expect(moved.data.message).toBe('Item TIX-20 "Reset password" moved. It is the active item now.');
  await shown(alice, 'gLastJson.topic_items.active.heading').toBe('Reset password');
  expect((await ok(request, 'items', { ...seat, action: 'move', key: 'TIX-20', position: 99 })).data.item.position).toBe(3);

  const list = await ok(request, 'items', { ...seat, action: 'list' });
  expect(list.data.items.map((item: any) => item.key)).toEqual(['TIX-3', 'TIX-1', 'TIX-20']);
  expect(list.data.open_count).toBe(3);
  expect(list.text).toContain('Items: 3 open, 0 done');
  const got = await ok(request, 'items', { ...seat, action: 'get', key: 'tix-1' });
  expect(got.data).toMatchObject({ key: 'TIX-1', description: 'As a user …', status: 'open' });
  expect(got.text).toContain('Description: "As a user …"');

  const deleted = await ok(request, 'items', { ...seat, action: 'delete', key: 'TIX-20' });
  expect(deleted.data.message).toBe('Item TIX-20 "Reset password" deleted.');
  expect(deleted.data.board.open_count).toBe(2);
  await shown(alice, 'gLastJson.topic_items.open_count').toBe(2);
  await fails(request, 'items', { ...seat, action: 'delete', key: 'TIX-20' }, 'item_not_found');
});

test('items next (close with card, automatic, close_empty, later), set_result, reopen', async ({ request, browser }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Next');
  await fails(request, 'items', { ...seat, action: 'next' }, 'no_active_item');
  await ok(request, 'items', { ...seat, action: 'add', heading: 'One', key: 'TIX-1' });
  for (const heading of ['Two', 'Three', 'Four']) await ok(request, 'items', { ...seat, action: 'add', heading });

  // a revealed round: Anna 5, Alice 8 - result automatically 8, the agent picks 5
  await ok(request, 'play_card', { ...seat, action: 'play', card: '5' });
  await pickCard(alice, 'eight01');
  await fails(request, 'items', { ...seat, action: 'next', key: 'TIX-2' }, 'item_not_active');
  await fails(request, 'items', { ...seat, action: 'next', mode: 'later', card: '5' }, 'invalid_param', 'card');
  await fails(request, 'items', { ...seat, action: 'next', card: '99' }, 'invalid_card', 'card');
  const preview = await ok(request, 'items', { ...seat, action: 'get', key: 'TIX-1' });
  expect(preview.data.result).toMatchObject({ value: '8', chosen: false, votes_text: '5 ×1, 8 ×1' });

  const closed = await ok(request, 'items', { ...seat, action: 'next', key: 'TIX-1', card: '5' });
  expect(closed.data.message).toBe('Item TIX-1 "One" is done with "5". New round. Active now: TIX-2 "Two".');
  expect(closed.data.item).toMatchObject({ status: 'done', result: { value: '5', chosen: true, votes_text: '5 ×1, 8 ×1' } });
  expect(closed.data.board.round.state).toBe('voting');
  await shown(alice, 'gLastJson.topic_items.active.heading').toBe('Two');
  await expectTableCard(alice, 'Anna', 'prgrss1');

  // set_result on the done item: another card, then automatic again (highest value)
  const chosen = await ok(request, 'items', { ...seat, action: 'set_result', key: 'TIX-1', card: '8' });
  expect(chosen.data.message).toBe('Result of Item TIX-1 "One": "8" (chosen).');
  const auto = await ok(request, 'items', { ...seat, action: 'set_result', key: 'TIX-1' });
  expect(auto.data.item.result).toMatchObject({ value: '8', chosen: false });
  await fails(request, 'items', { ...seat, action: 'set_result', key: 'TIX-1', card: '☕' }, 'invalid_card');

  // close without card: the automatic value; close_empty; later
  await ok(request, 'play_card', { ...seat, action: 'play', card: '3' });
  await pickCard(alice, 'thrtn01');
  const autoClosed = await ok(request, 'items', { ...seat, action: 'next', key: 'TIX-2' });
  expect(autoClosed.data.message).toContain('is done with "13"');
  const empty = await ok(request, 'items', { ...seat, action: 'next', mode: 'close_empty' });
  expect(empty.data.message).toBe('Item TIX-3 "Three" is done without a value. New round. Active now: TIX-4 "Four".');
  expect(empty.data.item.result).toMatchObject({ value: null, chosen: false });
  const later = await ok(request, 'items', { ...seat, action: 'next', key: 'TIX-4', mode: 'later' });
  expect(later.data.message).toContain('comes back later');
  expect(later.data.item).toMatchObject({ status: 'open', active: true }); // the only open item
  await shown(alice, 'gLastJson.topic_items.done_count').toBe(3);

  // reopen
  const reopened = await ok(request, 'items', { ...seat, action: 'reopen', key: 'TIX-1' });
  expect(reopened.data.message).toBe('Item TIX-1 "One" is open again. It is at position 2.');
  expect(reopened.data.board.open_count).toBe(2);
  expect((await ok(request, 'items', { ...seat, action: 'reopen', key: 'TIX-1' })).data.message).toContain('is open already');
  await fails(request, 'items', { ...seat, action: 'move', key: 'TIX-2', position: 1 }, 'item_not_open');
  const done = await ok(request, 'items', { ...seat, action: 'list', status: 'done' });
  expect(done.data.items.map((item: any) => item.key).sort()).toEqual(['TIX-2', 'TIX-3']);
  await shown(alice, 'gLastJson.topic_items.open_count').toBe(2);
});

test('items: hidden cards never show up in results', async ({ request, browser }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Hidden');
  await ok(request, 'items', { ...seat, action: 'add', heading: 'Secret', key: 'S-1' });
  await pickCard(alice, 'twnty01'); // Alice played, Anna not: hidden
  const item = await ok(request, 'items', { ...seat, action: 'get', key: 'S-1' });
  expect(item.data.result).toBeNull();
  expect(JSON.stringify(item.data)).not.toContain('twnty01');
  const list = await ok(request, 'items', { ...seat, action: 'list' });
  expect(JSON.stringify(list.data)).not.toContain('twnty01');
  expect(list.text).not.toContain('20');
});

test('board_settings: rename, set_note and every setting - the browser shows it', async ({ request, browser }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Settings');

  const renamed = await ok(request, 'board_settings', { ...seat, action: 'rename', name: 'Dolphins' });
  expect(renamed.data.message).toBe('The team is now called "Dolphins".');
  expect(renamed.data.board.team.name).toBe('Dolphins');
  await expect(alice.locator('#team_name')).toHaveText('Dolphins');
  await fails(request, 'board_settings', { ...seat, action: 'rename', name: '' }, 'invalid_param', 'name');
  await fails(request, 'board_settings', { ...seat, action: 'rename', name: 'x'.repeat(31) }, 'invalid_param', 'name');

  const note = await ok(request, 'board_settings', { ...seat, action: 'set_note', note: 'Sprint 42 goal' });
  expect(note.data).toMatchObject({ message: 'The note is set.', board: { note: 'Sprint 42 goal' } });
  await expect(alice.locator('#board_note_text')).toHaveText('Sprint 42 goal');
  expect((await ok(request, 'board_settings', { ...seat, action: 'set_note', note: '' })).data.board.note).toBe('');
  await expect(alice.locator('#board_note')).toBeHidden();

  await fails(request, 'board_settings', { ...seat, action: 'set' }, 'missing_param');
  const set = await ok(request, 'board_settings', { ...seat, action: 'set', results_order: 'card', show_average: false,
    show_tips: false, show_card_changes: false });
  expect(set.data.board.settings).toEqual({ anonymous: false, results_order: 'card', show_average: false,
    show_tips: false, show_card_changes: false });
  expect(set.data.message).toContain('Everybody at the table sees it now');
  await shown(alice, '[gLastJson.results_order, gLastJson.show_avg, gLastJson.show_tips, gLastJson.show_card_changes].join()')
    .toBe('SEQUENCE,0,0,0');
  const back = await ok(request, 'board_settings', { ...seat, action: 'set', results_order: 'name', show_average: true,
    show_tips: true, show_card_changes: true });
  expect(back.data.board.settings).toMatchObject({ results_order: 'name', show_average: true, show_tips: true,
    show_card_changes: true });
  await shown(alice, '[gLastJson.results_order, gLastJson.show_avg, gLastJson.show_tips, gLastJson.show_card_changes].join()')
    .toBe('NAME,1,1,1');

  // anonymous: at once while no card is down, else from the next round
  expect((await ok(request, 'board_settings', { ...seat, action: 'set', anonymous: true })).data.board.settings.anonymous).toBe(true);
  await ok(request, 'board_settings', { ...seat, action: 'set', anonymous: false });
  await pickCard(alice, 'five001');
  const later = await ok(request, 'board_settings', { ...seat, action: 'set', anonymous: true });
  expect(later.data.message).toContain('anonymous results on (from the next round: cards are down)');
  expect(later.data.board.settings.anonymous).toBe(false);
  await shown(alice, 'gLastJson.anonymous_request_toggle').toBe(1);
  const round = await ok(request, 'round', { ...seat, action: 'new_round' });
  expect(round.data.board.settings.anonymous).toBe(true);
});
