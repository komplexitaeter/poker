import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, getSid, asUser } from './helpers';

// The API builds its SQL with bound parameters only (B-01). A manipulated team id must
// therefore match literally (i.e. nothing), never broaden the WHERE clause: it must not
// read or change data of other teams and must not produce a 500. Free text with quotes
// must round-trip through getDao unchanged.

/** The SID (player id) the board stored in localStorage after joining. */
const sid = getSid;

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
    `./api/dao.php?t=${encodeURIComponent(teamId(victimUrl))}`, asUser(aliceSid));
  expect(ok.status()).toBe(200);
  const okBody = await ok.json();
  expect(okBody.team_name).toBe('Victim Team');
  expect(okBody.players.map((p: { name: string }) => p.name)).toContain('Alice');

  // No injection may expose the foreign player or crash the endpoint.
  for (const t of INJECTIONS) {
    const res = await alice.request.get(`./api/dao.php?t=${encodeURIComponent(t)}`, asUser(aliceSid));
    expect(res.status(), `status for t=${t}`).toBeLessThan(500);
    expect(await res.text(), `body for t=${t}`).not.toContain('CarolForeignXZ');
  }

  // The foreign team is still intact (the DROP TABLE attempt did nothing).
  const carolSid = await sid(carol);
  const foreign = await carol.request.get(
    `./api/dao.php?t=${encodeURIComponent(teamId(foreignUrl))}`, asUser(carolSid));
  expect(foreign.status()).toBe(200);
  expect((await foreign.json()).players.map((p: { name: string }) => p.name)).toContain('CarolForeignXZ');
});

test('a player name with quotes round-trips through getDao unchanged', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Quote Team');
  const playerName = `O'Hara "Q" <b>`; // 14 characters, the name field allows 15
  await joinAsPlayer(alice, url, playerName);

  const res = await alice.request.get(
    `./api/dao.php?t=${encodeURIComponent(teamId(url))}`, asUser(await sid(alice)));
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.name).toBe(playerName);
  expect(body.players.map((p: { name: string }) => p.name)).toContain(playerName);
});

/** B-152: a value as raw UTF-8 bytes in a header (Latin-1 string, one character per byte); NUL is not allowed in a
 * header, it becomes a space */
function rawHeader(value: string): string {
  return Buffer.from(value, 'utf8').toString('latin1').replace(/\0/g, ' ');
}

// B-88: player/user ids (SID) are 16 characters A-Z0-9 at most. A manipulated id (emoji, cut multibyte sequence,
// HTML special characters, too long) must behave like an unknown id: no 500, no PHP fatal or warning (CI checks
// the PHP log), no data change for the real player. Same for the card key and event code.
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
    // B-152: the user id goes in the header X-Poker-User as the raw UTF-8 bytes (a header string is Latin-1: one
    // character per byte), so get_uid() sees 4-byte characters, a cut emoji (invalid UTF-8) and quotes as they are
    const id = rawHeader(bad);
    const param = encodeURIComponent(bad); // the same value as URL parameter (card key, event code)
    const reads = [
      `./api/dao.php?t=${t}`,
      './api/get_user.php',
      './api/get_roadmap.php',
    ];
    for (const r of reads) {
      const res = await alice.request.get(r, asUser(id));
      expect(res.status(), `GET ${r}`).toBeLessThan(500);
      expect(await res.text(), `GET ${r}`).not.toContain('Fatal');
    }
    const writes: [string, string][] = [
      [id, `./api/name.php?type=player&name=Mallory&t=${t}`],
      [id, `./api/setc.php?cardkey=three01&t=${t}`],
      [aliceSid, `./api/setc.php?cardkey=${param}&t=${t}`],
      [id, './api/update_user.php?color_mode=light'],
      [id, './api/measure_event.php?event_code=E2E&display_type=e2e'],
      [aliceSid, `./api/measure_event.php?event_code=${param}&display_type=${param}`],
      [id, './api/feedback.php?stars=5&type=OTHER&text=b88'],
      [id, './api/vote_roadmap.php?item=1&reaction=UP'],
    ];
    for (const [uid, w] of writes) {
      const res = await alice.request.post(w, asUser(uid));
      expect(res.status(), `POST ${w}`).toBeLessThan(500);
      expect(await res.text(), `POST ${w}`).not.toContain('Fatal');
    }
    // BE-1 still reads ?id=: an invalid header must not fall back to a valid id in the URL (header wins, even when bad)
    const asAlice = `id=${encodeURIComponent(aliceSid)}`;
    const dao = await alice.request.get(`./api/dao.php?${asAlice}&t=${t}`, asUser(id));
    expect(dao.status()).toBeLessThan(500);
    expect(await dao.text()).not.toContain('"name":"Alice"');
    const card = await alice.request.post(`./api/setc.php?${asAlice}&cardkey=three01&t=${t}`, asUser(id));
    expect(card.status()).toBeLessThan(500);
    const gone = await alice.request.post(`./api/delete_user.php?${asAlice}`, asUser(id));
    expect(gone.status()).toBeLessThan(500);
  }

  // Alice is untouched: still the only player, without a card; no "Mallory" joined (name.php must not create a
  // player with an empty id). Checked before delete_user.php runs, which would remove such a row again.
  const expectOnlyAlice = async () => {
    const res = await alice.request.get(`./api/dao.php?t=${t}`, asUser(aliceSid));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Alice');
    expect(body.selected_card_key).toBeNull();
    expect(body.players.map((p: { name: string }) => p.name)).toEqual(['Alice']);
  };
  await expectOnlyAlice();

  for (const bad of BAD_IDS) {
    const res = await alice.request.post('./api/delete_user.php', asUser(rawHeader(bad)));
    expect(res.status(), `delete_user.php id=${bad}`).toBeLessThan(500);
  }
  await expectOnlyAlice();
});
