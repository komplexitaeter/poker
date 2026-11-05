import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi, joinAsPlayer, pickCard } from './helpers';

/**
 * B-115: team setting "See changed cards" (show_card_changes) switches B-104 off. It takes effect with the next round:
 * round_show_card_changes is the snapshot of the running round (new round copies it, at once only while no card is
 * down). With the round setting off, setc.php stores no original card and dao.php delivers none.
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

async function post(page: Page, script: string, params: Record<string, string>) {
  const res = await page.request.post(`/api/${script}?${new URLSearchParams(params).toString()}`);
  expect(res.ok()).toBeTruthy();
}

type Player = { name: string; display_card_key: string; original_card_key: string | null };
type State = { show_card_changes: number; round_show_card_changes: number; players: Player[] };

async function dao(page: Page, t: string, id: string): Promise<State> {
  const res = await page.request.get(`/api/dao.php?${new URLSearchParams({ t, id }).toString()}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

const playerOf = (state: State, name: string) => state.players.find((p) => p.name === name) as Player;
const original = (t: string, id: string) =>
  sql(`select ifnull(original_card_key, 'NULL') from pok_players_tbl where id = '${id}' and team_id = '${t}'`);

async function setup(page: Page, name: string) {
  const url = await createTeam(page, name);
  const t = teamIdOf(url);
  const [bob, carol] = await addPlayersViaApi(page, url, ['Bob', 'Carol']);
  // only Bob and Carol play
  sql(`update pok_players_tbl set player_type = 'OBSERVER' where team_id = '${t}' and id not in ('${bob}', '${carol}')`);
  return { t, bob, carol };
}

test('switched off: the running round keeps its originals, the next round stores none (B-115)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const { t, bob, carol } = await setup(page, 'Card Changes Off');

  // default on
  let s = await dao(page, t, bob);
  expect(s.show_card_changes).toBe(1);
  expect(s.round_show_card_changes).toBe(1);

  await post(page, 'setc.php', { t, id: bob, cardkey: 'five001' });
  await post(page, 'setc.php', { t, id: carol, cardkey: 'eight01' });
  // off during the round: the team setting changes, the round setting does not
  await post(page, 'update_team.php', { t, show_card_changes: '0' });
  s = await dao(page, t, carol);
  expect(s.show_card_changes).toBe(0);
  expect(s.round_show_card_changes).toBe(1);
  // a change after the reveal still keeps the original in this round
  await post(page, 'setc.php', { t, id: bob, cardkey: 'eight01' });
  expect(original(t, bob)).toBe('five001');
  expect(playerOf(await dao(page, t, carol), 'Bob').original_card_key).toBe('five001');

  // next round: off
  await post(page, 'newround.php', { t, id: bob });
  s = await dao(page, t, carol);
  expect(s.show_card_changes).toBe(0);
  expect(s.round_show_card_changes).toBe(0);
  await post(page, 'setc.php', { t, id: bob, cardkey: 'five001' });
  await post(page, 'setc.php', { t, id: carol, cardkey: 'eight01' });
  await post(page, 'setc.php', { t, id: bob, cardkey: 'thrtn01' });
  expect(original(t, bob)).toBe('NULL');
  s = await dao(page, t, carol);
  expect(playerOf(s, 'Bob').display_card_key).toBe('thrtn01');
  expect(playerOf(s, 'Bob').original_card_key).toBeNull();

  // on during the round with "off": nothing shows afterwards, a further change stores nothing either
  await post(page, 'update_team.php', { t, show_card_changes: '1' });
  s = await dao(page, t, carol);
  expect(s.show_card_changes).toBe(1);
  expect(s.round_show_card_changes).toBe(0);
  await post(page, 'setc.php', { t, id: bob, cardkey: 'two0001' });
  expect(original(t, bob)).toBe('NULL');
  expect(playerOf(await dao(page, t, carol), 'Bob').original_card_key).toBeNull();
  // an original stored in the database is not delivered in a round with "off" either
  sql(`update pok_players_tbl set original_card_key = 'five001' where id = '${bob}' and team_id = '${t}'`);
  expect(playerOf(await dao(page, t, carol), 'Bob').original_card_key).toBeNull();

  // cancelled round (not all cards down) also takes the setting over: on again
  await post(page, 'setc.php', { t, id: carol });
  await post(page, 'newround.php', { t, id: bob });
  expect((await dao(page, t, carol)).round_show_card_changes).toBe(1);
  await post(page, 'setc.php', { t, id: bob, cardkey: 'five001' });
  await post(page, 'setc.php', { t, id: carol, cardkey: 'eight01' });
  await post(page, 'setc.php', { t, id: bob, cardkey: 'eight01' });
  expect(playerOf(await dao(page, t, carol), 'Bob').original_card_key).toBe('five001');
});

test('while no card is down the setting applies at once; invalid values change nothing (B-115)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const { t, bob, carol } = await setup(page, 'Card Changes Idle');

  await post(page, 'update_team.php', { t, show_card_changes: '0' });
  let s = await dao(page, t, bob);
  expect(s.show_card_changes).toBe(0);
  expect(s.round_show_card_changes).toBe(0);

  for (const value of ['2', '', 'x', '-1'])
    await post(page, 'update_team.php', { t, show_card_changes: value });
  s = await dao(page, t, bob);
  expect(s.show_card_changes).toBe(0);
  expect(s.round_show_card_changes).toBe(0);

  await post(page, 'setc.php', { t, id: bob, cardkey: 'five001' });
  await post(page, 'setc.php', { t, id: carol, cardkey: 'eight01' });
  await post(page, 'setc.php', { t, id: bob, cardkey: 'eight01' });
  expect(original(t, bob)).toBe('NULL');

  // unknown team: 403, nothing written
  const res = await page.request.post('/api/update_team.php?t=nosuchteam0000&show_card_changes=1');
  expect(res.status()).toBe(403);
});

/**
 * B-115 (frontend): Board settings → Results → "Changed cards" (Hide/Show). The switch follows the team setting on
 * every board; while it differs from the running round (cards already down) a hint says "next round". A failed
 * write shows the error toast and the switch keeps the server's state.
 */
const DESKTOP = { width: 1400, height: 800 };
const SCREENSHOT_DIR = process.env.B115_SCREENSHOT_DIR;

async function openResultsTab(page: Page) {
  await page.locator('#cset_btn').click();
  await page.locator('#cset_box').getByRole('tab', { name: 'Results' }).click();
  await expect(page.locator('#cet_show_card_changes')).toBeVisible();
}

const changesRadio = (page: Page, value: '0' | '1') =>
  page.locator(`input[name=cet_show_card_changes][value="${value}"]`);
const nextRoundHint = (page: Page) => page.locator('#cet_show_card_changes_hint');
const clickChanges = (page: Page, label: 'Hide' | 'Show') =>
  page.locator('#cet_show_card_changes label', { hasText: label }).click();

test('the "Changed cards" switch follows the team setting on every board, "next round" with cards down (B-115)',
  async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Changed Cards Switch');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP });
  await joinAsPlayer(bob, url, 'Bob');

  for (const page of [alice, bob]) {
    await openResultsTab(page);
    await expect(changesRadio(page, '1')).toBeChecked();   // default on
    await expect(nextRoundHint(page)).toBeHidden();
  }

  // no card down: takes effect at once, no hint
  await clickChanges(alice, 'Hide');
  for (const page of [alice, bob]) {
    await expect(changesRadio(page, '0')).toBeChecked();
    await expect(nextRoundHint(page)).toBeHidden();
  }
  await clickChanges(bob, 'Show');
  for (const page of [alice, bob]) await expect(changesRadio(page, '1')).toBeChecked();

  // cards down: the running round keeps its setting, the hint shows on both boards
  for (const page of [alice, bob]) await page.keyboard.press('Escape');
  await pickCard(alice, 'five001');
  await pickCard(bob, 'eight01');
  await openResultsTab(alice);
  await openResultsTab(bob);
  await clickChanges(alice, 'Hide');
  for (const page of [alice, bob]) {
    await expect(changesRadio(page, '0')).toBeChecked();
    await expect(nextRoundHint(page)).toBeVisible();
    await expect(nextRoundHint(page)).toHaveText('Takes effect with the next round.');
  }
  if (SCREENSHOT_DIR) await alice.locator('#cset_box').screenshot({ path: `${SCREENSHOT_DIR}/results-next-round.png` });

  // back to the round's setting: hint gone
  await clickChanges(bob, 'Show');
  for (const page of [alice, bob]) {
    await expect(changesRadio(page, '1')).toBeChecked();
    await expect(nextRoundHint(page)).toBeHidden();
  }
  if (SCREENSHOT_DIR) await alice.locator('#cset_box').screenshot({ path: `${SCREENSHOT_DIR}/results.png` });
});

test('the "Changed cards" switch: a failed write shows the error toast, the switch keeps the server state (B-115)',
  async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Changed Cards Error');
  await joinAsPlayer(alice, url, 'Alice');
  await openResultsTab(alice);
  await expect(changesRadio(alice, '1')).toBeChecked();

  await alice.route('**/api/update_team.php*', route => route.fulfill({ status: 500, body: '' }));
  await clickChanges(alice, 'Hide');
  const toast = alice.locator('#toast');
  await expect(toast).toHaveText('Not saved – please try again');
  await expect(toast).toHaveClass(/toast-error/);
  await expect(changesRadio(alice, '1')).toBeChecked();
  await alice.unroute('**/api/update_team.php*');
});
