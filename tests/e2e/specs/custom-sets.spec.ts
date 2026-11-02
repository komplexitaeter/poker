import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi } from './helpers';

/**
 * B-98 S4: custom sets of a team (api/custom_set_create.php, custom_set_save.php, custom_set_delete.php, deck
 * 'c-<set id>' in update_deck.php, custom_sets in dao.php) and the migration of old mixed decks into a set
 * "Our deck". API level only (the editor comes with Fred's part).
 */

// same credentials as the test config written by tests/e2e/setup.sh
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function teamIdOf(url: string): string {
  const teamId = new URL(url).searchParams.get('t') as string;
  expect(teamId).toMatch(/^[A-Za-z0-9_-]+$/); // safe to put into the SQL below
  return teamId;
}

/** Bitmask as the old deck menu stores it: '1' at the given positions of cards.json v1. */
function flags(indexes: number[], length = 46): string {
  const bits = Array<string>(length).fill('0');
  for (const i of indexes) bits[i] = '1';
  return bits.join('');
}

type Card = { key?: string | null; symbol?: string | null; text?: string | null; heading?: string | null;
  description?: string | null; numeric_value?: number | string | null; color?: string };

function api(page: Page, t: string) {
  const q = (params: Record<string, string>) => new URLSearchParams({ t, ...params }).toString();
  return {
    create: (body: unknown) => page.request.post(`/api/custom_set_create.php?${q({})}`,
      { data: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    save: (set: number, body: unknown) => page.request.post(`/api/custom_set_save.php?${q({ set: String(set) })}`,
      { data: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    remove: (set: number) => page.request.post(`/api/custom_set_delete.php?${q({ set: String(set) })}`),
    deck: (deck: string, extra = '') => page.request.post(`/api/update_deck.php?${q({ deck })}${extra}`),
    setc: (id: string, cardkey: string) => page.request.post(`/api/setc.php?${q({ id, cardkey })}`),
    newround: () => page.request.post(`/api/newround.php?${q({})}`),
    dao: async (id: string) => {
      const res = await page.request.get(`/api/dao.php?${new URLSearchParams({ id, t }).toString()}`);
      expect(res.ok()).toBeTruthy();
      return res.json();
    },
  };
}

/** a card as sent back by the editor: the stored card (dao/answer) turned into a request card */
function asRequest(card: Record<string, unknown>, changes: Card = {}): Card {
  return { key: card.card_key as string, symbol: card.symbol as string | null,
    text: card.symbol === null ? card.value as string : null, heading: card.heading as string | null,
    description: card.description as string | null, numeric_value: card.numeric_value as number | null,
    color: card.color as string, ...changes };
}

const RISK: Card[] = [
  { symbol: 's-1', heading: 'low', numeric_value: 1, color: 'green' },
  { text: 'M', numeric_value: 2, color: 'amber' },
  { text: 'high', description: 'We should split it.', numeric_value: 3, color: 'red' },
];

test('create, activate, play, save (diff, rev conflict, new round) and delete a custom set', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Custom Sets');
  const t = teamIdOf(url);
  const [anna, ben] = await addPlayersViaApi(page, url, ['Anna', 'Ben']);
  const a = api(page, t);

  const res = await a.create({ name: 'Risk', style: 'badge', cards: RISK, activate: true });
  expect(res.status()).toBe(200);
  const created = await res.json();
  const set = created.set;
  const keys: string[] = set.cards.map((card: { card_key: string }) => card.card_key);
  for (const key of keys) expect(key).toMatch(/^c-[a-z0-9]{1,5}$/);
  expect(set).toMatchObject({ name: 'Risk', style: 'badge', rev: 1, deck_id: `c-${set.set_id}` });
  expect(set.cards.map((card: { value: string }) => card.value)).toEqual(['1', 'M', 'high']);
  expect(set.cards[0]).toMatchObject({ symbol: 's-1', heading: 'low', numeric_value: 1, color: 'green', sort_order: 0 });
  expect(set.cards[2]).toMatchObject({ symbol: null, description: 'We should split it.', numeric_value: 3 });
  expect(created.deck).toMatchObject({ id: set.deck_id, group: 'custom', set_id: set.set_id, cards: keys });
  expect(created.new_round).toBe(false);

  let dao = await a.dao(anna);
  expect(dao.custom_sets).toEqual([set]);
  expect(dao.deck).toMatchObject({ id: set.deck_id, group: 'custom', cards: keys, controls: ['break01', 'qstmrk1'] });
  expect(dao.custom_limits).toEqual({ sets: 5, cards: 16 });

  // B-103: custom keys of the deck can be played, others not; sorting by numeric value (Ben 1 before Anna 3)
  expect((await a.setc(anna, keys[2])).ok()).toBeTruthy();
  expect((await a.setc(ben, 'three01')).status()).toBe(400);
  expect((await a.setc(ben, keys[0])).ok()).toBeTruthy();
  dao = await a.dao(anna);
  expect(dao.players.map((p: { name: string; display_card_key: string }) => [p.name, p.display_card_key]))
    .toEqual([['Ben', keys[0]], ['Anna', keys[2]]]);

  // save: card 0 unchanged, card 1 with a new heading (new key), card 2 removed, a new card -> new round (cards down)
  let saved = await a.save(set.set_id, { name: 'Risk level', style: 'badge', rev: 1, cards: [
    asRequest(set.cards[0]), asRequest(set.cards[1], { heading: 'medium' }),
    { text: '½', numeric_value: 0.5, color: 'blue' },
  ] });
  expect(saved.status()).toBe(200);
  let body = await saved.json();
  expect(body).toMatchObject({ changed: true, new_round: true });
  const keys2: string[] = body.set.cards.map((card: { card_key: string }) => card.card_key);
  expect(keys2[0]).toBe(keys[0]);
  expect(keys2[1]).not.toBe(keys[1]);
  expect(body.set).toMatchObject({ name: 'Risk level', rev: 2 });
  expect(body.deck).toMatchObject({ id: set.deck_id, cards: keys2, rev: created.deck.rev + 1 });
  expect(sql(`select group_concat(card_key order by id) from pok_custom_cards_tbl where set_id = ${set.set_id} and active = 0`))
    .toBe(`${keys[1]},${keys[2]}`);
  // the round snapshot keeps the old deck and the custom keys played in it
  const round = sql(`select concat_ws('|', id, deck_id, deck_cards) from pok_roundstats_tbl where team_id = '${t}'
                      order by id desc limit 1`).split('|');
  expect(round.slice(1)).toEqual([set.deck_id, keys.join(',')]);
  expect(sql(`select group_concat(card_key order by name) from pok_roundstat_details_tbl where roundstat_id = ${round[0]}`))
    .toBe(`${keys[2]},${keys[0]}`);
  expect(sql(`select count(card_key) from pok_players_tbl where team_id = '${t}'`)).toBe('0');

  // only the order changes while a card is down: no new round, keys stay
  expect((await a.setc(anna, keys2[2])).ok()).toBeTruthy();
  saved = await a.save(set.set_id, { name: 'Risk level', style: 'badge', rev: 2,
    cards: [body.set.cards[2], body.set.cards[0], body.set.cards[1]].map(card => asRequest(card)) });
  body = await saved.json();
  expect(body).toMatchObject({ changed: true, new_round: false });
  expect(body.set.cards.map((card: { card_key: string }) => card.card_key)).toEqual([keys2[2], keys2[0], keys2[1]]);
  expect(sql(`select card_key from pok_players_tbl where id = '${anna}' and team_id = '${t}'`)).toBe(keys2[2]);

  // unchanged: nothing stored
  saved = await a.save(set.set_id, { name: 'Risk level', style: 'badge', rev: 3,
    cards: body.set.cards.map((card: Record<string, unknown>) => asRequest(card)) });
  expect(await saved.json()).toMatchObject({ changed: false, set: { rev: 3 } });

  // someone else saved in between: 409 with the current set, force overwrites
  const stale = { name: 'Mine', style: 'plain', rev: 2, cards: body.set.cards.map((card: Record<string, unknown>) => asRequest(card)) };
  saved = await a.save(set.set_id, stale);
  expect(saved.status()).toBe(409);
  expect(await saved.json()).toMatchObject({ error: 'conflict', set: { set_id: set.set_id, rev: 3, name: 'Risk level' } });
  saved = await a.save(set.set_id, { ...stale, force: true });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ changed: true, set: { name: 'Mine', style: 'plain', rev: 4 } });

  // a card that is in no active set any more but still on the table comes along in custom_cards_played
  sql(`update pok_players_tbl set card_key = '${keys[1]}' where id = '${ben}' and team_id = '${t}'`);
  dao = await a.dao(anna);
  expect(dao.custom_cards_played).toEqual([expect.objectContaining({ card_key: keys[1], value: 'M', active: false })]);

  // delete the active set while cards are down: default deck, new round; again: 404
  const removed = await a.remove(set.set_id);
  expect(removed.status()).toBe(200);
  expect(await removed.json()).toMatchObject({ new_round: true, deck: { id: 'fib-classic', group: 'fib' } });
  dao = await a.dao(anna);
  expect(dao.custom_sets).toEqual([]);
  expect(dao.deck).toMatchObject({ id: 'fib-classic', controls: ['break01', 'qstmrk1'] });
  expect((await a.remove(set.set_id)).status()).toBe(404);
  expect((await a.deck(set.deck_id)).status()).toBe(400);
});

test('custom sets: validation, limits, other teams', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Custom Limits');
  const t = teamIdOf(url);
  const a = api(page, t);
  const ok = { name: 'Set', style: 'plain', cards: RISK };

  const bad: [string, unknown, string][] = [
    ['emoji text', { ...ok, cards: [{ text: '🙂', color: 'red' }] }, 'text'],
    ['flag text', { ...ok, cards: [{ text: '🇩🇪', color: 'red' }] }, 'text'],
    ['text too long', { ...ok, cards: [{ text: '1234567', color: 'red' }] }, 'text'],
    ['symbol not in the library', { ...ok, cards: [{ symbol: 's-coffee', color: 'red' }] }, 'symbol'],
    ['symbol and text', { ...ok, cards: [{ symbol: 's-1', text: '1', color: 'red' }] }, 'symbol_or_text'],
    ['neither', { ...ok, cards: [{ color: 'red' }] }, 'symbol_or_text'],
    ['catalog colour', { ...ok, cards: [{ text: '1', color: 'v3' }] }, 'color'],
    ['heading too long', { ...ok, cards: [{ text: '1', color: 'red', heading: 'x'.repeat(17) }] }, 'heading'],
    ['description too long', { ...ok, cards: [{ text: '1', color: 'red', description: 'x'.repeat(161) }] }, 'description'],
    ['numeric value', { ...ok, cards: [{ text: '1', color: 'red', numeric_value: 'abc' }] }, 'numeric_value'],
    ['17 cards', { ...ok, cards: Array.from({ length: 17 }, (_, i) => ({ text: String(i), color: 'red' })) }, 'too_many_cards'],
    ['no cards', { ...ok, cards: [] }, 'no_cards'],
    ['no name', { ...ok, name: '  ' }, 'name'],
    ['name too long', { ...ok, name: 'x'.repeat(25) }, 'name'],
    ['style', { ...ok, style: 'fancy' }, 'style'],
    // format characters (bidi override, zero-width space) could spoof texts on the board (Sina, review S4)
    ['bidi override in name', { ...ok, name: '\u202Eevil' }, 'name'],
    ['zero-width space in heading', { ...ok, cards: [{ text: '1', color: 'red', heading: 'lo\u200Bw' }] }, 'heading'],
    ['bidi override in description', { ...ok, cards: [{ text: '1', color: 'red', description: 'a\u202Eb' }] }, 'description'],
    ['body', 'no json', 'body'],
  ];
  for (const [name, body, error] of bad) {
    const res = await a.create(body);
    expect(res.status(), name).toBe(400);
    expect((await res.json()).error, name).toBe(error);
  }
  expect(sql(`select count(1) from pok_custom_sets_tbl where team_id = '${t}'`)).toBe('0');

  // 16 cards, 6 characters, umlauts, a number as text: fine
  const sixteen = Array.from({ length: 16 }, (_, i) => ({ text: i === 0 ? 'Größe1' : String(i), color: 'grey',
    numeric_value: String(i) }));
  const first = await a.create({ ...ok, cards: sixteen });
  expect(first.status()).toBe(200);
  const big = (await first.json()).set;
  expect(big.cards[0]).toMatchObject({ value: 'Größe1', numeric_value: 0 });
  // saving may not add a 17th card
  const more = [...big.cards.map((card: Record<string, unknown>) => asRequest(card)), { text: 'x', color: 'red' }];
  const res17 = await a.save(big.set_id, { name: 'Set', style: 'plain', rev: 1, cards: more });
  expect(res17.status()).toBe(400);
  expect((await res17.json()).error).toBe('too_many_cards');

  // GET is refused, a wrong team gets 403
  expect((await page.request.get(`/api/custom_set_create.php?t=${t}`)).status()).toBe(405);
  expect((await page.request.post('/api/custom_set_create.php?t=nope', { data: JSON.stringify(ok) })).status()).toBe(403);

  // at most 5 sets per team
  for (let i = 2; i <= 5; i++) expect((await a.create(ok)).status()).toBe(200);
  const sixth = await a.create(ok);
  expect(sixth.status()).toBe(400);
  expect(await sixth.json()).toMatchObject({ error: 'set_limit', max: 5 });

  // another team can neither save, delete nor activate these sets
  const other = await newPlayer(browser);
  const t2 = teamIdOf(await createTeam(other, 'Other Team'));
  const b = api(other, t2);
  expect((await b.save(big.set_id, { name: 'X', style: 'plain', rev: 1, cards: RISK })).status()).toBe(404);
  expect((await b.remove(big.set_id)).status()).toBe(404);
  expect((await b.deck(big.deck_id)).status()).toBe(400);

  // own team: activate through update_deck.php, a cards parameter is refused
  expect((await a.deck(big.deck_id, '&cards=c-1')).status()).toBe(400);
  const activated = await a.deck(big.deck_id);
  expect(activated.status()).toBe(200);
  expect(await activated.json()).toMatchObject({ changed: true, deck: { id: big.deck_id, group: 'custom' } });
});

test('old mixed decks become a custom set "Our deck" (idempotent, parallel loads)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Mixed Deck');
  const t = teamIdOf(url);
  const [anna] = await addPlayersViaApi(page, url, ['Anna']);
  const a = api(page, t);
  const reset = (cardsetFlags: string) => sql(`update pok_teams_tbl set cardset_flags = '${cardsetFlags}',
    deck_id = null, deck_cards = null, deck_controls = null where id = '${t}'`);
  const setCount = () => sql(`select count(1) from pok_custom_sets_tbl where team_id = '${t}' and deleted = 0`);

  // Fibonacci 1 2 3 + 🙂 + ? (four parallel loads, one set)
  reset(flags([2, 3, 4, 18, 43]));
  const loads = await Promise.all([1, 2, 3, 4].map(() => a.dao(anna)));
  expect(setCount()).toBe('1');
  const dao = loads[0];
  for (const other of loads) expect(other.deck).toEqual(dao.deck);
  const set = dao.custom_sets[0];
  expect(set).toMatchObject({ name: 'Our deck', style: 'plain' });
  expect(set.cards.map((c: Record<string, unknown>) => [c.symbol, c.value, c.numeric_value, c.color, c.description]))
    .toEqual([['s-1', '1', 1, 'v1', null], ['s-2', '2', 2, 'v2', null], ['s-3', '3', 3, 'v3', null],
              ['s-face-satisfied', '🙂', null, 'esatis', 'satisfied']]);
  expect(dao.deck).toMatchObject({ id: set.deck_id, group: 'custom', controls: ['qstmrk1'],
    cards: set.cards.map((c: { card_key: string }) => c.card_key) });
  expect(sql(`select concat_ws('|', deck_id, deck_cards, deck_controls) from pok_teams_tbl where id = '${t}'`))
    .toBe(`${set.deck_id}|${dao.deck.cards.join(',')}|qstmrk1`);

  // the old deck menu chooses the same cards again: the set is reused
  expect((await page.request.post(`/api/update_cardset.php?t=${t}&cardset_flags=${flags([2, 3, 4, 18, 43])}`)).ok()).toBeTruthy();
  expect((await a.dao(anna)).deck.id).toBe(set.deck_id);
  expect(setCount()).toBe('1');

  // Fibonacci 1 2 3 5 8 13 + Numbers 4 6 7 + ☕: the cards in the old order (sort_order)
  reset(flags([2, 3, 4, 5, 6, 7, 8, 9, 10, 24]));
  const dao2 = await a.dao(anna);
  expect(setCount()).toBe('2');
  const set2 = dao2.custom_sets.find((s: { deck_id: string }) => s.deck_id === dao2.deck.id);
  expect(set2.cards.map((c: { value: string }) => c.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '13']);
  expect(set2.cards.map((c: { numeric_value: number }) => c.numeric_value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 13]);
  expect(dao2.deck.controls).toEqual(['break01']);

  // a custom key can be played, the round snapshot keeps the custom deck
  const four = set2.cards[3].card_key;
  expect((await a.setc(anna, four)).ok()).toBeTruthy();
  expect((await a.newround()).ok()).toBeTruthy();
  expect(sql(`select concat_ws('|', r.deck_id, r.deck_cards, d.card_key) from pok_roundstats_tbl r
               join pok_roundstat_details_tbl d on d.roundstat_id = r.id where r.team_id = '${t}' order by r.id desc limit 1`))
    .toBe(`${dao2.deck.id}|${dao2.deck.cards.join(',')}|${four}`);

  // all Fibonacci cards + all six faces: 18 cards, more than 16 is fine for a migrated set; saving may keep them
  reset(flags([0, 1, 2, 3, 4, 6, 9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23]));
  const dao3 = await a.dao(anna);
  const set3 = dao3.custom_sets.find((s: { deck_id: string }) => s.deck_id === dao3.deck.id);
  expect(set3.cards).toHaveLength(18);
  // an edited copy of a migrated card may keep its catalog colour and symbol
  const cards3 = set3.cards.map((c: Record<string, unknown>) => asRequest(c));
  cards3[0] = { ...cards3[0], heading: 'nothing' };
  const saved = await a.save(set3.set_id, { name: 'Our deck', style: 'plain', rev: set3.rev, cards: cards3 });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).set.cards[0]).toMatchObject({ symbol: 's-0', color: 'v0', heading: 'nothing' });

  // Fibonacci + stars + T-shirt: values of custom_symbol_values (stars 0-5, T-shirt 1-7), not the catalog's sort values
  reset(flags([2, 3, 28, 32, 35]));
  const daoStars = await a.dao(anna);
  const setStars = daoStars.custom_sets.find((s: { deck_id: string }) => s.deck_id === daoStars.deck.id);
  expect(setStars.cards.map((c: Record<string, unknown>) => [c.symbol, c.numeric_value]))
    .toEqual([['s-1', 1], ['s-2', 2], ['s-m', 4], ['s-stars-0', 0], ['s-stars-3', 3]]);
  sql(`update pok_custom_sets_tbl set deleted = 1 where id = ${setStars.set_id}`);

  // a huge mixed deck (37 cards): migrated as well, the keys do not fit into deck_cards (null), the deck still works
  // (keys of live length: 'c-' + 5 base36 characters)
  sql(`alter table pok_custom_cards_tbl auto_increment = 40000000`);
  reset(flags([0, 1, 2, 3, 4, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31,
    32, 33, 34, 35, 36, 37, 40, 41, 42]));
  const dao4 = await a.dao(anna);
  expect(dao4.deck.group).toBe('custom');
  expect(dao4.deck.cards).toHaveLength(37);
  expect(sql(`select ifnull(deck_cards, 'NULL') from pok_teams_tbl where id = '${t}'`)).toBe('NULL');
  expect((await a.setc(anna, dao4.deck.cards[36])).ok()).toBeTruthy();

  // with 5 sets the migration falls back to the default deck (no 6th set)
  sql(`update pok_custom_sets_tbl set deleted = 1 where team_id = '${t}'`);
  for (let i = 0; i < 5; i++) expect((await a.create({ name: `S${i}`, style: 'plain', cards: RISK })).status()).toBe(200);
  reset(flags([2, 3, 4, 18, 43]));
  expect((await a.dao(anna)).deck).toMatchObject({ id: 'fib-classic', controls: ['qstmrk1'] });
  expect(setCount()).toBe('5');
});

test('revealed custom cards are ordered by their position in the set, not by value', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Custom Order');
  const t = teamIdOf(url);
  const [anna, ben, cleo] = await addPlayersViaApi(page, url, ['Anna', 'Ben', 'Cleo']);
  const a = api(page, t);
  // the values contradict the positions on purpose; the card without value is in the middle
  const res = await a.create({ name: 'Order', style: 'plain', activate: true, cards: [
    { text: 'big', numeric_value: 100, color: 'red' }, { text: 'none', color: 'grey' },
    { text: 'small', numeric_value: 1, color: 'green' }] });
  expect(res.status()).toBe(200);
  const keys: string[] = (await res.json()).set.cards.map((c: { card_key: string }) => c.card_key);
  expect((await a.setc(anna, keys[2])).ok()).toBeTruthy();
  expect((await a.setc(ben, keys[1])).ok()).toBeTruthy();
  expect((await a.setc(cleo, keys[0])).ok()).toBeTruthy();
  const dao = await a.dao(anna);
  expect(dao.deck.cards).toEqual(keys);
  expect(dao.players.map((p: { name: string }) => p.name)).toEqual(['Cleo', 'Ben', 'Anna']);
});
