import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

// The API builds its SQL with bound parameters only (B-01). A manipulated team id must
// therefore match literally (i.e. nothing), never broaden the WHERE clause: it must not
// read or change data of other teams and must not produce a 500. Free text with quotes
// must round-trip through getDao unchanged.

/** The SID (player id) the board stored in localStorage after joining. */
async function sid(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('SID') as string);
}

/** The team id from a board URL. */
function teamId(boardUrl: string): string {
  return new URL(boardUrl).searchParams.get('t') as string;
}

// A manipulated team id must not leak players from another team, and must not crash the API.
const INJECTIONS = [
  `x' OR '1'='1`,
  `x' OR '1'='1' -- `,
  `x'); DROP TABLE pok_players_tbl; -- `,
  `x'`,
];

test('an injected team id neither leaks other teams nor returns a 500', async ({ browser }) => {
  // Victim team with a distinctively named player.
  const alice = await newPlayer(browser);
  const victimUrl = await createTeam(alice, 'Victim Team');
  await joinAsPlayer(alice, victimUrl, 'Alice');
  const aliceSid = await sid(alice);

  // A separate foreign team whose player must never show up for the attacker.
  const carol = await newPlayer(browser);
  const foreignUrl = await createTeam(carol, 'Foreign Team');
  await joinAsPlayer(carol, foreignUrl, 'CarolForeignXZ');

  // A legitimate request still returns the own team's data.
  const ok = await alice.request.get(
    `./api/dao.php?id=${aliceSid}&t=${encodeURIComponent(teamId(victimUrl))}`);
  expect(ok.status()).toBe(200);
  const okBody = await ok.json();
  expect(okBody.team_name).toBe('Victim Team');
  expect(okBody.players.map((p: { name: string }) => p.name)).toContain('Alice');

  // No injection may expose the foreign player or crash the endpoint.
  for (const t of INJECTIONS) {
    const res = await alice.request.get(`./api/dao.php?id=${aliceSid}&t=${encodeURIComponent(t)}`);
    expect(res.status(), `status for t=${t}`).toBeLessThan(500);
    expect(await res.text(), `body for t=${t}`).not.toContain('CarolForeignXZ');
  }

  // The foreign team is still intact (the DROP TABLE attempt did nothing).
  const carolSid = await sid(carol);
  const foreign = await carol.request.get(
    `./api/dao.php?id=${carolSid}&t=${encodeURIComponent(teamId(foreignUrl))}`);
  expect(foreign.status()).toBe(200);
  expect((await foreign.json()).players.map((p: { name: string }) => p.name)).toContain('CarolForeignXZ');
});

test('a player name with quotes round-trips through getDao unchanged', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Quote Team');
  const playerName = `O'Hara "Q" <b>`; // 14 characters, the name field allows 15
  await joinAsPlayer(alice, url, playerName);

  const res = await alice.request.get(
    `./api/dao.php?id=${await sid(alice)}&t=${encodeURIComponent(teamId(url))}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.name).toBe(playerName);
  expect(body.players.map((p: { name: string }) => p.name)).toContain(playerName);
});
