import { test, expect, Page, APIResponse } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { newPlayer, createTeam, addPlayersViaApi, setTeamDeck } from './helpers';

/**
 * B-52 S1/S1b: topics as a list of items (api/lib_topics.php, api/topic_item_*.php, api/get_topics.php).
 * API level only. The active item is the topmost open one. S1b: pok_teams_tbl.topic is the team's note again
 * (update_topic.php as before S1, independent of the items); dao.php delivers only the active item, counts,
 * next_heading and topics_rev, the lists come from get_topics.php; every change of an item raises topics_rev.
 * "Next item" finishes the active item (also the last one: "Finish item") with the distribution of the last revealed
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
  distribution: Record<string, number> | null; rounds_cnt: number; last_round_date: string | null; done_date: string | null;
};
type Summary = { active: Item | null; open_count: number; done_count: number; next_heading: string | null; topics_rev: number };
type Lists = { topics_rev: number; open: Item[]; open_count: number; done_count: number; done?: Item[]; done_offset?: number;
  limits: Record<string, number> };

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

async function summary(page: Page, t: string, id: string): Promise<Summary> {
  return (await dao(page, t, id)).topic_items;
}

async function lists(page: Page, t: string, params: Record<string, string | number> = {}): Promise<Lists> {
  const res = await page.request.get(`/api/get_topics.php?${q({ t, ...params })}`);
  expect(res.status()).toBe(200);
  return res.json();
}
const open = async (page: Page, t: string) => (await lists(page, t)).open;
const done = async (page: Page, t: string) => (await lists(page, t, { done: 1 })).done as Item[];

function teamTopic(t: string): string {
  return mysql(`select ifnull(topic, '') from pok_teams_tbl where id = '${t}'`);
}
function rev(t: string): number {
  return Number(mysql(`select topics_rev from pok_teams_tbl where id = '${t}'`));
}

async function addItem(page: Page, t: string, heading: string, extra: Record<string, string> = {}, at = 'end') {
  const res = await post(page, 'topic_item_add.php', { t, at }, { heading, ...extra });
  expect(res.status()).toBe(200);
  return (await res.json()).item_id as number;
}

const ISO_UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

async function play(page: Page, t: string, ids: string[], cards: string[]) {
  for (const [i, cardkey] of cards.entries()) {
    expect((await post(page, 'setc.php', { t, id: ids[i], cardkey })).ok()).toBeTruthy();
  }
}

test('update_topic.php: the note is independent of the items, no takeover of an old topic', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicNote', ['Ann']);
  const save = (topic: string) => post(page, 'update_topic.php', { t }, { topic });

  // a note alone creates no item
  expect((await save('Agenda: refine first, then estimate')).ok()).toBeTruthy();
  let state = await dao(page, t, ids[0]);
  expect(state.topic).toBe('Agenda: refine first, then estimate');
  expect(state.topic_items).toEqual({ active: null, open_count: 0, done_count: 0, next_heading: null, topics_rev: 0 });
  expect(mysql(`select count(*) from pok_topic_items_tbl where team_id = '${t}'`)).toBe('0');

  // items do not touch the note, the note does not touch the items (nor topics_rev)
  const a = await addItem(page, t, 'Alpha', { description: 'first' });
  expect(teamTopic(t)).toBe('Agenda: refine first, then estimate');
  const before = rev(t);
  expect((await save('  New note\n\nwith blank line  ')).ok()).toBeTruthy();
  expect(rev(t)).toBe(before);
  state = await dao(page, t, ids[0]);
  expect(state.topic).toBe('  New note\n\nwith blank line  '); // stored as sent, like before S1
  expect(state.topic_items.active).toMatchObject({ id: a, heading: 'Alpha', description: 'first' });

  // finishing the last item keeps the note; an empty note keeps the items
  expect((await post(page, 'topic_item_next.php', { t, item: a })).ok()).toBeTruthy();
  expect((await dao(page, t, ids[0])).topic).toBe('  New note\n\nwith blank line  ');
  expect((await save('')).ok()).toBeTruthy();
  expect(teamTopic(t)).toBe('');
  expect((await summary(page, t, ids[0])).done_count).toBe(1);

  // an old topic is no item (no lazy takeover any more)
  mysql(`update pok_teams_tbl set topic = 'Old story' where id = '${t}'`);
  expect((await summary(page, t, ids[0])).active).toBeNull();
  expect((await open(page, t))).toHaveLength(0);
  expect((await page.request.get(`/api/update_topic.php?${q({ t })}`)).status()).toBe(405);
});

test('add, edit, move, maturity and delete; dao shows the active item and the next heading', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicList', ['Ann']);
  const a = await addItem(page, t, 'Alpha', { ext_id: 'PRJ-1', description: 'first' });
  const b = await addItem(page, t, 'Bravo');
  const c = await addItem(page, t, 'Charlie', {}, 'next'); // right after the active item
  let list = await open(page, t);
  expect(list.map(i => i.heading)).toEqual(['Alpha', 'Charlie', 'Bravo']);
  expect(list[0]).toMatchObject({ id: a, ext_id: 'PRJ-1', description: 'first' });
  let sum = await summary(page, t, ids[0]);
  expect(sum).toMatchObject({ open_count: 3, done_count: 0, next_heading: 'Charlie' });
  expect(sum.active).toMatchObject({ id: a, heading: 'Alpha', status: 'open', rounds_cnt: 0, last_round_date: null });
  expect(teamTopic(t)).toBe('');

  // edit: only the fields sent change, an empty description clears it
  expect((await post(page, 'topic_item_edit.php', { t, item: a }, { heading: 'Alpha 2', description: '' })).ok()).toBeTruthy();
  expect((await open(page, t))[0]).toMatchObject({ heading: 'Alpha 2', description: null, ext_id: 'PRJ-1' });

  // move Bravo to the top: it becomes active
  expect((await post(page, 'topic_item_move.php', { t, item: b, to: 0 })).ok()).toBeTruthy();
  expect((await open(page, t)).map(i => i.id)).toEqual([b, a, c]);
  sum = await summary(page, t, ids[0]);
  expect(sum.active?.id).toBe(b);
  expect(sum.next_heading).toBe('Alpha 2');
  expect((await post(page, 'topic_item_move.php', { t, item: b, to: 99 })).ok()).toBeTruthy();
  expect((await open(page, t)).map(i => i.id)).toEqual([a, c, b]);

  // maturity is optional: not set (null) by default, set and cleared again
  expect((await open(page, t))[1].maturity).toBeNull();
  expect((await post(page, 'topic_item_maturity.php', { t, item: c, maturity: 3 })).ok()).toBeTruthy();
  expect((await open(page, t))[1].maturity).toBe(3);
  expect((await post(page, 'topic_item_edit.php', { t, item: c }, { ext_id: 'X-9' })).ok()).toBeTruthy();
  expect((await open(page, t))[1]).toMatchObject({ maturity: 3, ext_id: 'X-9', heading: 'Charlie' });
  expect((await post(page, 'topic_item_edit.php', { t, item: c, maturity: '' }, {})).ok()).toBeTruthy();
  expect((await open(page, t))[1].maturity).toBeNull();
  expect((await post(page, 'topic_item_edit.php', { t, item: c, maturity: 1 }, {})).ok()).toBeTruthy();
  expect((await open(page, t))[1].maturity).toBe(1);
  const ready = await post(page, 'topic_item_add.php', { t, maturity: 2 }, { heading: 'Delta' });
  expect((await open(page, t)).find(i => i.heading === 'Delta')?.maturity).toBe(2);
  expect((await post(page, 'topic_item_delete.php', { t, item: (await ready.json()).item_id })).ok()).toBeTruthy();

  expect((await post(page, 'topic_item_delete.php', { t, item: a })).ok()).toBeTruthy();
  expect((await open(page, t)).map(i => i.id)).toEqual([c, b]);

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
  expect((await open(page, t)).map(i => i.heading)).toEqual(['Charlie', 'Bravo']);
  expect(await open(other.page, other.t)).toHaveLength(0);

  // lengths are cut (characters, not bytes)
  const id = await addItem(page, t, 'ä'.repeat(300), { ext_id: 'E'.repeat(40) });
  const added = (await open(page, t)).find(i => i.id === id) as Item;
  expect([...added.heading]).toHaveLength(200);
  expect(added.ext_id).toBe('E'.repeat(20));
});

test('next item: distribution and highest value, chosen result, new round, history of the done item', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicNext');
  expect((await post(page, 'update_topic.php', { t }, { topic: 'Sprint 12 refinement' })).ok()).toBeTruthy();
  const first = await addItem(page, t, 'Story A');
  const second = await addItem(page, t, 'Story B');

  // round 1: revealed with 5, 8 and a coffee cup -> proposal 8 (highest value, the coffee cup does not count)
  await play(page, t, ids, ['five001', 'eight01', 'break01']);
  let state = await dao(page, t, ids[0]);
  expect(state.deck.aim).toBe('agree');
  expect(state.topic_items.active).toMatchObject({ id: first, result_card_key: 'eight01', result_auto: 1,
    distribution: { break01: 1, eight01: 1, five001: 1 }, rounds_cnt: 0 });
  // get_topics.php shows the running revealed round at the active item as well
  expect((await open(page, t))[0]).toMatchObject({ id: first, result_card_key: 'eight01',
    distribution: { break01: 1, eight01: 1, five001: 1 } });

  // the team chooses 5 (a played card); a control card or a card neither played nor in the deck is refused
  expect((await post(page, 'topic_item_result.php', { t, item: first, card: 'break01' })).status()).toBe(400);
  expect((await post(page, 'topic_item_result.php', { t, item: first, card: 'green01' })).status()).toBe(400);
  expect((await post(page, 'topic_item_result.php', { t, item: first, card: 'five001' })).ok()).toBeTruthy();
  expect((await summary(page, t, ids[0])).active).toMatchObject({ result_card_key: 'five001', result_auto: 0 });

  // a stale "Next item" (not the active item) is refused
  const stale = await post(page, 'topic_item_next.php', { t, item: second });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({ error: 'not_active', active_id: first });

  const next = await post(page, 'topic_item_next.php', { t, item: first });
  expect(next.ok()).toBeTruthy();
  expect(await next.json()).toMatchObject({ item_id: first, active_id: second, result_card_key: 'five001', result_auto: 0 });
  state = await dao(page, t, ids[0]);
  expect(state.players.every((p: { display_card_key: string }) => p.display_card_key === 'prgrss1')).toBeTruthy();
  expect(state.topic).toBe('Sprint 12 refinement');
  expect(state.topic_items).toMatchObject({ open_count: 1, done_count: 1, next_heading: null });
  expect(state.topic_items.active.id).toBe(second);
  const history = await done(page, t);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ id: first, status: 'done', result_card_key: 'five001', result_auto: 0,
    distribution: { break01: 1, eight01: 1, five001: 1 }, rounds_cnt: 1 });
  expect(history[0].done_date).toMatch(ISO_UTC);
  expect(history[0].last_round_date).toMatch(ISO_UTC);
  // the round snapshot keeps the note and the item of the round
  expect(mysql(`select concat(topic, '|', ifnull(topic_item_id, 'null')) from pok_roundstats_tbl
                 where team_id = '${t}' order by id desc limit 1`)).toBe(`Sprint 12 refinement|${first}`);
  // a second click on the same item does nothing
  expect((await post(page, 'topic_item_next.php', { t, item: first })).status()).toBe(409);

  // Story B: two rounds; infinity has no value and is ignored, the last revealed round counts
  await play(page, t, ids, ['two0001', 'two0001', 'two0001']);
  expect((await post(page, 'newround.php', { t })).ok()).toBeTruthy();
  expect(mysql(`select topic_item_id from pok_roundstats_tbl where team_id = '${t}' order by id desc limit 1`)).toBe(String(second));
  await play(page, t, ids, ['three01', 'infin01', 'qstmrk1']);
  // "Finish item": the last open item, no next one
  const finish = await post(page, 'topic_item_next.php', { t, item: second });
  expect(finish.ok()).toBeTruthy();
  expect(await finish.json()).toMatchObject({ item_id: second, active_id: null, result_card_key: 'three01' });
  state = await dao(page, t, ids[0]);
  expect(state.topic_items).toEqual({ active: null, open_count: 0, done_count: 2, next_heading: null,
    topics_rev: state.topic_items.topics_rev });
  expect(state.topic).toBe('Sprint 12 refinement');
  expect(state.players.every((p: { display_card_key: string }) => p.display_card_key === 'prgrss1')).toBeTruthy();
  const all = await done(page, t);
  expect(all.map(i => i.id)).toEqual([second, first]); // newest first
  expect(all[0]).toMatchObject({ result_card_key: 'three01', result_auto: 1, rounds_cnt: 2,
    distribution: { infin01: 1, qstmrk1: 1, three01: 1 } });

  // a round without an active item: the snapshot has no item
  await play(page, t, ids, ['two0001', 'two0001', 'two0001']);
  const revBefore = rev(t);
  expect((await post(page, 'newround.php', { t })).ok()).toBeTruthy();
  expect(mysql(`select ifnull(topic_item_id, 'null') from pok_roundstats_tbl where team_id = '${t}' order by id desc limit 1`)).toBe('null');
  expect(rev(t)).toBe(revBefore);
});

test('next item: without a played card with a value no automatic result, a choice is still possible', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicNoValue', ['Ann', 'Ben']);
  const item = await addItem(page, t, 'Story C');
  await play(page, t, ids, ['infin01', 'qstmrk1']);
  expect((await summary(page, t, ids[0])).active?.result_card_key).toBeNull();
  // a played card without a value may be chosen
  expect((await post(page, 'topic_item_result.php', { t, item, card: 'infin01' })).ok()).toBeTruthy();
  expect((await summary(page, t, ids[0])).active).toMatchObject({ result_card_key: 'infin01', result_auto: 0 });
  // back to automatic
  expect((await post(page, 'topic_item_result.php', { t, item })).ok()).toBeTruthy();
  expect((await summary(page, t, ids[0])).active).toMatchObject({ result_card_key: null, result_auto: 1 });
  expect((await post(page, 'topic_item_next.php', { t, item })).ok()).toBeTruthy();
  expect((await done(page, t))[0]).toMatchObject({ result_card_key: null, result_auto: 1,
    distribution: { infin01: 1, qstmrk1: 1 }, rounds_cnt: 1 });
});

test('next item with traffic lights: deck aim perspectives, distribution only, no result', async ({ browser }) => {
  const { page, url, t, ids } = await setup(browser, 'TopicTraffic');
  await setTeamDeck(page, url, 'traffic');
  const item = await addItem(page, t, 'Release ready?');
  await play(page, t, ids, ['green01', 'red0001', 'red0001']);
  const state = await dao(page, t, ids[0]);
  expect(state.deck.aim).toBe('perspectives');
  expect(state.topic_items.active).toMatchObject({ result_card_key: null, distribution: { green01: 1, red0001: 2 } });
  const chosen = await post(page, 'topic_item_result.php', { t, item, card: 'red0001' });
  expect(chosen.status()).toBe(409);
  expect(await chosen.json()).toMatchObject({ error: 'perspectives' });
  expect((await post(page, 'topic_item_next.php', { t, item })).ok()).toBeTruthy();
  expect((await done(page, t))[0]).toMatchObject({ result_card_key: null, rounds_cnt: 1,
    distribution: { green01: 1, red0001: 2 } });
});

test('custom sets have an aim: agree by default, perspectives settable in create and save', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicCustomAim', ['Ann', 'Ben']);
  const json = (data: unknown) => ({ data: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
  const cards = [{ text: 'A', numeric_value: 1, color: 'blue' }, { text: 'B', numeric_value: 2, color: 'blue' }];
  const create = (body: Record<string, unknown>) => page.request.post(`/api/custom_set_create.php?${q({ t })}`, json(body));

  const plain = await create({ name: 'Plain', style: 'plain', cards });
  expect(plain.status()).toBe(200);
  expect((await plain.json()).set.aim).toBe('agree');
  expect((await create({ name: 'Bad', style: 'plain', aim: 'vote', cards })).status()).toBe(400);
  expect(await (await create({ name: 'Bad', style: 'plain', aim: 'vote', cards })).json()).toMatchObject({ error: 'aim' });

  const res = await create({ name: 'Health', style: 'plain', aim: 'perspectives', cards, activate: true });
  expect(res.status()).toBe(200);
  const set = (await res.json()).set;
  expect(set.aim).toBe('perspectives');
  let state = await dao(page, t, ids[0]);
  expect(state.deck.aim).toBe('perspectives');
  expect(state.custom_sets.find((s: { set_id: number }) => s.set_id === set.set_id).aim).toBe('perspectives');

  const item = await addItem(page, t, 'Health check');
  const [keyA, keyB] = set.cards.map((c: { card_key: string }) => c.card_key);
  await play(page, t, ids, [keyA, keyB]);
  expect((await summary(page, t, ids[0])).active).toMatchObject({ result_card_key: null });
  expect((await post(page, 'topic_item_result.php', { t, item, card: keyB })).status()).toBe(409);

  // save without aim keeps it; with aim 'agree' the same set proposes the highest value
  const asInput = set.cards.map((c: Record<string, unknown>) => ({ key: c.card_key, text: c.value,
    numeric_value: c.numeric_value, color: c.color }));
  const save = (body: Record<string, unknown>) =>
    page.request.post(`/api/custom_set_save.php?${q({ t, set: set.set_id })}`, json(body));
  let saved = await save({ name: 'Health', style: 'plain', rev: set.rev, cards: asInput });
  expect((await saved.json()).set.aim).toBe('perspectives');
  expect((await saved.json()).changed).toBe(false);
  saved = await save({ name: 'Health', style: 'plain', aim: 'agree', rev: set.rev, cards: asInput });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ changed: true, new_round: false, set: { aim: 'agree' } });
  state = await dao(page, t, ids[0]);
  expect(state.deck.aim).toBe('agree');
  expect(state.topic_items.active).toMatchObject({ result_card_key: keyB, result_auto: 1 });
  expect((await save({ name: 'Health', style: 'plain', aim: 1, rev: set.rev + 1, cards: asInput })).status()).toBe(400);
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
  let list = await lists(page, t, { done: 1 });
  expect(list.open.map(i => i.id)).toEqual([b, a, c]);
  expect(list.done).toHaveLength(0);
  expect(list.open[1]).toMatchObject({ status: 'open', done_date: null, rounds_cnt: 1, result_card_key: 'eight01', result_auto: 1 });
  expect(list.open[1].last_round_date).not.toBeNull();

  expect((await post(page, 'topic_item_next.php', { t, item: b })).ok()).toBeTruthy();
  expect((await post(page, 'topic_item_reopen.php', { t, item: b })).ok()).toBeTruthy(); // default: at the end
  list = await lists(page, t);
  expect(list.open.map(i => i.id)).toEqual([a, c, b]);
});

test('get_topics.php: open list, done only on request, paging, consistent rev; dao stays small', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicLists', ['Ann']);
  const values = Array.from({ length: 100 }, (_, i) => `('${t}', ${i + 1}, 'Item ${i + 1}', repeat('x', 2000))`).join(',');
  mysql(`insert into pok_topic_items_tbl(team_id, position, heading, description) values ${values}`);
  const doneValues = Array.from({ length: 120 }, (_, i) =>
    `('${t}', 0, 'Done ${i + 1}', 'done', timestampadd(minute, ${i}, '2026-11-01 10:00:00'))`).join(',');
  mysql(`insert into pok_topic_items_tbl(team_id, position, heading, status, done_date) values ${doneValues}`);

  // the add limit (100 open items)
  const res = await post(page, 'topic_item_add.php', { t }, { heading: 'one too many' });
  expect(res.status()).toBe(409);
  expect(await res.json()).toMatchObject({ error: 'limit' });

  const plain = await lists(page, t);
  expect(plain.open).toHaveLength(100);
  expect(plain.open[0].heading).toBe('Item 1');
  expect(plain.open_count).toBe(100);
  expect(plain.done_count).toBe(120);
  expect(plain.done).toBeUndefined();
  expect(plain.limits).toEqual({ open: 100, ext_id: 20, heading: 200, description: 2000 });
  expect(plain.topics_rev).toBe(rev(t));

  const page1 = await lists(page, t, { done: 1 });
  expect(page1.done).toHaveLength(50);
  expect(page1.done?.[0].heading).toBe('Done 120'); // newest first
  const page3 = await lists(page, t, { done: 1, done_offset: 100, done_limit: 50 });
  expect(page3.done?.map(i => i.heading)).toEqual(Array.from({ length: 20 }, (_, i) => `Done ${20 - i}`));
  expect(page3.done_offset).toBe(100);
  expect((await lists(page, t, { done: 1, done_limit: 500 })).done).toHaveLength(100); // capped
  expect((await lists(page, t, { done: 1, done_offset: 500 })).done).toEqual([]);

  // dao.php has the active item, counts and the rev only - no lists, whatever the size of the lists
  const sum = await summary(page, t, ids[0]);
  expect(Object.keys(sum).sort()).toEqual(['active', 'done_count', 'next_heading', 'open_count', 'topics_rev']);
  expect(sum).toMatchObject({ open_count: 100, done_count: 120, next_heading: 'Item 2' });
  expect(sum.active?.heading).toBe('Item 1');
  expect(JSON.stringify(sum).length).toBeLessThan(2600); // one item with a 2000-character description

  // read only for the team's link: unknown team 403
  expect((await page.request.get(`/api/get_topics.php?${q({ t: 'no-such-team-xyz' })}`)).status()).toBe(403);
});

test('topics_rev rises with every change of an item, in every endpoint (and not on refused calls)', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicRev', ['Ann', 'Ben']);
  async function expectRise(label: string, call: () => Promise<APIResponse>, status = 200, rises = status === 200) {
    const before = rev(t);
    const res = await call();
    expect(res.status(), label).toBe(status);
    const after = rev(t);
    if (rises) {
      expect(after, label).toBeGreaterThan(before);
      expect((await summary(page, t, ids[0])).topics_rev, label).toBe(after);
      expect((await lists(page, t)).topics_rev, label).toBe(after);
    } else {
      expect(after, `${label} (unchanged)`).toBe(before);
    }
  }
  let a = 0;
  let b = 0;
  await expectRise('add', async () => {
    const res = await post(page, 'topic_item_add.php', { t }, { heading: 'A' });
    a = (await res.json()).item_id; return res;
  });
  await expectRise('add next', async () => {
    const res = await post(page, 'topic_item_add.php', { t, at: 'next' }, { heading: 'B' });
    b = (await res.json()).item_id; return res;
  });
  await expectRise('edit', () => post(page, 'topic_item_edit.php', { t, item: a }, { heading: 'A2' }));
  await expectRise('edit maturity', () => post(page, 'topic_item_edit.php', { t, item: a, maturity: 2 }, {}));
  await expectRise('maturity', () => post(page, 'topic_item_maturity.php', { t, item: a, maturity: 1 }));
  await expectRise('move', () => post(page, 'topic_item_move.php', { t, item: b, to: 0 }));
  await expectRise('move back', () => post(page, 'topic_item_move.php', { t, item: a, to: 0 }));
  await play(page, t, ids, ['five001', 'eight01']);
  await expectRise('result', () => post(page, 'topic_item_result.php', { t, item: a, card: 'five001' }));
  await expectRise('result auto', () => post(page, 'topic_item_result.php', { t, item: a }));
  await expectRise('new round (distribution, rounds_cnt)', () => post(page, 'newround.php', { t }));
  await play(page, t, ids, ['five001', 'eight01']);
  await expectRise('deck change with cards down (new round)', () =>
    post(page, 'update_deck.php', { t, deck: 'tshirt' }));
  await expectRise('next', () => post(page, 'topic_item_next.php', { t, item: a }));
  await expectRise('edit a done item', () => post(page, 'topic_item_edit.php', { t, item: a }, { description: 'later note' }));
  await expectRise('result of a done item', () => post(page, 'topic_item_result.php', { t, item: a, card: 'eight01' }));
  await expectRise('finish (last item)', () => post(page, 'topic_item_next.php', { t, item: b }));
  await expectRise('reopen', () => post(page, 'topic_item_reopen.php', { t, item: b }));
  await expectRise('delete', () => post(page, 'topic_item_delete.php', { t, item: b }));

  // refused calls change nothing
  await expectRise('add without heading', () => post(page, 'topic_item_add.php', { t }, { heading: '' }), 400);
  await expectRise('delete unknown', () => post(page, 'topic_item_delete.php', { t, item: b }), 404);
  await expectRise('next stale', () => post(page, 'topic_item_next.php', { t, item: a }), 409);
  await expectRise('control card as result', () => post(page, 'topic_item_result.php', { t, item: a, card: 'break01' }), 400);
  // the note and a new round without active item do not touch the items
  await expectRise('note', () => post(page, 'update_topic.php', { t }, { topic: 'note' }), 200, false);
  await play(page, t, ids, ['s000001', 'm000001']);
  await expectRise('new round without active item', () => post(page, 'newround.php', { t }), 200, false);
});

test('no code writes pok_topic_items_tbl past topic_items_write() (topics_rev at one place)', () => {
  const root = join(__dirname, '..', '..', '..');
  const files = [...readdirSync(join(root, 'api')).map(f => join('api', f)), ...readdirSync(root).filter(f => f.endsWith('.php'))]
    .filter(f => f.endsWith('.php'));
  const write = /(insert\s+into|update|delete\s+from|replace\s+into)\s+pok_topic_items_tbl\b/gi;
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    if (file !== join('api', 'lib_topics.php')) {
      expect(source.match(write), `${file} writes pok_topic_items_tbl`).toBeNull();
      continue;
    }
    // in lib_topics.php: every write statement is an argument of topic_items_write()
    const calls = source.split('topic_items_write(').slice(1).map(part => part.slice(0, 600));
    const writesInCalls = calls.reduce((n, part) => n + (part.match(/^\$link, \$t, "\s*(insert\s+into|update|delete\s+from)\s+pok_topic_items_tbl\b/i) ? 1 : 0), 0);
    const allWrites = (source.match(write) ?? []).length;
    expect(writesInCalls, 'calls of topic_items_write()').toBeGreaterThan(5);
    expect(allWrites, 'writes outside topic_items_write()').toBe(writesInCalls);
  }
});

/* ---------- S1c: leaving the item (topic_item_next.php mode) and dates in UTC ---------- */

async function next(page: Page, t: string, params: Record<string, string | number>) {
  return post(page, 'topic_item_next.php', { t, ...params });
}

test('S1c next mode close: with a card, with the current estimate, mode missing = close; invalid mode and card refused', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicClose');
  const a = await addItem(page, t, 'Alpha');
  const b = await addItem(page, t, 'Bravo');
  const c = await addItem(page, t, 'Charlie');
  await play(page, t, ids, ['five001', 'eight01', 'three01']);

  // refused before anything changes
  const before = rev(t);
  const bad = await next(page, t, { item: a, mode: 'drop' });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toEqual({ error: 'mode' });
  expect((await next(page, t, { item: a, mode: '' })).status()).toBe(400);
  expect((await next(page, t, { item: a, mode: 'close', card: 'x y' })).status()).toBe(400); // malformed key
  expect((await next(page, t, { item: a, mode: 'close', card: 'break01' })).status()).toBe(400); // control card
  expect((await next(page, t, { item: a, mode: 'close', card: 'green01' })).status()).toBe(400); // not played, not in deck
  expect((await next(page, t, { item: a, mode: 'later', card: 'five001' })).status()).toBe(400); // card only with close
  expect(rev(t)).toBe(before);
  expect((await summary(page, t, ids[0])).active?.id).toBe(a);

  // close with a played card that is not the proposal (8): stored as chosen
  const closeA = await next(page, t, { item: a, mode: 'close', card: 'five001' });
  expect(closeA.status()).toBe(200);
  expect(await closeA.json()).toEqual({ ok: true, item_id: a, active_id: b, result_card_key: 'five001', result_auto: 0 });
  expect(rev(t)).toBeGreaterThan(before);
  expect((await done(page, t))[0]).toMatchObject({ id: a, result_card_key: 'five001', result_auto: 0, rounds_cnt: 1,
    distribution: { eight01: 1, five001: 1, three01: 1 } });

  // close without card: the current estimate (automatic: highest value)
  await play(page, t, ids, ['two0001', 'three01', 'two0001']);
  const closeB = await next(page, t, { item: b, mode: 'close' });
  expect(await closeB.json()).toMatchObject({ item_id: b, active_id: c, result_card_key: 'three01', result_auto: 1 });

  // mode missing = close; the team's chosen value is the current estimate
  await play(page, t, ids, ['five001', 'eight01', 'eight01']);
  expect((await post(page, 'topic_item_result.php', { t, item: c, card: 'five001' })).ok()).toBeTruthy();
  const closeC = await next(page, t, { item: c });
  expect(await closeC.json()).toMatchObject({ item_id: c, active_id: null, result_card_key: 'five001', result_auto: 0 });
  expect((await summary(page, t, ids[0]))).toMatchObject({ active: null, open_count: 0, done_count: 3 });
});

test('S1c next mode close_empty: done without a value, also with a proposal; perspectives allowed', async ({ browser }) => {
  const { page, url, t, ids } = await setup(browser, 'TopicCloseEmpty', ['Ann', 'Ben']);
  const a = await addItem(page, t, 'Alpha');
  const b = await addItem(page, t, 'Bravo');
  await play(page, t, ids, ['five001', 'eight01']);
  const before = rev(t);
  const res = await next(page, t, { item: a, mode: 'close_empty' });
  expect(await res.json()).toEqual({ ok: true, item_id: a, active_id: b, result_card_key: null, result_auto: 0 });
  expect(rev(t)).toBeGreaterThan(before);
  expect((await done(page, t))[0]).toMatchObject({ id: a, status: 'done', result_card_key: null, rounds_cnt: 1,
    distribution: { eight01: 1, five001: 1 } });
  // the round ended: all cards up
  expect((await dao(page, t, ids[0])).players.every((p: { display_card_key: string }) => p.display_card_key === 'prgrss1')).toBeTruthy();

  // perspectives: close and close_empty store no result, a card is refused (409)
  await setTeamDeck(page, url, 'traffic');
  const c = await addItem(page, t, 'Charlie');
  await play(page, t, ids, ['green01', 'red0001']);
  const refused = await next(page, t, { item: b, mode: 'close', card: 'red0001' });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual({ error: 'perspectives' });
  // a choice stored before the deck change does not count either
  mysql(`update pok_topic_items_tbl set result_card_key = 'eight01', result_auto = 0 where id = ${b}`);
  expect(await (await next(page, t, { item: b, mode: 'close' })).json())
    .toMatchObject({ item_id: b, active_id: c, result_card_key: null, result_auto: 1 });
  expect((await done(page, t))[0]).toMatchObject({ id: b, result_card_key: null, distribution: { green01: 1, red0001: 1 } });
  const r = rev(t);
  expect(await (await next(page, t, { item: c, mode: 'close_empty' })).json())
    .toMatchObject({ item_id: c, active_id: null, result_card_key: null });
  expect(rev(t)).toBeGreaterThan(r);
});

test('S1c next mode later: stays open at the end with its rounds, the next one is active; only open item stays active', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicLater', ['Ann', 'Ben']);
  const a = await addItem(page, t, 'Alpha');
  const b = await addItem(page, t, 'Bravo');
  const c = await addItem(page, t, 'Charlie');

  // round 1 of Alpha, the team chooses 5; "later" with cards down ends the round and keeps it at the item
  await play(page, t, ids, ['five001', 'eight01']);
  expect((await post(page, 'topic_item_result.php', { t, item: a, card: 'five001' })).ok()).toBeTruthy();
  let before = rev(t);
  const later = await next(page, t, { item: a, mode: 'later' });
  expect(await later.json()).toEqual({ ok: true, item_id: a, active_id: b, result_card_key: null, result_auto: 1 });
  expect(rev(t)).toBeGreaterThan(before);
  let list = await open(page, t);
  expect(list.map(i => i.id)).toEqual([b, c, a]);
  expect(list[2]).toMatchObject({ status: 'open', rounds_cnt: 1, distribution: { eight01: 1, five001: 1 },
    result_card_key: 'eight01', result_auto: 1, done_date: null }); // the chosen 5 is reset, proposal again
  expect(list[2].last_round_date).toMatch(ISO_UTC);
  const firstRoundDate = list[2].last_round_date;
  expect((await summary(page, t, ids[0]))).toMatchObject({ open_count: 3, done_count: 0, next_heading: 'Charlie' });
  expect((await dao(page, t, ids[0])).players.every((p: { display_card_key: string }) => p.display_card_key === 'prgrss1')).toBeTruthy();

  // later without cards down: just the order
  before = rev(t);
  expect(await (await next(page, t, { item: b, mode: 'later' })).json()).toMatchObject({ item_id: b, active_id: c });
  expect(rev(t)).toBeGreaterThan(before);
  expect((await open(page, t)).map(i => i.id)).toEqual([c, a, b]);
  expect((await post(page, 'topic_item_next.php', { t, item: c, mode: 'close_empty' })).ok()).toBeTruthy();

  // Alpha comes back: a second round counts on top of the first one (rounds_cnt 2)
  await play(page, t, ids, ['three01', 'three01']);
  expect(await (await next(page, t, { item: a, mode: 'close' })).json())
    .toMatchObject({ item_id: a, active_id: b, result_card_key: 'three01', result_auto: 1 });
  const alpha = (await done(page, t)).find(i => i.id === a) as Item;
  expect(alpha).toMatchObject({ rounds_cnt: 2, distribution: { three01: 2 } });
  expect(alpha.last_round_date! >= firstRoundDate!).toBeTruthy();

  // the only open item: stays active, a stale click with another id is refused
  await play(page, t, ids, ['eight01', 'eight01']);
  before = rev(t);
  expect(await (await next(page, t, { item: b, mode: 'later' })).json())
    .toEqual({ ok: true, item_id: b, active_id: b, result_card_key: null, result_auto: 1 });
  expect(rev(t)).toBeGreaterThan(before); // the round went to the item
  expect((await summary(page, t, ids[0])).active).toMatchObject({ id: b, rounds_cnt: 1, status: 'open' });
  expect((await next(page, t, { item: a, mode: 'later' })).status()).toBe(409);
});

test('S1c dates: last_round_date and done_date as ISO 8601 UTC, independent of the server time zone', async ({ browser }) => {
  const { page, t, ids } = await setup(browser, 'TopicDates', ['Ann']);
  const a = await addItem(page, t, 'Alpha');
  const b = await addItem(page, t, 'Bravo');
  await play(page, t, ids, ['five001']);
  expect((await post(page, 'newround.php', { t })).ok()).toBeTruthy();
  expect((await next(page, t, { item: a })).ok()).toBeTruthy();
  await play(page, t, ids, ['five001']);
  expect((await post(page, 'newround.php', { t })).ok()).toBeTruthy();

  // the stored instant (unix time is exact for timestamp columns), formatted in UTC by the test
  const utc = (id: number, column: string) => new Date(Number(mysql(
    `select unix_timestamp(${column}) from pok_topic_items_tbl where id = ${id}`)) * 1000).toISOString().replace('.000Z', 'Z');
  const doneItem = (await done(page, t))[0];
  expect(doneItem.done_date).toMatch(ISO_UTC);
  expect(doneItem.done_date).toBe(utc(a, 'done_date'));
  expect(doneItem.last_round_date).toBe(utc(a, 'last_round_date'));
  const active = (await summary(page, t, ids[0])).active as Item;
  expect(active.last_round_date).toMatch(ISO_UTC);
  expect(active.last_round_date).toBe(utc(b, 'last_round_date'));
  expect(active.done_date).toBeNull();
  // close to now (the clocks of test and DB run on the same machine)
  expect(Math.abs(Date.parse(active.last_round_date as string) - Date.now())).toBeLessThan(5 * 60 * 1000);
  expect((await open(page, t))[0].last_round_date).toBe(active.last_round_date);
});

