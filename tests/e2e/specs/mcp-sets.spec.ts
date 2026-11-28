import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { createTeam, expectTableCard, joinAsPlayer, newPlayer, pickCard } from './helpers';

/**
 * B-151 PR F2: the MCP tool card_sets (docs/mcp-concept.md 5.3) - same core functions as the deck menu and the set
 * editor of the board (update_deck.php, update_controls.php, custom_set_*.php -> api/lib_core_deck.php), same limits
 * and validation. Called like an AI client would, with Playwright's request; a board in the browser shows the effect.
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

const CARD = (text: string, color = 'blue', extra: Record<string, unknown> = {}) => ({ text, color, ...extra });

test('tools/list: card_sets, timer, feedback and react', async ({ request }) => {
  const res = await request.post(MCP, { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  const tools = (await res.json()).result.tools as any[];
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
  const sets = byName.card_sets.inputSchema;
  expect(sets.properties.action.enum).toEqual(['list', 'choose', 'controls', 'create', 'edit', 'delete']);
  expect(sets.required).toEqual(['action']);
  expect(sets.properties.set_cards.type).toBe('array');
  expect(sets.properties.set_cards.items.properties.color.enum).toContain('blue');
  expect(sets.properties.set_cards.items.required).toEqual(['color']);
  expect(sets.properties.cards.description).toContain('controls (required)');
  expect(byName.card_sets.annotations.destructiveHint).toBe(true);
  expect(byName.timer.inputSchema.properties.action.enum)
    .toEqual(['start', 'pause', 'reset', 'show', 'hide', 'set_mode', 'set_timebox', 'set_auto_start']);
  expect(byName.timer.inputSchema.required).toEqual(['action']);
  expect(byName.feedback.inputSchema.properties.action.enum).toEqual(['send', 'roadmap', 'vote']);
  expect(byName.react.inputSchema.required).toEqual(['to', 'emoji']);
  expect(byName.react.inputSchema.properties.emoji.enum)
    .toEqual(['cake', 'heart', 'clap', 'party', 'think', 'thumbs', 'fish', 'nudge']);

  // the public REST API stays as it is
  const spec = await (await request.get('/api/v1/openapi.json')).json();
  for (const path of ['/deck', '/deck/controls', '/sets', '/sets/{set_id}', '/timer', '/feedback', '/roadmap']) {
    expect(spec.paths[path]).toBeUndefined();
  }
});

test('card_sets list, choose (new round while cards are down) and controls; the browser follows', async ({ browser, request }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Sets');

  const list = await ok(request, 'card_sets', { ...seat, action: 'list' });
  expect(list.data.current).toMatchObject({ id: 'fib-classic' });
  expect(list.data.cards_down).toBe(false);
  expect(list.data.sets.map((s: any) => s.id)).toEqual(['fib-classic', 'fib-short', 'fib-true', 'numbers', 'tshirt',
    'traffic', 'emotions', 'mood', 'stars', 'judge', 'delegation']);
  const judge = list.data.sets.find((s: any) => s.id === 'judge');
  expect(judge.explanation).toContain('Consent');
  expect(judge.cards[6]).toEqual({ key: 'jdg6', value: '6', heading: 'veto' });
  expect(list.data.controls.map((c: any) => c.key)).toEqual(['break01', 'qstmrk1', 'xclam01', 'veto', 'shrug01']);
  expect(list.data.custom).toMatchObject({ max_sets: 5, max_cards: 20, min_cards_on: 2 });
  expect(list.data.custom.symbols).toContainEqual({ symbol: 's-inf', value: '∞' });
  expect(list.text).toContain('tshirt: T-shirt sizes');

  // errors as on the web, nothing written
  await fails(request, 'card_sets', { ...seat, action: 'choose', deck: 'nope' }, 'invalid_param', 'deck');
  await fails(request, 'card_sets', { ...seat, action: 'choose', deck: 'tshirt', cards: 'jdg1' }, 'invalid_param', 'cards');
  await fails(request, 'card_sets', { ...seat, action: 'choose' }, 'missing_param', 'deck');
  await fails(request, 'card_sets', { ...seat, action: 'controls' }, 'missing_param', 'cards');
  await fails(request, 'card_sets', { ...seat, action: 'controls', cards: 'zero001' }, 'invalid_param', 'cards');

  // a card down: choosing another set starts a new round (the board takes the card back)
  await pickCard(alice, 'five001');
  expect((await ok(request, 'card_sets', { ...seat, action: 'list' })).data.cards_down).toBe(true);
  const chosen = await ok(request, 'card_sets', { ...seat, action: 'choose', deck: 'tshirt', cards: 's000001,m000001,l000001' });
  expect(chosen.data.new_round).toBe(true);
  expect(chosen.data.board.deck).toMatchObject({ id: 'tshirt' });
  expect(chosen.data.board.deck.cards.map((c: any) => c.value)).toEqual(['S', 'M', 'L']);
  expect(chosen.text).toContain('a new round started');
  await shown(alice, 'gLastJson.deck.id').toBe('tshirt');
  await shown(alice, 'gLastJson.selected_card_key').toBe(null);
  // the same again: nothing changes, no new round
  const again = await ok(request, 'card_sets', { ...seat, action: 'choose', deck: 'tshirt', cards: 's000001,m000001,l000001' });
  expect(again.data.new_round).toBe(false);
  expect(again.text).toContain('nothing changed');

  const controls = await ok(request, 'card_sets', { ...seat, action: 'controls', cards: 'veto, shrug01' });
  expect(controls.data.board.deck.controls.map((c: any) => c.key)).toEqual(['veto', 'shrug01']);
  await shown(alice, 'gLastJson.deck.controls.join()').toBe('veto,shrug01');
  const none = await ok(request, 'card_sets', { ...seat, action: 'controls', cards: '' });
  expect(none.data.board.deck.controls).toEqual([]);
});

test('card_sets create, edit, delete with the limits and checks of the set editor', async ({ browser, request }) => {
  const { alice, seat } = await tableWithAgent(browser, request, 'MCP Own Sets');
  const before = (await ok(request, 'card_sets', { ...seat, action: 'list' })).data.custom_sets.length; // example set

  // validation of the web (index of the card in the message)
  let err = await fails(request, 'card_sets', { ...seat, action: 'create', name: 'Risk', set_cards: [CARD('low'), CARD('toolong')] },
    'invalid_param', 'set_cards');
  expect(err.message).toContain('set_cards[1].text');
  err = await fails(request, 'card_sets', { ...seat, action: 'create', name: 'Risk', set_cards: [{ text: 'a' }] },
    'invalid_param', 'set_cards');
  expect(err.message).toContain('color');
  await fails(request, 'card_sets', { ...seat, action: 'create', name: 'Risk', set_cards: [CARD('a', 'blue', { symbol: 's-1' })] },
    'invalid_param', 'set_cards');
  await fails(request, 'card_sets', { ...seat, action: 'create', name: 'Risk', set_cards: 'a,b' }, 'invalid_param', 'set_cards');
  await fails(request, 'card_sets', { ...seat, action: 'create', name: 'Risk', set_cards: [] }, 'invalid_param', 'set_cards');
  await fails(request, 'card_sets', { ...seat, action: 'create', name: 'x'.repeat(25), set_cards: [CARD('a')] },
    'invalid_param', 'name');
  err = await fails(request, 'card_sets', { ...seat, action: 'create', name: 'Big',
    set_cards: Array.from({ length: 21 }, (_, i) => CARD(String(i))) }, 'invalid_param', 'set_cards');
  expect(err.message).toContain('at most 20 cards');

  // create and use at once: the browser has the new set as its deck
  const created = await ok(request, 'card_sets', { ...seat, action: 'create', name: 'Risk', style: 'badge', activate: true,
    set_cards: [CARD('low', 'green', { numeric_value: 1, heading: 'low risk' }), CARD('mid', 'amber', { numeric_value: 2 }),
      { symbol: 's-light-red', color: 'red', numeric_value: 3 }] });
  const set = created.data.set;
  expect(set).toMatchObject({ name: 'Risk', id: `c-${set.set_id}`, cards: ['low', 'mid', '🔴'] });
  expect(created.data.board.deck).toMatchObject({ id: set.id, name: 'Risk' });
  await shown(alice, 'gLastJson.deck.id').toBe(set.id);

  // edit: only the name, the cards stay with their keys; a stale rev is a conflict
  const list = (await ok(request, 'card_sets', { ...seat, action: 'list' })).data;
  const own = list.custom_sets.find((s: any) => s.set_id === set.set_id);
  expect(own.cards[0]).toMatchObject({ text: 'low', heading: 'low risk', numeric_value: 1, color: 'green' });
  expect(own.cards[2]).toMatchObject({ symbol: 's-light-red', value: '🔴' });
  const renamed = await ok(request, 'card_sets', { ...seat, action: 'edit', set_id: set.set_id, rev: own.rev, name: 'Risk level' });
  expect(renamed.data.set.name).toBe('Risk level');
  expect(renamed.data.new_round).toBe(false);
  expect((await ok(request, 'card_sets', { ...seat, action: 'list' })).data.custom_sets
    .find((s: any) => s.set_id === set.set_id).cards.map((c: any) => c.key)).toEqual(own.cards.map((c: any) => c.key));
  await fails(request, 'card_sets', { ...seat, action: 'edit', set_id: set.set_id, rev: own.rev, name: 'Old view' },
    'conflict', 'rev');
  await fails(request, 'card_sets', { ...seat, action: 'edit', set_id: 999999, rev: 0 }, 'set_not_found', 'set_id');
  // replace the cards: a card down and a card of the deck gone -> new round, as in the editor
  await pickCard(alice, own.cards[1].key);
  const edited = await ok(request, 'card_sets', { ...seat, action: 'edit', set_id: set.set_id, rev: renamed.data.set.rev,
    set_cards: [{ key: own.cards[0].key, text: 'low', color: 'green', numeric_value: 1 }, CARD('high', 'red', { numeric_value: 3 })] });
  expect(edited.data.new_round).toBe(true);
  expect(edited.data.set.cards).toEqual(['low', 'high']);
  await shown(alice, 'gLastJson.selected_card_key').toBe(null);

  // limit: custom_sets_max() sets per team
  for (let i = before + 1; i < 5; i++) {
    await ok(request, 'card_sets', { ...seat, action: 'create', name: `Set ${i}`, set_cards: [CARD('a'), CARD('b')] });
  }
  err = await fails(request, 'card_sets', { ...seat, action: 'create', name: 'One more', set_cards: [CARD('a')] }, 'limit_reached');
  expect(err.message).toContain('Delete one first');

  // delete the set in use: the team gets the default set again
  const deleted = await ok(request, 'card_sets', { ...seat, action: 'delete', set_id: set.set_id });
  expect(deleted.text).toContain('the team has the default set "fib-classic" again');
  expect(deleted.data.board.deck.id).toBe('fib-classic');
  await shown(alice, 'gLastJson.deck.id').toBe('fib-classic');
  await fails(request, 'card_sets', { ...seat, action: 'delete', set_id: set.set_id }, 'set_not_found');
});
