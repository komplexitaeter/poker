import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi, removeExampleSet } from './helpers';

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
  await removeExampleSet(url);
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
  expect(dao.custom_limits).toEqual({ sets: 5, cards: 20 });

  // B-103: custom keys of the deck can be played, others not; sorting by numeric value (Ben 1 before Anna 3)
  expect((await a.setc(anna, keys[2])).ok()).toBeTruthy();
  expect((await a.setc(ben, 'three01')).status()).toBe(400);
  expect((await a.setc(ben, keys[0])).ok()).toBeTruthy();
  dao = await a.dao(anna);
  expect(dao.players.map((p: { name: string; display_card_key: string }) => [p.name, p.display_card_key]))
    .toEqual([['Ben', keys[0]], ['Anna', keys[2]]]);

  // save: card 0 unchanged, card 1 with a new text (new key), card 2 removed, a new card -> new round (cards down)
  let saved = await a.save(set.set_id, { name: 'Risk level', style: 'badge', rev: 1, cards: [
    asRequest(set.cards[0]), asRequest(set.cards[1], { text: 'Mid' }),
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

/* Andreas 2026-11-03: heading, description and colour change in place (same key, no new round, the table shows the new
 * texts); any change of the cards of the deck starts a new round (variant b): an added card, a new symbol, text or
 * value (new key) or a removed card */
test('save while cards are down: in-place changes keep the round, added/value/text/symbol/removal start a new one', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Custom In Place');
  await removeExampleSet(url);
  const t = teamIdOf(url);
  const [anna, ben] = await addPlayersViaApi(page, url, ['Anna', 'Ben']);
  const a = api(page, t);
  const created = await (await a.create({ name: 'Risk', style: 'badge', cards: RISK, activate: true })).json();
  const keys: string[] = created.set.cards.map((card: { card_key: string }) => card.card_key);
  const rounds = () => sql(`select count(1) from pok_roundstats_tbl where team_id = '${t}'`);
  const down = () => sql(`select group_concat(ifnull(card_key, '-') order by name) from pok_players_tbl
                          where team_id = '${t}' and id in ('${anna}', '${ben}')`);
  expect((await a.setc(anna, keys[1])).ok()).toBeTruthy();
  expect((await a.setc(ben, keys[0])).ok()).toBeTruthy();
  const before = rounds();

  // heading, description and colour of a card that is down: keys stay, no new round, deck.rev + 1
  let body = await (await a.save(created.set.set_id, { name: 'Risk', style: 'badge', rev: 1, cards: [
    asRequest(created.set.cards[0], { color: 'teal' }),
    asRequest(created.set.cards[1], { heading: 'medium', description: 'Somewhere in between.', color: 'blue' }),
    asRequest(created.set.cards[2]),
  ] })).json();
  expect(body).toMatchObject({ changed: true, new_round: false, set: { rev: 2 }, deck: { rev: created.deck.rev + 1 } });
  let set = body.set;
  expect(set.cards.map((card: { card_key: string }) => card.card_key)).toEqual(keys);
  expect(set.cards[1]).toMatchObject({ card_key: keys[1], value: 'M', heading: 'medium',
    description: 'Somewhere in between.', color: 'blue', numeric_value: 2, active: true });
  expect(rounds()).toBe(before);
  expect(down()).toBe(`${keys[1]},${keys[0]}`);
  expect(sql(`select count(1) from pok_custom_cards_tbl where set_id = ${set.set_id} and active = 0`)).toBe('0');
  let dao = await a.dao(anna);
  expect(dao.deck.cards).toEqual(set.cards.map((card: { card_key: string }) => card.card_key));
  expect(dao.custom_sets[0].cards[1]).toMatchObject({ card_key: keys[1], heading: 'medium', color: 'blue' });
  expect(dao.custom_sets[0].cards[0]).toMatchObject({ card_key: keys[0], color: 'teal' });
  expect(dao.players.find((p: { name: string }) => p.name === 'Anna').display_card_key).toBe(keys[1]);

  // an added card, each of value, text, symbol of a card that is down, and removing a card -> new round
  const variants: [string, (cards: Record<string, unknown>[]) => Card[]][] = [
    ['added', cards => [...cards.map(card => asRequest(card)), { text: 'XL', numeric_value: 5, color: 'violet' }]],
    ['value', cards => cards.map((card, i) => asRequest(card, i === 1 ? { numeric_value: 2.5 } : {}))],
    ['text', cards => cards.map((card, i) => asRequest(card, i === 1 ? { text: 'Mid' } : {}))],
    ['symbol', cards => cards.map((card, i) => asRequest(card, i === 0 ? { symbol: 's-2' } : {}))],
    ['removed', cards => cards.filter((_card, i) => i !== 2).map(card => asRequest(card))],
  ];
  for (const [what, change] of variants) {
    const played = what === 'symbol' ? set.cards[0].card_key : set.cards[what === 'removed' ? 2 : 1].card_key;
    expect((await a.setc(anna, played)).ok()).toBeTruthy();
    const count = Number(rounds());
    body = await (await a.save(set.set_id, { name: 'Risk', style: 'badge', rev: set.rev, cards: change(set.cards) })).json();
    expect(body, what).toMatchObject({ changed: true, new_round: true });
    expect(Number(rounds()), what).toBe(count + 1);
    if (what !== 'added') {
      expect(body.set.cards.map((card: { card_key: string }) => card.card_key), what).not.toContain(played);
      expect(sql(`select active from pok_custom_cards_tbl where card_key = '${played}'`), what).toBe('0');
    }
    set = body.set;
  }
  expect(sql(`select count(card_key) from pok_players_tbl where team_id = '${t}'`)).toBe('0');
});

test('B-98: single cards of a custom set on/off (update_deck.php cards), kept consistent by a save of the set', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Custom Toggle');
  const t = teamIdOf(url);
  const [anna, ben] = await addPlayersViaApi(page, url, ['Anna', 'Ben']);
  const a = api(page, t);
  const FOUR: Card[] = [...RISK, { text: 'XL', numeric_value: 5, color: 'violet' }];
  const created = await (await a.create({ name: 'Risk', style: 'badge', cards: FOUR, activate: true })).json();
  const set = created.set;
  const keys: string[] = set.cards.map((card: { card_key: string }) => card.card_key);
  const other = await (await a.create({ name: 'Other', style: 'plain', cards: RISK })).json();
  const rounds = () => Number(sql(`select count(1) from pok_roundstats_tbl where team_id = '${t}'`));
  const storedCards = () => sql(`select ifnull(deck_cards, 'NULL') from pok_teams_tbl where id = '${t}'`);
  expect((await a.deck(other.set.deck_id, `&id=${anna}`)).ok()).toBeTruthy();
  expect(await (await a.deck(set.deck_id, `&id=${anna}`)).json()).toMatchObject({ changed: true, deck: { cards: keys } });
  expect((await a.dao(anna)).deck.changed_by).toBe('Anna');

  // invalid: fewer than two cards, a key of another set, a catalog key, a removed key, malformed
  for (const cards of [keys[0], `${keys[0]},${keys[0]}`, `${keys[0]},${other.set.cards[0].card_key}`,
                       `${keys[0]},three01`, `${keys[0]},<b>`, ''])
    expect((await a.deck(set.deck_id, `&cards=${encodeURIComponent(cards)}`)).status(), cards).toBe(400);
  expect(storedCards()).toBe(keys.join(','));

  // a selection in any order: deck in set order, the set stays complete, same group -> changed_by stays
  let body = await (await a.deck(set.deck_id, `&id=${ben}&cards=${keys[3]},${keys[0]},${keys[1]}`)).json();
  expect(body).toMatchObject({ changed: true, new_round: false, deck: { id: set.deck_id, cards: [keys[0], keys[1], keys[3]] } });
  let dao = await a.dao(anna);
  expect(dao.deck.cards).toEqual([keys[0], keys[1], keys[3]]);
  expect(dao.deck.changed_by).toBe('Anna');
  expect(dao.custom_sets.find((s: { set_id: number }) => s.set_id === set.set_id).cards.map((c: { card_key: string }) => c.card_key))
    .toEqual(keys);
  expect(storedCards()).toBe(`${keys[0]},${keys[1]},${keys[3]}`);
  expect((await a.setc(anna, keys[2])).status()).toBe(400); // switched off: cannot be played

  // cards down: switching a card on starts a new round (variant b, Andreas 2026-11-03), switching one off as well;
  // the same selection again changes nothing
  expect((await a.setc(anna, keys[0])).ok()).toBeTruthy();
  const before = rounds();
  body = await (await a.deck(set.deck_id, `&cards=${keys[0]},${keys[1]},${keys[2]},${keys[3]}`)).json();
  expect(body).toMatchObject({ changed: true, new_round: true, deck: { cards: keys } });
  expect(rounds()).toBe(before + 1);
  expect(sql(`select deck_cards from pok_roundstats_tbl where team_id = '${t}' order by id desc limit 1`))
    .toBe(`${keys[0]},${keys[1]},${keys[3]}`);
  expect((await a.setc(anna, keys[0])).ok()).toBeTruthy();
  body = await (await a.deck(set.deck_id, `&cards=${keys[3]},${keys[2]},${keys[1]},${keys[0]}`)).json();
  expect(body).toMatchObject({ changed: false, new_round: false, deck: { cards: keys } });
  expect(rounds()).toBe(before + 1);
  body = await (await a.deck(set.deck_id, `&cards=${keys[1]},${keys[2]}`)).json();
  expect(body).toMatchObject({ changed: true, new_round: true, deck: { cards: [keys[1], keys[2]] } });
  expect(rounds()).toBe(before + 2);
  expect(sql(`select deck_cards from pok_roundstats_tbl where team_id = '${t}' order by id desc limit 1`)).toBe(keys.join(','));
  expect(sql(`select count(card_key) from pok_players_tbl where team_id = '${t}'`)).toBe('0');

  // save in the editor: off cards stay off (also with a new value = new key), removed cards drop out, new cards are on
  body = await (await a.deck(set.deck_id, `&cards=${keys[0]},${keys[1]},${keys[2]}`)).json(); // keys[3] off
  body = await (await a.save(set.set_id, { name: 'Risk', style: 'badge', rev: set.rev, cards: [
    asRequest(set.cards[0]), asRequest(set.cards[2]), asRequest(set.cards[3], { text: 'XXL' }),
    { text: 'S', numeric_value: 0, color: 'blue' },
  ] })).json(); // keys[1] removed, keys[3] replaced, one new card
  expect(body.changed).toBe(true);
  const current = body.set;
  const full: string[] = body.set.cards.map((card: { card_key: string }) => card.card_key);
  expect(full.slice(0, 2)).toEqual([keys[0], keys[2]]);
  expect(full[2]).not.toBe(keys[3]);
  expect(body.deck.cards).toEqual([keys[0], keys[2], full[3]]);
  expect((await a.dao(anna)).deck.cards).toEqual([keys[0], keys[2], full[3]]);

  // a save that leaves fewer than two cards on (the second one removed): all cards on again
  body = await (await a.deck(set.deck_id, `&cards=${full[0]},${full[1]}`)).json();
  expect(body.deck.cards).toEqual([full[0], full[1]]);
  body = await (await a.save(set.set_id, { name: 'Risk', style: 'badge', rev: current.rev,
    cards: [asRequest(current.cards[0]), asRequest(current.cards[2]), asRequest(current.cards[3])] })).json();
  expect(body.set.cards.map((card: { card_key: string }) => card.card_key)).toEqual([full[0], full[2], full[3]]);
  expect(body.deck.cards).toEqual([full[0], full[2], full[3]]);
  const rest = [full[0], full[2], full[3]];

  // activating another set and back without cards: all its cards
  body = await (await a.deck(set.deck_id, `&cards=${rest[0]},${rest[1]}`)).json();
  expect(body.deck.cards).toEqual([rest[0], rest[1]]);
  expect((await a.deck(other.set.deck_id)).ok()).toBeTruthy();
  expect((await (await a.deck(set.deck_id)).json()).deck.cards).toEqual(rest);
  expect((await a.dao(ben)).deck.cards).toEqual(rest);
});

test('custom sets: validation, limits, other teams', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Custom Limits');
  await removeExampleSet(url);
  const t = teamIdOf(url);
  const a = api(page, t);
  const ok = { name: 'Set', style: 'plain', cards: RISK };

  const bad: [string, unknown, string][] = [
    // emoji are fine (see below), but at most 6 graphemes and no spoofing characters
    ['7 emoji', { ...ok, cards: [{ text: '🎉🎉🎉🎉🎉🎉🎉', color: 'red' }] }, 'text'],
    ['7 graphemes with families', { ...ok, cards: [{ text: '👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧x', color: 'red' }] }, 'text'],
    ['bidi override in text', { ...ok, cards: [{ text: 'a\u202Eb', color: 'red' }] }, 'text'],
    ['bidi isolate in text', { ...ok, cards: [{ text: '\u2066ab', color: 'red' }] }, 'text'],
    ['zero-width space in text', { ...ok, cards: [{ text: '1\u200B', color: 'red' }] }, 'text'],
    ['only a joiner', { ...ok, cards: [{ text: '\u200D', color: 'red' }] }, 'text'],
    // a joiner only joins pictographs: 24 letters with joiners are 24 graphemes (Sina, review emoji)
    ['letters joined by ZWJ', { ...ok, cards: [{ text: [...'ABCDEFGHIJKLMNOPQRSTUVWX'].join('\u200D'), color: 'red' }] }, 'text'],
    // invisible characters could fake an empty card
    ['Hangul filler', { ...ok, cards: [{ text: '\u3164', color: 'red' }] }, 'text'],
    ['blank Braille', { ...ok, cards: [{ text: '1\u2800', color: 'red' }] }, 'text'],
    ['line separator in text', { ...ok, cards: [{ text: 'a\u2028b', color: 'red' }] }, 'text'],
    ['paragraph separator in name', { ...ok, name: 'a\u2029b' }, 'name'],
    ['line separator in heading', { ...ok, cards: [{ text: '1', color: 'red', heading: 'a\u2028b' }] }, 'heading'],
    ['text too long', { ...ok, cards: [{ text: '1234567', color: 'red' }] }, 'text'],
    ['symbol not in the library', { ...ok, cards: [{ symbol: 's-coffee', color: 'red' }] }, 'symbol'],
    ['symbol and text', { ...ok, cards: [{ symbol: 's-1', text: '1', color: 'red' }] }, 'symbol_or_text'],
    ['neither', { ...ok, cards: [{ color: 'red' }] }, 'symbol_or_text'],
    ['catalog colour', { ...ok, cards: [{ text: '1', color: 'v3' }] }, 'color'],
    ['heading too long', { ...ok, cards: [{ text: '1', color: 'red', heading: 'x'.repeat(17) }] }, 'heading'],
    ['description too long', { ...ok, cards: [{ text: '1', color: 'red', description: 'x'.repeat(161) }] }, 'description'],
    ['numeric value', { ...ok, cards: [{ text: '1', color: 'red', numeric_value: 'abc' }] }, 'numeric_value'],
    ['21 cards', { ...ok, cards: Array.from({ length: 21 }, (_, i) => ({ text: String(i), color: 'red' })) }, 'too_many_cards'],
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

  // 20 cards, 6 characters, umlauts, a number as text: fine
  const twenty = Array.from({ length: 20 }, (_, i) => ({ text: i === 0 ? 'Größe1' : String(i), color: 'grey',
    numeric_value: String(i) }));
  const first = await a.create({ ...ok, cards: twenty });
  expect(first.status()).toBe(200);
  const big = (await first.json()).set;
  expect(big.cards[0]).toMatchObject({ value: 'Größe1', numeric_value: 0 });
  // saving may not add a 21st card
  const more = [...big.cards.map((card: Record<string, unknown>) => asRequest(card)), { text: 'x', color: 'red' }];
  const res21 = await a.save(big.set_id, { name: 'Set', style: 'plain', rev: 1, cards: more });
  expect(res21.status()).toBe(400);
  expect(await res21.json()).toMatchObject({ error: 'too_many_cards', max: 20 });

  // emoji as card text (Andreas 2026-11-02): single, ZWJ sequence, flag, keycap, skin tone, 6 families; joiner and
  // variation selector also in name, heading and description
  const emoji = ['🎉', '👨‍👩‍👧', '🇩🇪', '1️⃣', '👍🏽x', '👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧'];
  const fun = await a.create({ name: 'Fun 👩‍💻', style: 'plain',
    cards: emoji.map((text, i) => ({ text, color: 'grey', heading: i === 0 ? '❤️ it' : null,
      description: i === 0 ? 'Team 👨‍👩‍👧 ✔️' : null })) });
  expect(fun.status()).toBe(200);
  const funSet = (await fun.json()).set;
  expect(funSet.name).toBe('Fun 👩‍💻');
  expect(funSet.cards.map((card: { value: string }) => card.value)).toEqual(emoji);
  expect(funSet.cards[0]).toMatchObject({ heading: '❤️ it', description: 'Team 👨‍👩‍👧 ✔️' });
  expect((await a.remove(funSet.set_id)).ok()).toBeTruthy();

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

  // own team: activate through update_deck.php; cards must be at least two active cards of this set
  expect((await a.deck(big.deck_id, '&cards=c-1')).status()).toBe(400);
  const activated = await a.deck(big.deck_id);
  expect(activated.status()).toBe(200);
  expect(await activated.json()).toMatchObject({ changed: true, deck: { id: big.deck_id, group: 'custom' } });
});

test('old mixed decks become a custom set "Our deck" (idempotent, parallel loads)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Mixed Deck');
  await removeExampleSet(url);
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

  // all Fibonacci cards + all six faces: 18 cards; saving an edited copy of a migrated card
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

test('B-98 V6: dao names who changed the set group last (deck.changed_by)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Changed By');
  const t = teamIdOf(url);
  const [alice, bob] = await addPlayersViaApi(page, url, ['Alice', 'Bob']);
  const a = api(page, t);
  const changedBy = async () => (await a.dao(alice)).deck.changed_by;

  expect(await changedBy()).toBeNull(); // nobody changed it yet
  // another group: Alice
  expect((await a.deck('judge', `&id=${alice}`)).ok()).toBeTruthy();
  expect(await changedBy()).toBe('Alice');
  // the same group (single cards): stays Alice
  expect((await a.deck('judge', `&id=${bob}&cards=jdg1,jdg2`)).ok()).toBeTruthy();
  expect(await changedBy()).toBe('Alice');
  // activating a custom set (create with activate): Bob
  const res = await page.request.post(`/api/custom_set_create.php?${new URLSearchParams({ t, id: bob })}`,
    { data: JSON.stringify({ name: 'Mine', style: 'plain', cards: RISK, activate: true }) });
  expect(res.ok()).toBeTruthy();
  const set = (await res.json()).set;
  expect(await changedBy()).toBe('Bob');
  // deleting the active set (fallback to the default deck): Alice
  expect((await page.request.post(`/api/custom_set_delete.php?${new URLSearchParams({ t, set: String(set.set_id), id: alice })}`)).ok())
    .toBeTruthy();
  expect(await changedBy()).toBe('Alice');
  // the old deck menu: T-shirt by Bob; without id the writer is unknown
  const tshirt = Array<string>(46).fill('0');
  [25, 26, 27, 28, 29, 30, 31].forEach(i => tshirt[i] = '1');
  expect((await page.request.post(`/api/update_cardset.php?t=${t}&id=${bob}&cardset_flags=${tshirt.join('')}`)).ok()).toBeTruthy();
  expect(await changedBy()).toBe('Bob');
  expect((await a.deck('fib-classic')).ok()).toBeTruthy();
  expect(await changedBy()).toBeNull();
});

test('a new set can copy a catalog group as template (catalog keys allow its symbols and colours)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Template Set');
  const t = teamIdOf(url);
  const a = api(page, t);
  const res = await page.request.get('/card_catalog.json');
  expect(res.ok()).toBeTruthy();
  const catalog = await res.json();
  const fib = catalog.groups.find((g: { id: string }) => g.id === 'fib');
  const values: Record<string, number | null> = catalog.custom_symbol_values;
  // as the editor fills it: all cards of the group with their catalog key, symbol, colour and value
  const cards: Card[] = fib.cards.map((c: Record<string, string>) => ({ key: c.card_key, symbol: c.symbol,
    numeric_value: values[c.symbol], color: c.color }));
  expect(cards).toHaveLength(17);
  cards[0] = { ...cards[0], heading: 'nothing' }; // content is the user's

  const created = await a.create({ name: 'Fibonacci', style: fib.style, cards });
  expect(created.status()).toBe(200);
  const set = (await created.json()).set;
  expect(set.cards).toHaveLength(17);
  expect(set.cards.map((c: Record<string, unknown>) => [c.symbol, c.color]))
    .toEqual(fib.cards.map((c: Record<string, unknown>) => [c.symbol, c.color]));
  expect(set.cards[0]).toMatchObject({ heading: 'nothing', numeric_value: 0 });
  expect(set.cards[16]).toMatchObject({ symbol: 's-inf', value: '∞', color: 'vinf', infinite: true, numeric_value: null });
  for (const c of set.cards) expect(c.card_key).toMatch(/^c-[a-z0-9]{1,5}$/); // new custom cards, not the catalog keys

  // saving the copy keeps it; a further card from the catalog may be added with its key, too
  const saved = await a.save(set.set_id, { name: 'Fibonacci', style: fib.style, rev: set.rev,
    cards: [...set.cards.map((c: Record<string, unknown>) => asRequest(c)), { key: 'four001', symbol: 's-4', color: 'v4' }] });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).set.cards[17]).toMatchObject({ symbol: 's-4', color: 'v4' });

  // only the colour/symbol of the given catalog card; unknown keys and control cards give no exception
  const bad: [string, Card, string][] = [
    ['colour of another catalog card', { key: 'infin01', symbol: 's-inf', color: 'v3' }, 'color'],
    ['control card key', { key: 'qstmrk1', text: '?', color: 'v3' }, 'key'],
    ['unknown key', { key: 'nope001', symbol: 's-inf', color: 'vinf' }, 'key'],
    ['custom key, but the colour of another card', { key: set.cards[16].card_key, symbol: 's-inf', color: 'v3' }, 'color'],
    ['content is validated', { key: 'infin01', symbol: 's-inf', color: 'vinf', heading: 'x'.repeat(17) }, 'heading'],
  ];
  for (const [name, card, error] of bad) {
    const r = await a.create({ name: 'Bad', style: 'plain', cards: [card] });
    expect(r.status(), name).toBe(400);
    expect((await r.json()).error, name).toBe(error);
  }
});

test('a new set can copy an own set (keys of active cards of own sets allow their symbols and colours)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = teamIdOf(await createTeam(page, 'Copy Own Set'));
  const a = api(page, t);
  const catalog = await (await page.request.get('/card_catalog.json')).json();
  const fib = catalog.groups.find((g: { id: string }) => g.id === 'fib');
  const values: Record<string, number | null> = catalog.custom_symbol_values;
  const fromCatalog: Card[] = fib.cards.map((c: Record<string, string>) => ({ key: c.card_key, symbol: c.symbol,
    numeric_value: values[c.symbol], color: c.color }));

  // set A from the Fibonacci template (catalog colours v0 ... vinf)
  const resA = await a.create({ name: 'A', style: fib.style, cards: fromCatalog });
  expect(resA.status()).toBe(200);
  const setA = (await resA.json()).set;
  expect(setA.cards[16]).toMatchObject({ symbol: 's-inf', color: 'vinf' });

  // set B copies A as the editor sends it: the keys of A's cards with their symbol, colour and texts
  const copy = setA.cards.map((c: Record<string, unknown>) => asRequest(c));
  copy[1] = { ...copy[1], heading: 'half' };
  const resB = await a.create({ name: 'B', style: fib.style, cards: copy });
  expect(resB.status()).toBe(200);
  const setB = (await resB.json()).set;
  expect(setB.cards.map((c: Record<string, unknown>) => [c.symbol, c.color, c.numeric_value]))
    .toEqual(setA.cards.map((c: Record<string, unknown>) => [c.symbol, c.color, c.numeric_value]));
  expect(setB.cards[1].heading).toBe('half');
  expect(setB.cards[16]).toMatchObject({ symbol: 's-inf', color: 'vinf', infinite: true });
  const keysA = setA.cards.map((c: { card_key: string }) => c.card_key);
  for (const c of setB.cards) {
    expect(c.card_key).toMatch(/^c-[a-z0-9]{1,5}$/);
    expect(keysA).not.toContain(c.card_key); // new cards
  }
  // set A is unchanged
  expect(sql(`select group_concat(card_key order by position) from pok_custom_cards_tbl
               where set_id = ${setA.set_id} and active = 1`)).toBe(keysA.join(','));

  // saving set B: a further card copied from A (another own set) is a new card with A's colour
  const savedB = await a.save(setB.set_id, { name: 'B', style: fib.style, rev: setB.rev,
    cards: [...setB.cards.map((c: Record<string, unknown>) => asRequest(c)), asRequest(setA.cards[4])] });
  expect(savedB.status()).toBe(200);
  const setBNow = (await savedB.json()).set;
  const b17 = setBNow.cards[17];
  expect(b17).toMatchObject({ symbol: 's-3', color: 'v3' });
  expect(keysA).not.toContain(b17.card_key);

  // an inactive card (removed from A by a save) is no template any more
  const inf = setA.cards[16];
  const savedA = await a.save(setA.set_id, { name: 'A', style: fib.style, rev: setA.rev,
    cards: setA.cards.slice(0, 16).map((c: Record<string, unknown>) => asRequest(c)) });
  expect(savedA.status()).toBe(200);
  // a card of a deleted set neither
  const resC = await a.create({ name: 'C', style: fib.style, cards: [asRequest(setA.cards[5])] });
  expect(resC.status()).toBe(200);
  const setC = (await resC.json()).set;
  expect(setC.cards[0]).toMatchObject({ symbol: 's-5', color: 'v5' });
  expect((await a.remove(setC.set_id)).ok()).toBeTruthy();
  // nor a card of another team
  const other = await newPlayer(browser);
  const b = api(other, teamIdOf(await createTeam(other, 'Other Copy Team')));
  const foreign = await b.create({ name: 'F', style: fib.style, cards: [fromCatalog[16]] });
  expect(foreign.status()).toBe(200);
  const foreignCard = (await foreign.json()).set.cards[0];
  expect(foreignCard).toMatchObject({ symbol: 's-inf', color: 'vinf' });

  const bad: [string, Card, string][] = [
    ['inactive card of an own set', asRequest(inf), 'color'],
    ['card of a deleted set', asRequest(setC.cards[0]), 'color'],
    ['card of another team', asRequest(foreignCard), 'color'],
    ['own key, colour of another card', { ...asRequest(setA.cards[2]), color: 'v3' }, 'color'],
    ['malformed key', { key: 'c-TOOLONG', symbol: 's-1', color: 'v1' }, 'key'],
  ];
  for (const [name, card, error] of bad) {
    const r = await a.create({ name: 'Bad', style: 'plain', cards: [card] });
    expect(r.status(), name).toBe(400);
    expect((await r.json()).error, name).toBe(error);
  }
  // the same keys in a save of another set of the team are refused as well
  for (const [name, card, error] of bad) {
    const r = await a.save(setB.set_id, { name: 'B', style: fib.style, rev: setBNow.rev, cards: [card] });
    expect(r.status(), name).toBe(400);
    expect((await r.json()).error, name).toBe(error);
  }
  // the foreign team's set is untouched
  expect(sql(`select count(1) from pok_custom_cards_tbl where card_key = '${foreignCard.card_key}' and active = 1`)).toBe('1');
});

/* B-116: every team gets the example set "Animals (Example)" once, on a load (dao.php), not in use */
test('B-116: the example set once per team (parallel loads, deleted stays deleted, limit, migration first)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Example Set');
  const t = teamIdOf(url);
  const [anna] = await addPlayersViaApi(page, url, ['Anna']);
  const a = api(page, t);
  const examples = () => sql(`select count(1) from pok_custom_sets_tbl where team_id = '${t}' and deleted = 0
                                and name = 'Animals (Example)'`);
  const given = () => sql(`select example_set_given from pok_teams_tbl where id = '${t}'`);
  const reset = () => {
    sql(`delete c from pok_custom_cards_tbl c join pok_custom_sets_tbl s on s.id = c.set_id where s.team_id = '${t}'`);
    sql(`delete from pok_custom_sets_tbl where team_id = '${t}'`);
    sql(`update pok_teams_tbl set example_set_given = 0 where id = '${t}'`);
  };

  let dao = await a.dao(anna);
  expect(dao.custom_sets).toHaveLength(1);
  const example = dao.custom_sets[0];
  expect(example).toMatchObject({ name: 'Animals (Example)', style: 'banner' });
  expect(example.cards.map((c: Record<string, unknown>) => [c.value, c.heading, c.numeric_value, c.color, c.symbol, c.description]))
    .toEqual([['🐜', 'Ant', 1, 'brown', null, null], ['🐁', 'Mouse', 2, 'red', null, null],
              ['🐕', 'Dog', 3, 'amber', null, null], ['🐎', 'Horse', 5, 'green', null, null],
              ['🐘', 'Elephant', 8, 'grey', null, null], ['🐋', 'Whale', 13, 'cyan', null, null]]);
  // not in use: the deck stays the default, no new round
  expect(dao.deck).toMatchObject({ id: 'fib-classic' });
  expect(sql(`select count(1) from pok_roundstats_tbl where team_id = '${t}'`)).toBe('0');
  expect(given()).toBe('1');
  // the editor can save it unchanged (texts and colours pass the validation)
  const saved = await a.save(example.set_id, { name: example.name, style: example.style, rev: example.rev,
    cards: example.cards.map((card: Record<string, unknown>) => asRequest(card)) });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ changed: false });

  // parallel loads: one set
  reset();
  await Promise.all(Array.from({ length: 6 }, () => a.dao(anna)));
  expect(examples()).toBe('1');
  expect(given()).toBe('1');

  // deleted: it does not come back
  dao = await a.dao(anna);
  expect((await a.remove(dao.custom_sets[0].set_id)).ok()).toBeTruthy();
  await a.dao(anna);
  expect((await a.dao(anna)).custom_sets).toEqual([]);

  // 5 own sets already: none, but marked as given
  reset();
  sql(`update pok_teams_tbl set example_set_given = 1 where id = '${t}'`);
  for (let i = 1; i <= 5; i++) expect((await a.create({ name: `Set ${i}`, style: 'plain', cards: RISK })).ok()).toBeTruthy();
  sql(`update pok_teams_tbl set example_set_given = 0 where id = '${t}'`);
  dao = await a.dao(anna);
  expect(dao.custom_sets).toHaveLength(5);
  expect(examples()).toBe('0');
  expect(given()).toBe('1');

  // 4 own sets and an old mixed deck not migrated yet: "Our deck" first (in use), then the limit - no example set
  sql(`delete c from pok_custom_cards_tbl c join pok_custom_sets_tbl s on s.id = c.set_id
        where s.team_id = '${t}' and s.name = 'Set 5'`);
  sql(`delete from pok_custom_sets_tbl where team_id = '${t}' and name = 'Set 5'`);
  sql(`update pok_teams_tbl set example_set_given = 0, cardset_flags = '${flags([2, 3, 4, 18, 43])}',
         deck_id = null, deck_cards = null, deck_controls = null where id = '${t}'`);
  const loads = await Promise.all(Array.from({ length: 4 }, () => a.dao(anna)));
  for (const load of loads) {
    expect(load.custom_sets.map((s: { name: string }) => s.name)).toEqual(['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Our deck']);
    expect(load.deck.id).toBe(load.custom_sets[4].deck_id);
  }
  expect(examples()).toBe('0');
  expect(given()).toBe('1');
});
