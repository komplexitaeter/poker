import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, pickCard, expectTableCard } from './helpers';

/**
 * B-98 (rollout 3, S1): teams still only have the old bitmask cardset_flags. dao.php derives the new deck
 * (deck_id, deck_cards, deck_controls) from it on the first load (lazy migration) and delivers it as `deck`,
 * without changing anything visible: cardset_flags stays as it is and the board keeps working.
 */

// same credentials as the test config written by tests/e2e/setup.sh
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Bitmask as the old deck menu stores it: '1' at the given positions of cards.json v1. */
function flags(indexes: number[], length = 46): string {
  const bits = Array<string>(length).fill('0');
  for (const i of indexes) bits[i] = '1';
  return bits.join('');
}

/** Stores old flags and resets the deck, i.e. the state of a team before rollout 3. */
function setLegacyFlags(teamId: string, cardsetFlags: string): void {
  // team ids are [A-Za-z0-9_-] and flags [01] here, so building the statement is safe
  expect(teamId).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(cardsetFlags).toMatch(/^[01]+$/);
  sql(`update pok_teams_tbl set cardset_flags = '${cardsetFlags}', deck_id = null, deck_cards = null,
       deck_controls = null where id = '${teamId}'`);
}

function storedDeck(teamId: string): string {
  return sql(`select concat_ws('|', deck_id, ifnull(deck_cards, 'NULL'), deck_controls, deck_rev)
                from pok_teams_tbl where id = '${teamId}'`);
}

async function teamOf(page: Page, boardUrl: string) {
  const teamId = new URL(boardUrl).searchParams.get('t') as string;
  const sid = (await page.evaluate(() => localStorage.getItem('SID'))) as string;
  const dao = async () => {
    const res = await page.request.get(`./api/dao.php?id=${encodeURIComponent(sid)}&t=${encodeURIComponent(teamId)}`);
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  return { teamId, sid, dao };
}

// fib cards 1 2 3 5 8 13 + ☕ + ✋ (a subset of Fibonacci, no preset)
const FIB_SUBSET = [2, 3, 4, 6, 9, 10, 24, 45];

test('a team with an old bitmask is migrated on load and the board keeps working', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'DeckMigrationTeam');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  const { teamId, dao } = await teamOf(alice, url);

  const legacy = flags(FIB_SUBSET);
  setLegacyFlags(teamId, legacy);

  const data = await dao();
  expect(data.cardset_flags).toBe(legacy); // unchanged for the old board
  expect(data.deck).toEqual({
    id: 'fib-classic', group: 'fib',
    cards: ['one0001', 'two0001', 'three01', 'five001', 'eight01', 'thrtn01'],
    controls: ['break01', 'veto'], rev: 0,
  });
  expect(storedDeck(teamId)).toBe('fib-classic|one0001,two0001,three01,five001,eight01,thrtn01|break01,veto|0');
  expect(sql(`select cardset_flags from pok_teams_tbl where id = '${teamId}'`)).toBe(legacy);

  // the board works as before: both play, the cards are revealed, a new round stores the deck of the round
  await alice.reload();
  await bob.reload();
  await pickCard(alice, 'three01');
  await pickCard(bob, 'thrtn01');
  await expectTableCard(alice, 'Bob', 'thrtn01');
  await expectTableCard(bob, 'Alice', 'three01');

  const res = await alice.request.post(`./api/newround.php?t=${encodeURIComponent(teamId)}`);
  expect(res.ok()).toBeTruthy();
  expect(sql(`select concat(type_code, '|', deck_id) from pok_roundstats_tbl where team_id = '${teamId}'
               order by id desc limit 1`)).toBe('NEW_ROUND|fib-classic');
  await expectTableCard(alice, 'Bob', 'prgrss1');
});

test('presets, subsets and mixed decks are derived from the bitmask', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'DeckDeriveTeam');
  const { teamId, dao } = await teamOf(page, url);

  const cases: [string, string, Record<string, unknown>][] = [
    // Fibonacci preset + ☕ ? ! (the top deck on live)
    ['classic', flags([0, 1, 2, 3, 4, 6, 9, 10, 11, 12, 13, 14, 24, 43, 44]),
      { id: 'fib-classic', controls: ['break01', 'qstmrk1', 'xclam01'] }],
    ['true', flags([0, 2, 3, 4, 6, 9, 10, 40, 41, 42]), { id: 'fib-true', controls: [] }],
    // old JUDGE preset: 0-6 + ☕ + ✋; "6 veto" covers ✋, so the veto control card is not taken over (Andreas)
    ['judge', flags([0, 2, 3, 4, 5, 6, 7, 24, 45]),
      { id: 'judge', cards: ['jdg0', 'jdg1', 'jdg2', 'jdg3', 'jdg4', 'jdg5', 'jdg6'], controls: ['break01'] }],
    // other groups keep ✋ as chosen
    ['delegation + veto', flags([2, 3, 4, 5, 6, 7, 8, 45]), { id: 'delegation', controls: ['veto'] }],
    ['delegation', flags([2, 3, 4, 5, 6, 7, 8]), { id: 'delegation', group: 'delegation' }],
    // old teams have shorter strings (38 characters)
    ['traffic, short string', flags([15, 16, 17, 24], 38),
      { id: 'traffic', cards: ['green01', 'yellow1', 'red0001'], controls: ['break01'] }],
    // only in Numbers: 4 6 7
    ['numbers subset', flags([5, 7, 8]), { id: 'numbers', cards: ['four001', 'six0001', 'seven01'] }],
    // Fibonacci + an emotion: no single group -> default deck with all cards, controls kept
    ['mixed', flags([2, 3, 4, 18, 43]),
      { id: 'fib-classic', cards: ['zero001', '1pnt501', 'one0001', 'two0001', 'three01', 'five001', 'eight01',
        'thrtn01', 'twnty01', '4ty0001', 'hundro1', 'infin01'], controls: ['qstmrk1'] }],
  ];
  for (const [name, cardsetFlags, expected] of cases) {
    setLegacyFlags(teamId, cardsetFlags);
    expect((await dao()).deck, name).toMatchObject(expected);
  }
});

test('the old deck menu (update_cardset.php) resets the deck, it is derived again', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'DeckResetTeam');
  const { teamId, dao } = await teamOf(page, url);

  expect((await dao()).deck).toMatchObject({ id: 'fib-classic', rev: 0 }); // new team: Fibonacci preset

  const short = flags([0, 2, 3, 4, 6, 9, 10, 11, 12, 24]);
  const res = await page.request.post(
    `./api/update_cardset.php?t=${encodeURIComponent(teamId)}&cardset_flags=${short}`);
  expect(res.ok()).toBeTruthy();
  expect((await dao()).deck).toMatchObject({ id: 'fib-short', controls: ['break01'], rev: 1 });
  expect(storedDeck(teamId)).toBe('fib-short|NULL|break01|1');
});

test('sorting by card keeps players whose card key is unknown', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'DeckSortTeam');
  const { teamId, dao } = await teamOf(page, url);
  const [anna, ben, cleo] = await addPlayersViaApi(page, url, ['Anna', 'Ben', 'Cleo']);

  // results_order SEQUENCE is the default; 'c-zz1' is a key no catalog knows (like a custom card)
  for (const [id, key] of [[anna, 'c-zz1'], [ben, 'thrtn01'], [cleo, 'two0001']]) {
    const res = await page.request.post(`./api/setc.php?id=${id}&cardkey=${key}&t=${encodeURIComponent(teamId)}`);
    expect(res.ok()).toBeTruthy();
  }
  const data = await dao();
  expect(data.all_players_ready).toBe(true);
  expect(data.players.map((p: { name: string; display_card_key: string }) => `${p.name}:${p.display_card_key}`))
    .toEqual(['Cleo:two0001', 'Ben:thrtn01', 'Anna:c-zz1']);
});
