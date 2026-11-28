import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, removeExampleSet, asUser, tableCard, pickCard,
         getSid } from './helpers';

/**
 * B-159 (review notes of the MCP PRs):
 * 1. dao.php (and the MCP board, which reads it): custom cards that are in no active set any more come along in
 *    custom_cards_played only after the reveal - before it only the own card, else the list tells another's card.
 * 2. delete.php in anonymous mode after the reveal: only the own seat (like MCP round remove_player), the board shows
 *    no trash can on other cards then. Before the reveal removing works as always.
 * 3. away_sig is a hash of the secret ids, not of the public mkeys (covered in seen-heartbeat.spec.ts).
 * 5. core_member_remove() in one transaction: removing the own seat sets the self-left mark.
 */

// same credentials as the test config written by tests/e2e/setup.sh
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function safe(value: string): string {
  expect(value).toMatch(/^[A-Za-z0-9_-]+$/); // safe to put into the SQL below
  return value;
}

const teamIdOf = (url: string) => safe(new URL(url).searchParams.get('t') as string);

let rpcId = 0;

/** an MCP tool call that must succeed: its structuredContent and its text */
async function mcp(request: APIRequestContext, name: string, args: Record<string, unknown>) {
  const res = await request.post('/mcp', { data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call',
                                                   params: { name, arguments: args } } });
  expect(res.status(), await res.text()).toBe(200);
  const result = (await res.json()).result;
  expect(result.isError, JSON.stringify(result)).toBeFalsy();
  return { data: result.structuredContent, text: JSON.stringify(result) };
}

async function dao(page: Page, t: string, id: string) {
  const res = await page.request.get(`/api/dao.php?${new URLSearchParams({ t })}`, asUser(id));
  expect(res.ok()).toBeTruthy();
  return res.json();
}

const setc = (page: Page, t: string, id: string, cardkey: string) =>
  page.request.post(`/api/setc.php?${new URLSearchParams({ t, cardkey })}`, asUser(id));

const remove = (page: Page, t: string, id: string, mkey: number | string) =>
  page.request.post(`/api/delete.php?${new URLSearchParams({ t, mkey: String(mkey) })}`, asUser(id));

const mkeyOf = (t: string, id: string) => sql(`select mkey from pok_players_tbl where team_id = '${t}' and id = '${safe(id)}'`);
const typeOf = (t: string, id: string) => sql(`select player_type from pok_players_tbl where team_id = '${t}' and id = '${safe(id)}'`);

test('removed custom card of another player stays hidden before the reveal (dao.php and MCP board)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'B159 Custom');
  await removeExampleSet(url);
  const t = teamIdOf(url);
  const [anna, ben] = await addPlayersViaApi(page, url, ['Anna', 'Ben']);
  const cleo = (await mcp(page.request, 'join_team', { invite: t, name: 'Cleo', role: 'player' })).data.you;

  const created = await page.request.post(`/api/custom_set_create.php?${new URLSearchParams({ t })}`, {
    data: JSON.stringify({ name: 'Secret', style: 'plain', activate: true, cards: [
      { text: 'Lo', numeric_value: 1, color: 'green' }, { text: 'Zqx', numeric_value: 2, color: 'amber' },
      { text: 'Hi', numeric_value: 3, color: 'red' }] }),
    headers: { 'Content-Type': 'application/json' } });
  expect(created.status(), await created.text()).toBe(200);
  const keys: string[] = (await created.json()).set.cards.map((card: { card_key: string }) => card.card_key);

  // Ben plays "Zqx", then the card leaves the set (as after a save or delete that kept it on the table)
  expect((await setc(page, t, ben, keys[1])).ok()).toBeTruthy();
  sql(`update pok_custom_cards_tbl set active = 0 where card_key = '${safe(keys[1])}'`);

  // the others see neither key nor text before the reveal; Ben sees his own card
  const forAnna = await dao(page, t, anna);
  expect(forAnna.all_players_ready).toBe(false);
  expect(forAnna.custom_cards_played).toEqual([]);
  expect(JSON.stringify(forAnna)).not.toContain(keys[1]);
  expect(JSON.stringify(forAnna)).not.toContain('Zqx');
  expect((await dao(page, t, ben)).custom_cards_played).toEqual([expect.objectContaining({ card_key: keys[1] })]);
  const board = await mcp(page.request, 'get_board', { team_id: t, uid: cleo.uid });
  expect(board.text).not.toContain(keys[1]);
  expect(board.text).not.toContain('Zqx');

  // after the reveal the card comes along for everybody
  expect((await setc(page, t, anna, keys[0])).ok()).toBeTruthy();
  await mcp(page.request, 'play_card', { team_id: t, uid: cleo.uid, action: 'play', card: 'Hi' });
  const revealed = await dao(page, t, anna);
  expect(revealed.all_players_ready).toBe(true);
  expect(revealed.custom_cards_played).toEqual([expect.objectContaining({ card_key: keys[1], value: 'Zqx' })]);
  expect((await mcp(page.request, 'get_board', { team_id: t, uid: cleo.uid })).text).toContain('Zqx');
});

test('anonymous mode: after the reveal delete.php removes only the own seat, the board hides the trash can', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'B159 Anon');
  await joinAsPlayer(alice, url, 'Alice');
  const t = teamIdOf(url);
  const aliceId = await getSid(alice);
  const [ben, cleo, dana] = await addPlayersViaApi(alice, url, ['Ben', 'Cleo', 'Dana']);
  sql(`update pok_teams_tbl set anonymous_mode = 1, anonymous_request_toggle = 1 where id = '${t}'`);

  // before the reveal: the trash can works as always (Dana holds up the reveal)
  expect((await setc(alice, t, ben, 'three01')).ok()).toBeTruthy();
  expect((await setc(alice, t, cleo, 'five001')).ok()).toBeTruthy();
  expect((await remove(alice, t, aliceId, mkeyOf(t, dana))).ok()).toBeTruthy();
  expect(typeOf(t, dana)).toBe('REMOVED');

  await alice.reload();
  await pickCard(alice, 'eight01');
  await expect.poll(async () => (await dao(alice, t, aliceId)).all_players_ready).toBe(true);
  // the board: no trash can on the other cards, the own one keeps it
  await expect(alice.locator('#cbox .c')).toHaveCount(3);
  const others = alice.locator('#cbox .c:not(.is-me) .delete');
  await expect(others).toHaveCount(2);
  for (const del of await others.all()) await expect(del).toBeHidden();
  await expect(alice.locator('#cbox .c.is-me .delete')).toHaveCount(1);
  await expect(alice.locator('#cbox .c.is-me .delete')).not.toHaveCSS('display', 'none');

  // a mkey remembered from before the reveal: refused, nothing changes
  const res = await remove(alice, t, aliceId, mkeyOf(t, ben));
  expect(res.status()).toBe(400);
  expect(typeOf(t, ben)).toBe('PLAYER');
  expect(sql(`select card_key from pok_players_tbl where team_id = '${t}' and id = '${ben}'`)).toBe('three01');

  // the own seat: still possible, a leave (self-left mark, B-151), in one transaction (B-159)
  expect((await remove(alice, t, cleo, mkeyOf(t, cleo))).ok()).toBeTruthy();
  expect(typeOf(t, cleo)).toBe('REMOVED');
  expect(sql(`select json_type(json_extract(mcp_states, '$.self_left_at')) from pok_players_tbl
               where team_id = '${t}' and id = '${cleo}'`)).toBe('INTEGER');

  // mode off again: the trash can on the others is back
  sql(`update pok_teams_tbl set anonymous_mode = 0, anonymous_request_toggle = 0 where id = '${t}'`);
  await alice.reload();
  await expect(tableCard(alice, 'Ben').locator('.delete')).not.toHaveCSS('display', 'none');
  expect((await remove(alice, t, aliceId, mkeyOf(t, ben))).ok()).toBeTruthy();
  expect(typeOf(t, ben)).toBe('REMOVED');
});
