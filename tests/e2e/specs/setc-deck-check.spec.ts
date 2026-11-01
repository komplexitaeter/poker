import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi, setTeamDeck } from './helpers';

/**
 * B-103: setc.php only stores cards of the team's deck (cards switched on) and its active control cards. Any other
 * well-formed key is answered with 400 and nothing is written. Taking the card back (empty key) stays allowed.
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

async function setc(page: Page, t: string, id: string, cardkey: string) {
  return page.request.post(`/api/setc.php?${new URLSearchParams({ t, id, cardkey }).toString()}`);
}

test('setc.php rejects cards outside the team deck and control cards', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Setc Deck Check');
  const t = teamIdOf(url);
  // Fibonacci without 13, control cards ☕ only
  await setTeamDeck(page, url, 'fib-classic', ['one0001', 'two0001', 'three01', 'five001', 'eight01'], ['break01']);
  const [bob] = await addPlayersViaApi(page, url, ['Bob']);
  const cardOf = () => sql(`select ifnull(card_key, 'NULL') from pok_players_tbl where id = '${bob}' and team_id = '${t}'`);

  // a card of the deck and an active control card: stored
  expect((await setc(page, t, bob, 'three01')).ok()).toBeTruthy();
  expect(cardOf()).toBe('three01');
  expect((await setc(page, t, bob, 'break01')).ok()).toBeTruthy();
  expect(cardOf()).toBe('break01');

  // a card of another deck, a card switched off, a control card switched off, a status card: 400, card unchanged
  for (const key of ['green01', 'thrtn01', 'qstmrk1', 'done001', 'zz99']) {
    expect((await setc(page, t, bob, key)).status(), key).toBe(400);
    expect(cardOf()).toBe('break01');
  }

  // taking the card back is always allowed
  expect((await setc(page, t, bob, '')).ok()).toBeTruthy();
  expect(cardOf()).toBe('NULL');

  // a team not migrated yet (deck_id null): the deck derived from its cardset_flags counts (here the same subset)
  sql(`update pok_teams_tbl set deck_id = null, deck_cards = null, deck_controls = null where id = '${t}'`);
  expect((await setc(page, t, bob, 'five001')).ok()).toBeTruthy();
  expect(cardOf()).toBe('five001');
  for (const key of ['thrtn01', 'satis01']) {
    expect((await setc(page, t, bob, key)).status(), key).toBe(400);
    expect(cardOf()).toBe('five001');
  }
});
