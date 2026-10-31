import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, teamWithTwoPlayers, pickCard, expectTableCard, deckCard } from './helpers';

/**
 * B-98 (rollout 3, S2): deck endpoints for the new deck menu.
 * - update_deck.php: variant + single cards of its group; a change while cards are down starts a new round
 *   in the same request (snapshot with the old deck).
 * - update_controls.php: control cards per team, never a new round.
 * Both notify the team (B-81) and keep cardset_flags in line, so the current board shows the new deck.
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

function storedDeck(teamId: string): string {
  return sql(`select concat_ws('|', deck_id, ifnull(deck_cards, 'NULL'), deck_controls, deck_rev, needs_setup)
                from pok_teams_tbl where id = '${teamId}'`);
}

function roundCount(teamId: string): number {
  return Number(sql(`select count(1) from pok_roundstats_tbl where team_id = '${teamId}'`));
}

async function post(page: Page, endpoint: string, teamId: string, params: Record<string, string>) {
  const query = new URLSearchParams({ t: teamId, ...params }).toString();
  return page.request.post(`/api/${endpoint}?${query}`);
}

test('changing the deck without cards down: no new round, the board follows (B-98)', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'DeckApiNoCards');
  const teamId = teamIdOf(url);
  // new teams: Fibonacci Classic with ☕ and ? (Andreas, 2026-10-31)
  expect(storedDeck(teamId)).toBe('fib-classic|NULL|break01,qstmrk1|0|0');

  const res = await post(alice, 'update_deck.php', teamId, { deck: 'fib-short' });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({
    deck: { id: 'fib-short', group: 'fib',
      cards: ['zero001', 'one0001', 'two0001', 'three01', 'five001', 'eight01', 'thrtn01', 'twnty01', '4ty0001'],
      controls: ['break01', 'qstmrk1'], rev: 1 },
    changed: true, new_round: false,
  });
  expect(storedDeck(teamId)).toBe('fib-short|NULL|break01,qstmrk1|1|0');
  expect(roundCount(teamId)).toBe(0);

  // notified: Bob's open board drops ½ and 100 without a reload
  await expect(deckCard(bob, '1pnt501')).toHaveCount(0);
  await expect(deckCard(bob, 'hundro1')).toHaveCount(0);
  await expect(deckCard(bob, 'three01')).toHaveCount(1);

  // the same deck again changes nothing
  const again = await post(alice, 'update_deck.php', teamId, { deck: 'fib-short' });
  expect(await again.json()).toMatchObject({ changed: false, new_round: false, deck: { rev: 1 } });
  expect(storedDeck(teamId)).toBe('fib-short|NULL|break01,qstmrk1|1|0');
});

test('changing the deck with cards down starts a new round with the old deck in the snapshot (B-98)', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'DeckApiCards');
  const teamId = teamIdOf(url);
  await pickCard(alice, 'three01');
  await expectTableCard(bob, 'Alice', 'done001');

  // single cards: 1 2 3 of Fibonacci, in group order whatever order is sent
  const res = await post(alice, 'update_deck.php', teamId, { deck: 'fib-classic', cards: 'three01,one0001,two0001' });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({
    deck: { id: 'fib-classic', cards: ['one0001', 'two0001', 'three01'], rev: 1 }, changed: true, new_round: true,
  });
  expect(sql(`select concat_ws('|', type_code, deck_id, ifnull(deck_cards, 'NULL'), deck_controls)
                from pok_roundstats_tbl where team_id = '${teamId}' order by id desc limit 1`))
    .toBe('CANCEL_ROUND|fib-classic|NULL|break01,qstmrk1');
  expect(sql(`select count(card_key) from pok_players_tbl where team_id = '${teamId}'`)).toBe('0');
  expect(storedDeck(teamId)).toBe('fib-classic|one0001,two0001,three01|break01,qstmrk1|1|0');

  // notified: Bob sees the new round and the smaller deck
  await expectTableCard(bob, 'Alice', 'prgrss1');
  await expect(deckCard(bob, 'five001')).toHaveCount(0);
  await expect(deckCard(bob, 'two0001')).toHaveCount(1);

  // another group: cards down again -> one more round, snapshot has the single cards
  await pickCard(bob, 'two0001');
  const traffic = await post(alice, 'update_deck.php', teamId, { deck: 'traffic' });
  expect(await traffic.json()).toMatchObject({ deck: { id: 'traffic', group: 'traffic' }, new_round: true });
  expect(sql(`select concat_ws('|', deck_id, deck_cards) from pok_roundstats_tbl where team_id = '${teamId}'
               order by id desc limit 1`)).toBe('fib-classic|one0001,two0001,three01');
  expect(roundCount(teamId)).toBe(2);
  await expect(deckCard(alice, 'green01')).toHaveCount(1);
});

test('update_deck.php rejects unknown decks and cards outside the group (B-98)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'DeckApiInvalid');
  const teamId = teamIdOf(url);

  for (const params of [
    { deck: 'nosuchdeck' },
    { deck: 'fib.classic' },
    { deck: '' },
    { deck: 'fib-classic', cards: '' },             // at least one card
    { deck: 'fib-classic', cards: 'green01' },      // card of another group
    { deck: 'fib-classic', cards: 'one0001,break01' }, // control cards are not deck cards
    { deck: 'fib-classic', cards: 'one0001,,two0001' },
    { deck: 'fib-classic', cards: "one0001,x' or 1" },
    { deck: 'fib-classic', cards: 'toolongkey' },
  ]) {
    const res = await post(page, 'update_deck.php', teamId, params);
    expect(res.status(), JSON.stringify(params)).toBe(400);
  }
  expect(storedDeck(teamId)).toBe('fib-classic|NULL|break01,qstmrk1|0|0');

  expect((await page.request.post('/api/update_deck.php?t=NoSuchTeam&deck=fib-short')).status()).toBe(403);
  expect((await page.request.get(`/api/update_deck.php?t=${teamId}&deck=fib-short`)).status()).toBe(405);
  // a group card that is not in the variant is allowed (the group is the limit, not the variant)
  const res = await post(page, 'update_deck.php', teamId, { deck: 'fib-true', cards: 'one0001,hundro1' });
  expect(await res.json()).toMatchObject({ deck: { id: 'fib-true', cards: ['one0001', 'hundro1'] } });
});

test('control cards per team: switched without a new round, a placed control card stays (B-98)', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'DeckApiControls');
  const teamId = teamIdOf(url);
  await pickCard(alice, 'break01');

  const res = await post(alice, 'update_controls.php', teamId, { controls: 'veto,xclam01' });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ deck: { id: 'fib-classic', controls: ['xclam01', 'veto'], rev: 1 },
    changed: true });
  expect(storedDeck(teamId)).toBe('fib-classic|NULL|xclam01,veto|1|0');
  expect(roundCount(teamId)).toBe(0);
  expect(sql(`select count(card_key) from pok_players_tbl where team_id = '${teamId}'`)).toBe('1');

  // notified: Bob's deck has ! and ✋ instead of ☕ and ?
  await expect(deckCard(bob, 'veto')).toHaveCount(1);
  await expect(deckCard(bob, 'xclam01')).toHaveCount(1);
  await expect(deckCard(bob, 'qstmrk1')).toHaveCount(0);
  await expectTableCard(bob, 'Alice', 'done001');

  // none at all
  expect(await (await post(alice, 'update_controls.php', teamId, { controls: '' })).json())
    .toMatchObject({ deck: { controls: [], rev: 2 }, changed: true });
  // the deck keeps its controls when the variant changes
  await post(alice, 'update_controls.php', teamId, { controls: 'qstmrk1' });
  expect(await (await post(alice, 'update_deck.php', teamId, { deck: 'stars' })).json())
    .toMatchObject({ deck: { id: 'stars', controls: ['qstmrk1'] } });

  for (const params of [{}, { controls: 'three01' }, { controls: 'break01,nosuch' }, { controls: '<b>' }]) {
    const bad = await post(alice, 'update_controls.php', teamId, params as Record<string, string>);
    expect(bad.status(), JSON.stringify(params)).toBe(400);
  }
});

test('new teams from a preset get its deck, the old menu only accepts bitmasks (B-98)', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto(`/?tool=e2e&team=DeckApiPreset&preset=${encodeURIComponent('Judge')}`);
  await page.waitForURL(/\?t=/);
  const teamId = teamIdOf(page.url());
  // J.U.D.G.E. with "6 veto"; the default controls ☕ ? (no ✋ from the old preset bitmask)
  expect(storedDeck(teamId)).toBe('judge|NULL|break01,qstmrk1|0|0');
  expect(sql(`select cardset_flags from pok_teams_tbl where id = '${teamId}'`))
    .toBe('1011111100000000000000001000000000000000000100');

  for (const flags of ['', '012', '1'.repeat(101), '10 1']) {
    const res = await post(page, 'update_cardset.php', teamId, { cardset_flags: flags });
    expect(res.status(), flags).toBe(400);
  }
  expect(storedDeck(teamId)).toBe('judge|NULL|break01,qstmrk1|0|0');
});
