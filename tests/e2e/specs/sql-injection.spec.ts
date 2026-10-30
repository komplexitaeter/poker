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

// B-88: player/user ids (SID) are 16 characters A-Z0-9 at most. A manipulated id (emoji, cut multibyte sequence,
// HTML special characters, too long) must behave like an unknown id: no 500, no PHP fatal or warning (CI checks
// the PHP log), no data change for the real player. Same for the card key, event code and promo team id.
const BAD_IDS = [
  '😀😀😀😀',                 // 16 bytes of 4-byte characters
  'AB😀CDEFGHIJ😀',           // the old byte cut at 16 split the last emoji (invalid UTF-8)
  `<x>'"&;%00ABCDEF`,
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ', // longer than 16
];

test('a manipulated player id behaves like an unknown id and never returns a 500 (B-88)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Id Team');
  await joinAsPlayer(alice, url, 'Alice');
  const aliceSid = await sid(alice);
  const t = encodeURIComponent(teamId(url));

  for (const bad of BAD_IDS) {
    const id = encodeURIComponent(bad);
    const reads = [
      `./api/dao.php?id=${id}&t=${t}`,
      `./api/get_user.php?id=${id}`,
      `./api/get_survey.php?id=${id}`,
      `./api/get_roadmap.php?id=${id}`,
    ];
    for (const r of reads) {
      const res = await alice.request.get(r);
      expect(res.status(), `GET ${r}`).toBeLessThan(500);
      expect(await res.text(), `GET ${r}`).not.toContain('Fatal');
    }
    const writes = [
      `./api/name.php?id=${id}&type=player&name=Mallory&t=${t}`,
      `./api/setc.php?id=${id}&cardkey=three01&t=${t}`,
      `./api/setc.php?id=${aliceSid}&cardkey=${id}&t=${t}`,
      `./api/update_user.php?id=${id}&color_mode=light`,
      `./api/measure_event.php?id=${id}&event_code=E2E&display_type=e2e`,
      `./api/measure_event.php?id=${aliceSid}&event_code=${id}&display_type=${id}`,
      `./api/feedback.php?id=${id}&stars=5&type=OTHER&text=b88`,
      `./api/vote_roadmap.php?id=${id}&item=1&reaction=UP`,
      `./api/get_promo.php?player_id=${id}&team_id=${t}&display_type=e2e`,
      `./api/get_promo.php?player_id=${aliceSid}&team_id=${id}&display_type=e2e`,
    ];
    for (const w of writes) {
      const res = await alice.request.post(w);
      expect(res.status(), `POST ${w}`).toBeLessThan(500);
      expect(await res.text(), `POST ${w}`).not.toContain('Fatal');
    }
  }

  // Alice is untouched: still the only player, without a card; no "Mallory" joined (name.php must not create a
  // player with an empty id). Checked before delete_user.php runs, which would remove such a row again.
  const expectOnlyAlice = async () => {
    const res = await alice.request.get(`./api/dao.php?id=${aliceSid}&t=${t}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Alice');
    expect(body.selected_card_key).toBeNull();
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alice']);
  };
  await expectOnlyAlice();

  for (const bad of BAD_IDS) {
    const res = await alice.request.post(`./api/delete_user.php?id=${encodeURIComponent(bad)}`);
    expect(res.status(), `delete_user.php id=${bad}`).toBeLessThan(500);
  }
  await expectOnlyAlice();
});
