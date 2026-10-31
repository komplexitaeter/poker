import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi, joinAsPlayer, tableCard, expectTableCard } from './helpers';

/**
 * B-104: whoever changes his card after the reveal keeps the card of the reveal as original_card_key (only the first
 * one, back to it -> null). dao.php delivers it per player only while the cards are revealed. A new round copies it
 * into the round snapshot and clears it. Changes before the reveal and late001 as "original" do not count.
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

async function setCard(page: Page, t: string, id: string, cardkey: string) {
  const res = await page.request.post(`/api/setc.php?${new URLSearchParams({ t, id, cardkey }).toString()}`);
  expect(res.ok()).toBeTruthy();
}

type Player = { name: string; display_card_key: string; original_card_key: string | null };

async function players(page: Page, t: string, id: string): Promise<Record<string, Player>> {
  const res = await page.request.get(`/api/dao.php?${new URLSearchParams({ t, id }).toString()}`);
  expect(res.ok()).toBeTruthy();
  const state = await res.json();
  return Object.fromEntries(state.players.map((p: Player) => [p.name, p]));
}

const original = (t: string, id: string) =>
  sql(`select ifnull(original_card_key, 'NULL') from pok_players_tbl where id = '${id}' and team_id = '${t}'`);

test('a card changed after the reveal keeps the original until the next round', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Card Changed');
  const t = teamIdOf(url);
  const [bob, carol] = await addPlayersViaApi(page, url, ['Bob', 'Carol']);
  // the creator of the team is an observer in this test: only Bob and Carol play
  sql(`update pok_players_tbl set player_type = 'OBSERVER' where team_id = '${t}' and id not in ('${bob}', '${carol}')`);

  // changes before the reveal do not count
  await setCard(page, t, bob, 'three01');
  await setCard(page, t, bob, 'five001');
  expect(original(t, bob)).toBe('NULL');
  let p = await players(page, t, bob);
  expect(p.Bob.display_card_key).toBe('done001');
  expect(p.Bob.original_card_key).toBeNull();

  // reveal, then Bob changes: the card of the reveal is the original
  await setCard(page, t, carol, 'eight01');
  await setCard(page, t, bob, 'eight01');
  expect(original(t, bob)).toBe('five001');
  p = await players(page, t, carol);
  expect(p.Bob.display_card_key).toBe('eight01');
  expect(p.Bob.original_card_key).toBe('five001');
  expect(p.Carol.original_card_key).toBeNull();

  // a second change keeps the first original
  await setCard(page, t, bob, 'thrtn01');
  expect(original(t, bob)).toBe('five001');

  // back to the original: no stack
  await setCard(page, t, bob, 'five001');
  expect(original(t, bob)).toBe('NULL');
  expect((await players(page, t, carol)).Bob.original_card_key).toBeNull();

  // Carol takes her card back (cards covered again): her original is kept but not delivered while covered
  const res = await page.request.post(`/api/setc.php?${new URLSearchParams({ t, id: carol }).toString()}`);
  expect(res.ok()).toBeTruthy();
  expect(original(t, carol)).toBe('eight01');
  p = await players(page, t, bob);
  expect(p.Carol.original_card_key).toBeNull();
  expect(p.Bob.original_card_key).toBeNull();
  // ... and lays another card: revealed again with the stack
  await setCard(page, t, carol, 'two0001');
  p = await players(page, t, bob);
  expect(p.Carol.display_card_key).toBe('two0001');
  expect(p.Carol.original_card_key).toBe('eight01');

  // anonymous mode: the stack stays (names are hidden anyway)
  sql(`update pok_teams_tbl set anonymous_mode = 1 where id = '${t}'`);
  const res2 = await page.request.get(`/api/dao.php?${new URLSearchParams({ t, id: bob }).toString()}`);
  const anonymous: Player[] = (await res2.json()).players;
  expect(anonymous.every((x) => x.name === '******')).toBe(true);
  expect(anonymous.find((x) => x.display_card_key === 'two0001')?.original_card_key).toBe('eight01');
  sql(`update pok_teams_tbl set anonymous_mode = 0 where id = '${t}'`);

  // new round: the snapshot keeps the original, the player row is cleared
  const nr = await page.request.post(`/api/newround.php?${new URLSearchParams({ t, id: bob }).toString()}`);
  expect(nr.ok()).toBeTruthy();
  expect(original(t, carol)).toBe('NULL');
  expect(sql(`select concat(d.card_key, ':', ifnull(d.original_card_key, 'NULL'))
                from pok_roundstat_details_tbl d
                join pok_roundstats_tbl r on r.id = d.roundstat_id
               where r.team_id = '${t}' and d.player_id = '${carol}'`)).toBe('two0001:eight01');
  expect(sql(`select ifnull(d.original_card_key, 'NULL') from pok_roundstat_details_tbl d
               where d.team_id = '${t}' and d.player_id = '${bob}'`)).toBe('NULL');
});

test('late001 as card of the reveal is no original', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Card Changed Late');
  const t = teamIdOf(url);
  const [bob, carol] = await addPlayersViaApi(page, url, ['Bob', 'Carol']);
  sql(`update pok_players_tbl set player_type = 'OBSERVER' where team_id = '${t}' and id not in ('${bob}', '${carol}')`);
  await setCard(page, t, bob, 'five001');
  sql(`update pok_players_tbl set card_key = 'late001' where id = '${carol}' and team_id = '${t}'`);

  await setCard(page, t, carol, 'three01');
  expect(original(t, carol)).toBe('NULL');
  expect((await players(page, t, bob)).Carol.original_card_key).toBeNull();
});

/** the current card (top of the stack) and the original behind it */
const topFace = (page: Page, name: string) => tableCard(page, name).locator('.pc:not(.pc-orig)');
const backFace = (page: Page, name: string) => tableCard(page, name).locator('.pc-orig');

test('the table shows a changed card as a stack of original and current card', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Card Changed Table');
  const t = teamIdOf(url);
  await joinAsPlayer(page, url, 'Alice');
  const [bob, carol] = await addPlayersViaApi(page, url, ['Bob', 'Carol']);
  sql(`update pok_players_tbl set player_type = 'OBSERVER' where team_id = '${t}' and id not in ('${bob}', '${carol}')`);
  await page.reload();

  await setCard(page, t, bob, 'five001');
  await setCard(page, t, carol, 'eight01');
  await expectTableCard(page, 'Bob', 'five001');
  await expect(backFace(page, 'Bob')).toHaveCount(0);
  const size = async () => {
    const card = (await tableCard(page, 'Bob').boundingBox())!;
    return [card.width, card.height, (await page.locator('#cbox').boundingBox())!.height].map(Math.round);
  };
  const before = await size();

  // Bob changes after the reveal: 5 lies behind 13
  await setCard(page, t, bob, 'thrtn01');
  await expectTableCard(page, 'Bob', 'thrtn01');
  await expect(tableCard(page, 'Bob')).toHaveAttribute('data-original', 'five001');
  await expect(backFace(page, 'Bob')).toBeVisible();
  await expect(backFace(page, 'Bob')).toHaveAttribute('aria-hidden', 'true');
  await expect(backFace(page, 'Bob').locator('use')).toHaveAttribute('href', /#s-5$/);
  await expect(topFace(page, 'Bob').locator('use')).toHaveAttribute('href', /#s-13$/);
  await expect(topFace(page, 'Bob')).toHaveAttribute('aria-label', '13, changed from 5 to 13');
  await expect(backFace(page, 'Carol')).toHaveCount(0);
  // the original peeks out to the upper left, the card and the table keep their size (the cards are sorted by
  // value after the reveal, so Bob's card may move)
  await expect(backFace(page, 'Bob')).not.toHaveClass(/pc-orig-in/); // slide-in finished
  const back = (await backFace(page, 'Bob').boundingBox())!;
  const top = (await topFace(page, 'Bob').boundingBox())!;
  expect(back.x).toBeLessThan(top.x - 3);
  expect(back.y).toBeLessThan(top.y);
  expect(await size()).toEqual(before);
  // both cards stay in the place of one card: below the name tag, the current card in its lower right corner
  const card = (await tableCard(page, 'Bob').boundingBox())!;
  const name = (await tableCard(page, 'Bob').locator('.card_player_name').boundingBox())!;
  expect(back.x).toBeGreaterThanOrEqual(card.x - 4); // turned slightly
  expect(back.y).toBeGreaterThanOrEqual(name.y + name.height - 4);
  expect(Math.abs(top.x + top.width - (card.x + card.width))).toBeLessThan(1.5);
  expect(Math.abs(top.y + top.height - (card.y + card.height))).toBeLessThan(1.5);
  // the original value as corner index in the visible rim
  await expect(backFace(page, 'Bob').locator('.pc-corner')).toHaveText('5');
  await expect(backFace(page, 'Bob').locator('.pc-corner')).toBeVisible();

  // back to the original: no stack
  await setCard(page, t, bob, 'five001');
  await expectTableCard(page, 'Bob', 'five001');
  await expect(backFace(page, 'Bob')).toHaveCount(0);
  await expect(tableCard(page, 'Bob')).not.toHaveAttribute('data-original', /./);
  await expect(topFace(page, 'Bob')).toHaveAttribute('aria-label', '5');

  // anonymous mode: the stack stays
  await setCard(page, t, carol, 'two0001');
  sql(`update pok_teams_tbl set anonymous_mode = 1 where id = '${t}'`);
  await page.reload();
  const carolCard = page.locator('#cbox .c[data-card="two0001"]');
  await expect(carolCard).toHaveAttribute('data-original', 'eight01');
  await expect(carolCard.locator('.pc-orig')).toBeVisible();
  await expect(carolCard.locator('.pc:not(.pc-orig)')).toHaveAttribute('aria-label', '2, changed from 8 to 2');

  // new round: all stacks are gone
  const nr = await page.request.post(`/api/newround.php?${new URLSearchParams({ t, id: bob }).toString()}`);
  expect(nr.ok()).toBeTruthy();
  await expect(page.locator('#cbox .c[data-card="two0001"]')).toHaveCount(0);
  await expect(page.locator('#cbox .pc-orig')).toHaveCount(0);
  await expect(page.locator('#cbox .c[data-original]')).toHaveCount(0);
});
