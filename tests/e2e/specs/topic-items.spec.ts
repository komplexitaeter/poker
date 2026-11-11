import { test, expect, Page, APIResponse } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi, setTeamDeck } from './helpers';

/**
 * B-52 S1: topics as a list of items (api/lib_topics.php, api/topic_item_*.php, api/update_topic.php).
 * API level only; the board UI follows with the frontend. The active item is the topmost open one,
 * pok_teams_tbl.topic always holds its text. "Next item" finishes it with the distribution of the last revealed
 * round and the result rule (deck.aim 'agree': highest numeric_value; 'perspectives': none).
 */

const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];
function mysql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-r', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

type Item = {
  id: number; ext_id: string | null; heading: string; description: string | null; maturity: number | null;
  status: string; result_card_key: string | null; result_auto: number;
  distribution: Record<string, number> | null; rounds_cnt: number; done_date: string | null;
};
type Items = { active_id: number | null; open: Item[]; done: Item[]; done_count: number };

async function setup(browser: import('@playwright/test').Browser, name: string, players: string[] = ['Ann', 'Ben', 'Cid']) {
  const page = await newPlayer(browser);
  const url = await createTeam(page, name);
  const t = new URL(url).searchParams.get('t') as string;
  expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // safe for the SQL of the checks below
  const ids = await addPlayersViaApi(page, url, players);
  return { page, url, t, ids };
}

function q(params: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

async function post(page: Page, endpoint: string, params: Record<string, string | number>,
                    form?: Record<string, string>): Promise<APIResponse> {
  return page.request.post(`/api/${endpoint}?${q(params)}`, form ? { form } : {});
}

async function dao(page: Page, t: string, id: string) {
  const res = await page.request.get(`/api/dao.php?${q({ t, id })}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function items(page: Page, t: string, id: string): Promise<Items> {
  return (await dao(page, t, id)).topic_items;
}

function teamTopic(t: string): string {
  return mysql(`select ifnull(topic, '<null>') from pok_teams_tbl where id = '${t}'`);
}

async function addItem(page: Page, t: string, heading: string, extra: Record<string, string> = {}, at = 'end') {
  const res = await post(page, 'topic_item_add.php', { t, at }, { heading, ...extra });
  expect(res.status()).toBe(200);
  return (await res.json()).item_id as number;
}

async function play(page: Page, t: string, ids: string[], cards: string[]) {
  for (const [i, cardkey] of cards.entries()) {
    expect((await post(page, 'setc.php', { t, id: ids[i], cardkey })).ok()).toBeTruthy();
  }
}

test('update_topic.php: the single topic is the active item, synced to the team, never a done item', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicSimple', ['Ann']);
  expect((await items(page, t, ids[0])).open).toHaveLength(0);

  const save = (topic: string) => post(page, 'update_topic.php', { t }, { topic });
  expect((await save('Login page\nAs a user I want **markdown**.')).ok()).toBeTruthy();
  let list = await items(page, t, ids[0]);
  expect(list.open).toHaveLength(1);
  expect(list.open[0]).toMatchObject({ heading: 'Login page', description: 'As a user I want **markdown**.', status: 'open' });
  expect(list.active_id).toBe(list.open[0].id);
  expect(teamTopic(t)).toBe('Login page\nAs a user I want **markdown**.');
  expect((await dao(page, t, ids[0])).topic).toBe('Login page\nAs a user I want **markdown**.');

  // overwriting edits the same item, no done entry
  const firstId = list.open[0].id;
  expect((await save('Checkout')).ok()).toBeTruthy();
  list = await items(page, t, ids[0]);
  expect(list.open).toHaveLength(1);
  expect(list.open[0]).toMatchObject({ id: firstId, heading: 'Checkout', description: null });
  expect(list.done).toHaveLength(0);
  expect(teamTopic(t)).toBe('Checkout');

  // an empty text deletes the active item, topic ''
  expect((await save('   ')).ok()).toBeTruthy();
  list = await items(page, t, ids[0]);
  expect(list.open).toHaveLength(0);
  expect(list.active_id).toBeNull();
  expect(teamTopic(t)).toBe('');
  expect((await page.request.get(`/api/update_topic.php?${q({ t })}`)).status()).toBe(405);
});

test('the old topic of a team becomes its first item once, also with parallel loads', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicLegacy', ['Ann']);
  mysql(`delete from pok_topic_items_tbl where team_id = '${t}';
         update pok_teams_tbl set topic = 'Old story\\nwith details' where id = '${t}'`);
  const loads = await Promise.all([0, 1, 2, 3, 4].map(() => dao(page, t, ids[0])));
  for (const load of loads) expect(load.topic_items.open).toHaveLength(1);
  expect(mysql(`select count(*) from pok_topic_items_tbl where team_id = '${t}'`)).toBe('1');
  const item = (await items(page, t, ids[0])).open[0];
  expect(item).toMatchObject({ heading: 'Old story', description: 'with details', maturity: null });
  expect(teamTopic(t)).toBe('Old story\nwith details'); // unchanged

  // a long first line is cut, the description keeps the whole text
  const long = 'x'.repeat(250);
  mysql(`delete from pok_topic_items_tbl where team_id = '${t}'; update pok_teams_tbl set topic = '${long}' where id = '${t}'`);
  const migrated = (await items(page, t, ids[0])).open[0];
  expect([...migrated.heading]).toHaveLength(200);
  expect(migrated.heading.endsWith('…')).toBeTruthy();
  expect(migrated.description).toBe(long);
});

test('add, edit, move, maturity and delete keep the topic in line with the active item', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicList', ['Ann']);
  const a = await addItem(page, t, 'Alpha', { ext_id: 'PRJ-1', description: 'first' });
  const b = await addItem(page, t, 'Bravo');
  const c = await addItem(page, t, 'Charlie', {}, 'next'); // right after the active item
  let list = await items(page, t, ids[0]);
  expect(list.open.map(i => i.heading)).toEqual(['Alpha', 'Charlie', 'Bravo']);
  expect(list.open[0]).toMatchObject({ id: a, ext_id: 'PRJ-1', description: 'first' });
  expect(teamTopic(t)).toBe('Alpha\nfirst');

  // edit: only the fields sent change, an empty description clears it
  expect((await post(page, 'topic_item_edit.php', { t, item: a }, { heading: 'Alpha 2', description: '' })).ok()).toBeTruthy();
  list = await items(page, t, ids[0]);
  expect(list.open[0]).toMatchObject({ heading: 'Alpha 2', description: null, ext_id: 'PRJ-1' });
  expect(teamTopic(t)).toBe('Alpha 2');

  // move Bravo to the top: it becomes active
  expect((await post(page, 'topic_item_move.php', { t, item: b, to: 0 })).ok()).toBeTruthy();
  list = await items(page, t, ids[0]);
  expect(list.open.map(i => i.id)).toEqual([b, a, c]);
  expect(list.active_id).toBe(b);
  expect(teamTopic(t)).toBe('Bravo');
  expect((await post(page, 'topic_item_move.php', { t, item: b, to: 99 })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open.map(i => i.id)).toEqual([a, c, b]);

  // maturity is optional: not set (null) by default, set and cleared again
  expect((await items(page, t, ids[0])).open[1].maturity).toBeNull();
  expect((await post(page, 'topic_item_maturity.php', { t, item: c, maturity: 3 })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open[1].maturity).toBe(3);
  expect((await post(page, 'topic_item_edit.php', { t, item: c }, { ext_id: 'X-9' })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open[1]).toMatchObject({ maturity: 3, ext_id: 'X-9', heading: 'Charlie' });
  expect((await post(page, 'topic_item_edit.php', { t, item: c, maturity: '' }, {})).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open[1].maturity).toBeNull();
  expect((await post(page, 'topic_item_edit.php', { t, item: c, maturity: 1 }, {})).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open[1].maturity).toBe(1);
  expect((await post(page, 'topic_item_maturity.php', { t, item: c, maturity: '' })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open[1].maturity).toBeNull();
  const ready = await post(page, 'topic_item_add.php', { t, maturity: 2 }, { heading: 'Delta' });
  expect((await items(page, t, ids[0])).open.find(i => i.heading === 'Delta')?.maturity).toBe(2);
  expect((await post(page, 'topic_item_delete.php', { t, item: (await ready.json()).item_id })).ok()).toBeTruthy();

  expect((await post(page, 'topic_item_delete.php', { t, item: a })).ok()).toBeTruthy();
  list = await items(page, t, ids[0]);
  expect(list.open.map(i => i.id)).toEqual([c, b]);
  expect(teamTopic(t)).toBe('Charlie');

  // validation: nothing written
  expect((await post(page, 'topic_item_add.php', { t }, { heading: '  ' })).status()).toBe(400);
  expect((await post(page, 'topic_item_add.php', { t, maturity: 7 }, { heading: 'x' })).status()).toBe(400);
  expect((await post(page, 'topic_item_edit.php', { t, item: c }, { heading: '' })).status()).toBe(400);
  expect((await post(page, 'topic_item_maturity.php', { t, item: c, maturity: 4 })).status()).toBe(400);
  expect((await post(page, 'topic_item_edit.php', { t, item: c, maturity: 'x' }, {})).status()).toBe(400);
  expect((await post(page, 'topic_item_maturity.php', { t, item: 'x1', maturity: 1 })).status()).toBe(400);
  expect((await post(page, 'topic_item_move.php', { t, item: c, to: -1 })).status()).toBe(400);
  expect((await post(page, 'topic_item_delete.php', { t, item: a })).status()).toBe(404);
  expect((await post(page, 'topic_item_add.php', { t: 'no-such-team-xyz' }, { heading: 'x' })).status()).toBe(403);
  expect((await page.request.get(`/api/topic_item_add.php?${q({ t })}`)).status()).toBe(405);
  // an item of another team is unknown here
  const other = await setup(browser, 'TopicOther', ['Ole']);
  expect((await post(other.page, 'topic_item_delete.php', { t: other.t, item: c })).status()).toBe(404);
  expect((await post(other.page, 'topic_item_edit.php', { t: other.t, item: c }, { heading: 'hijack' })).status()).toBe(404);
  expect((await items(page, t, ids[0])).open.map(i => i.heading)).toEqual(['Charlie', 'Bravo']);

  // lengths are cut (characters, not bytes)
  const id = await addItem(page, t, 'ä'.repeat(300), { ext_id: 'E'.repeat(40) });
  const added = (await items(page, t, ids[0])).open.find(i => i.id === id) as Item;
  expect([...added.heading]).toHaveLength(200);
  expect(added.ext_id).toBe('E'.repeat(20));
});

test('next item: distribution and highest value, chosen result, new round, next item active', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicNext');
  const first = await addItem(page, t, 'Story A');
  const second = await addItem(page, t, 'Story B');

  // round 1: revealed with 5, 8 and a coffee cup -> proposal 8 (highest value, the coffee cup does not count)
  await play(page, t, ids, ['five001', 'eight01', 'break01']);
  let state = await dao(page, t, ids[0]);
  expect(state.deck.aim).toBe('agree');
  expect(state.topic_items.open[0]).toMatchObject({ id: first, result_card_key: 'eight01', result_auto: 1,
    distribution: { break01: 1, eight01: 1, five001: 1 }, rounds_cnt: 0 });

  // the team chooses 5 (a played card); a control card or a card neither played nor in the deck is refused
  expect((await post(page, 'topic_item_result.php', { t, item: first, card: 'break01' })).status()).toBe(400);
  expect((await post(page, 'topic_item_result.php', { t, item: first, card: 'green01' })).status()).toBe(400);
  expect((await post(page, 'topic_item_result.php', { t, item: first, card: 'five001' })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open[0]).toMatchObject({ result_card_key: 'five001', result_auto: 0 });

  // a stale "Next item" (not the active item) is refused
  const stale = await post(page, 'topic_item_next.php', { t, item: second });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({ error: 'not_active', active_id: first });

  const next = await post(page, 'topic_item_next.php', { t, item: first });
  expect(next.ok()).toBeTruthy();
  expect(await next.json()).toMatchObject({ item_id: first, active_id: second, result_card_key: 'five001', result_auto: 0 });
  state = await dao(page, t, ids[0]);
  expect(state.players.every((p: { display_card_key: string }) => p.display_card_key === 'prgrss1')).toBeTruthy();
  expect(state.topic).toBe('Story B');
  expect(state.topic_items.active_id).toBe(second);
  expect(state.topic_items.done).toHaveLength(1);
  expect(state.topic_items.done[0]).toMatchObject({ id: first, status: 'done', result_card_key: 'five001', result_auto: 0,
    distribution: { break01: 1, eight01: 1, five001: 1 }, rounds_cnt: 1 });
  expect(state.topic_items.done[0].done_date).not.toBeNull();
  // the round snapshot keeps the topic of the finished item
  expect(mysql(`select topic from pok_roundstats_tbl where team_id = '${t}' order by id desc limit 1`)).toBe('Story A');
  // a second click on the same item does nothing
  expect((await post(page, 'topic_item_next.php', { t, item: first })).status()).toBe(409);

  // Story B: two rounds; infinity has no value and is ignored, the last revealed round counts
  await play(page, t, ids, ['two0001', 'two0001', 'two0001']);
  expect((await post(page, 'newround.php', { t })).ok()).toBeTruthy();
  await play(page, t, ids, ['three01', 'infin01', 'qstmrk1']);
  expect((await post(page, 'topic_item_next.php', { t, item: second })).ok()).toBeTruthy();
  const list = await items(page, t, ids[0]);
  expect(list.active_id).toBeNull();
  expect(teamTopic(t)).toBe('');
  expect(list.done.map(i => i.id)).toEqual([second, first]); // newest first
  expect(list.done[0]).toMatchObject({ result_card_key: 'three01', result_auto: 1, rounds_cnt: 2,
    distribution: { infin01: 1, qstmrk1: 1, three01: 1 } });
});

test('next item: without a played card with a value no automatic result, a choice is still possible', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicNoValue', ['Ann', 'Ben']);
  const item = await addItem(page, t, 'Story C');
  await play(page, t, ids, ['infin01', 'qstmrk1']);
  expect((await items(page, t, ids[0])).open[0].result_card_key).toBeNull();
  // a played card without a value may be chosen
  expect((await post(page, 'topic_item_result.php', { t, item, card: 'infin01' })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open[0]).toMatchObject({ result_card_key: 'infin01', result_auto: 0 });
  // back to automatic
  expect((await post(page, 'topic_item_result.php', { t, item })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).open[0]).toMatchObject({ result_card_key: null, result_auto: 1 });
  expect((await post(page, 'topic_item_next.php', { t, item })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).done[0]).toMatchObject({ result_card_key: null, result_auto: 1,
    distribution: { infin01: 1, qstmrk1: 1 }, rounds_cnt: 1 });
});

test('next item with traffic lights: deck aim perspectives, distribution only, no result', async ({ browser }) => {
  const { page, url, t, ids } = await setup(browser, 'TopicTraffic');
  await setTeamDeck(page, url, 'traffic');
  const item = await addItem(page, t, 'Release ready?');
  await play(page, t, ids, ['green01', 'red0001', 'red0001']);
  const state = await dao(page, t, ids[0]);
  expect(state.deck.aim).toBe('perspectives');
  expect(state.topic_items.open[0]).toMatchObject({ result_card_key: null, distribution: { green01: 1, red0001: 2 } });
  const chosen = await post(page, 'topic_item_result.php', { t, item, card: 'red0001' });
  expect(chosen.status()).toBe(409);
  expect(await chosen.json()).toMatchObject({ error: 'perspectives' });
  expect((await post(page, 'topic_item_next.php', { t, item })).ok()).toBeTruthy();
  expect((await items(page, t, ids[0])).done[0]).toMatchObject({ result_card_key: null, rounds_cnt: 1,
    distribution: { green01: 1, red0001: 2 } });
});

test('reopen: a done item comes back as next or at the end and keeps its rounds', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicReopen', ['Ann']);
  const a = await addItem(page, t, 'A');
  const b = await addItem(page, t, 'B');
  const c = await addItem(page, t, 'C');
  await play(page, t, ids, ['eight01']);
  expect((await post(page, 'topic_item_next.php', { t, item: a })).ok()).toBeTruthy();
  expect((await post(page, 'topic_item_reopen.php', { t, item: b })).status()).toBe(409); // not done

  expect((await post(page, 'topic_item_reopen.php', { t, item: a, at: 'next' })).ok()).toBeTruthy();
  let list = await items(page, t, ids[0]);
  expect(list.open.map(i => i.id)).toEqual([b, a, c]);
  expect(list.done).toHaveLength(0);
  expect(list.open[1]).toMatchObject({ status: 'open', done_date: null, rounds_cnt: 1, result_card_key: 'eight01', result_auto: 1 });

  expect((await post(page, 'topic_item_next.php', { t, item: b })).ok()).toBeTruthy();
  expect((await post(page, 'topic_item_reopen.php', { t, item: b })).ok()).toBeTruthy(); // default: at the end
  list = await items(page, t, ids[0]);
  expect(list.open.map(i => i.id)).toEqual([a, c, b]);
  expect(teamTopic(t)).toBe('A');
});

test('at most 100 open items per team', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicLimit', ['Ann']);
  const values = Array.from({ length: 100 }, (_, i) => `('${t}', ${i + 1}, 'Item ${i + 1}')`).join(',');
  mysql(`insert into pok_topic_items_tbl(team_id, position, heading) values ${values}`);
  const res = await post(page, 'topic_item_add.php', { t }, { heading: 'one too many' });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ error: 'limit' });
  const list = await items(page, t, ids[0]);
  expect(list.open).toHaveLength(100);
  expect(list.open[0].heading).toBe('Item 1');
});
