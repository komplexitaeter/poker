import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, asUser, pickCard, getSid } from './helpers';

/**
 * B-163: anonymous mode after the reveal. dao.php gives every card a handle per round instead of the mkey (10 digits,
 * above every real mkey, the same for all viewers, new in every round), so a mkey seen with a name before the reveal
 * leads to no card. The own board finds its card by card_mkey. Players with the same card are ordered by handle, not
 * by name. Reactions aim at the handles and still land on the right card, a thrower with a card is sent as its handle
 * too (else "nobody throws at the own card" narrows the handles down); the own trash can still works.
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

type Player = { name: string; mkey: string; display_card_key: string; original_card_key: string | null; i: number };

async function dao(page: Page, t: string, id: string) {
  const res = await page.request.get(`/api/dao.php?${new URLSearchParams({ t })}`, asUser(id));
  expect(res.ok()).toBeTruthy();
  return res.json();
}

const setc = async (page: Page, t: string, id: string, cardkey: string) =>
  expect((await page.request.post(`/api/setc.php?${new URLSearchParams({ t, cardkey })}`, asUser(id))).ok()).toBeTruthy();

const newRound = async (page: Page, t: string, id: string) =>
  expect((await page.request.post(`/api/newround.php?${new URLSearchParams({ t })}`, asUser(id))).ok()).toBeTruthy();

test('dao.php: after an anonymous reveal no card carries a mkey, handles are shared and new per round', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'B163 Handles');
  const t = teamIdOf(url);
  const [anna, ben, cleo] = await addPlayersViaApi(page, url, ['Anna', 'Ben', 'Cleo']);
  sql(`update pok_teams_tbl set anonymous_mode = 1, anonymous_request_toggle = 1 where id = '${t}'`);

  // before the reveal: names and mkeys are visible (as always)
  const before = await dao(page, t, anna);
  expect(before.all_players_ready).toBe(false);
  const mkeys = new Map<string, string>(before.players.map((p: Player) => [p.name, p.mkey]));
  expect([...mkeys.keys()].sort()).toEqual(['Anna', 'Ben', 'Cleo']);
  expect(before.card_mkey).toBe(before.mkey);

  // Ben and Cleo play the same card, Ben changes it after the reveal (stack "card changed", B-104)
  await setc(page, t, ben, 'three01');
  await setc(page, t, cleo, 'five001');
  await setc(page, t, anna, 'eight01');
  await setc(page, t, ben, 'five001');

  const handlesOf = (d: { players: Player[] }) => d.players.map(p => p.mkey);
  const views = [await dao(page, t, anna), await dao(page, t, ben), await dao(page, t, cleo)];
  for (const d of views) {
    expect(d.all_players_ready).toBe(true);
    expect(d.players.map((p: Player) => p.name)).toEqual(['******', '******', '******']);
    for (const p of d.players as Player[]) {
      expect(p.mkey).toMatch(/^[3-9][0-9]{9}$/); // above every real mkey (signed int), at most 10 digits (poker-msg)
      expect([...mkeys.values()]).not.toContain(p.mkey);
    }
    // no foreign mkey of before anywhere in the answer (the own one stays at the top: reactions, own trash can)
    // (compared field by field: a substring check could hit a card value or a handle by chance)
    const shown = [...d.players.map((p: Player) => p.mkey), ...d.observers.map((o: { mkey: string }) => o.mkey)];
    for (const [name, mkey] of mkeys) {
      if (mkey === d.mkey) continue;
      expect(shown, name).not.toContain(mkey);
    }
    // the own card is found by card_mkey, and only by it
    expect(handlesOf(d)).toContain(d.card_mkey);
    expect(d.card_mkey).not.toBe(d.mkey);
    // ordered by card, the same order for every viewer
    expect(d.players.map((p: Player) => p.display_card_key)).toEqual(['five001', 'five001', 'eight01']);
  }
  // the same handles in the same order for all viewers, a different own card for each
  expect(handlesOf(views[1])).toEqual(handlesOf(views[0]));
  expect(handlesOf(views[2])).toEqual(handlesOf(views[0]));
  expect(new Set(views.map(d => d.card_mkey)).size).toBe(3);
  // the changed card sits where the handles put it, not where the names would (Ben before Cleo)
  const benHandle = views[1].card_mkey;
  const fives = views[0].players.filter((p: Player) => p.display_card_key === 'five001');
  expect(fives.map((p: Player) => p.mkey)).toEqual(fives.map((p: Player) => p.mkey).slice().sort());
  expect(fives.find((p: Player) => p.mkey === benHandle)?.original_card_key).toBe('three01');

  // stable within the round: a reload and a late joiner keep the handles
  const [dora] = await addPlayersViaApi(page, url, ['Dora']);
  const late = await dao(page, t, anna);
  expect(late.all_players_ready).toBe(true);
  for (const h of handlesOf(views[0])) expect(handlesOf(late)).toContain(h);
  expect(late.players.find((p: Player) => p.display_card_key === 'late001').mkey)
    .toBe((await dao(page, t, dora)).card_mkey);

  // the next round: new handles
  await newRound(page, t, anna);
  for (const [id, card] of [[anna, 'eight01'], [ben, 'five001'], [cleo, 'five001'], [dora, 'one0001']]) {
    await setc(page, t, id, card);
  }
  const next = await dao(page, t, anna);
  expect(next.all_players_ready).toBe(true);
  for (const h of handlesOf(next)) expect(handlesOf(late)).not.toContain(h);

  // anonymous mode off: the mkeys are back
  sql(`update pok_teams_tbl set anonymous_mode = 0, anonymous_request_toggle = 0 where id = '${t}'`);
  const plain = await dao(page, t, anna);
  expect(plain.players.find((p: Player) => p.name === 'Ben').mkey).toBe(mkeys.get('Ben'));
  expect(plain.card_mkey).toBe(plain.mkey);
});

test('board: after an anonymous reveal reactions land on the right card, the own trash can still works', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'B163 Board');
  const t = teamIdOf(url);
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  const cleo = await newPlayer(browser);
  await joinAsPlayer(cleo, url, 'Cleo');
  sql(`update pok_teams_tbl set anonymous_mode = 1, anonymous_request_toggle = 1 where id = '${t}'`);
  const aliceId = await getSid(alice);
  const aliceMkey = sql(`select mkey from pok_players_tbl where team_id = '${t}' and id = '${safe(aliceId)}'`);

  const bobId = await getSid(bob);
  const bobMkey = sql(`select mkey from pok_players_tbl where team_id = '${t}' and id = '${safe(bobId)}'`);

  await bob.reload();
  await alice.reload();
  await cleo.reload();
  await pickCard(alice, 'eight01');
  await pickCard(bob, 'three01');
  await pickCard(cleo, 'one0001');
  for (const p of [alice, bob, cleo]) {
    await expect(p.locator('#cbox .c[data-card="three01"]')).toHaveCount(1);
    await expect(p.locator('#cbox .c[data-card="eight01"]')).toHaveCount(1);
  }
  const aliceHandle = (await dao(alice, t, aliceId)).card_mkey as string;
  const bobHandle = (await dao(bob, t, bobId)).card_mkey as string;
  expect(bobHandle).not.toBe(bobMkey);
  expect(aliceHandle).not.toBe(aliceMkey);

  // the cards carry the handles: Alice's own card on both boards, never her mkey
  await expect(alice.locator('#cbox .c.is-me')).toHaveAttribute('id', aliceHandle);
  await expect(bob.locator('#cbox .c[data-card="eight01"]')).toHaveAttribute('id', aliceHandle);
  await expect(bob.locator('#cbox .c[data-card="eight01"]')).not.toHaveClass(/is-me/);
  await expect(alice.locator(`[id="${aliceMkey}"]`)).toHaveCount(0);
  await expect(bob.locator(`[id="${aliceMkey}"]`)).toHaveCount(0);
  // own card: trash can, no smiley; the other card: smiley, no trash can (B-159)
  await expect(alice.locator('#cbox .c.is-me .react')).toHaveCount(0);
  await expect(alice.locator('#cbox .c.is-me .delete')).not.toHaveCSS('display', 'none');
  await expect(alice.locator('#cbox .c:not(.is-me) .delete')).toHaveCount(2);
  for (const del of await alice.locator('#cbox .c:not(.is-me) .delete').all()) await expect(del).toBeHidden();

  // Bob throws at the 8 (Alice's card): it lands there on both boards, Alice's board knows it is hers
  const landed = (p: Page) => p.evaluate(() => {
    const w = window as unknown as { landedOn: string[] };
    w.landedOn = [];
    new MutationObserver(list => list.forEach(m => Array.from(m.addedNodes).forEach(n => {
      if (n instanceof Element && n.classList.contains('react-land')) w.landedOn.push((m.target as Element).id);
    }))).observe(document.getElementById('cbox') as HTMLElement, { childList: true, subtree: true });
  });
  await landed(alice);
  await landed(bob);
  // what poker-msg forwards to the others (raw WebSocket frames)
  const received = (p: Page) => p.evaluate(() => {
    const w = window as unknown as { gotReact: string[] };
    w.gotReact = [];
    (0, eval)('gConn').addEventListener('message', (e: MessageEvent) => {
      if (String(e.data).startsWith('react:')) w.gotReact.push(String(e.data));
    });
  });
  const got = (p: Page) => p.evaluate(() => (window as unknown as { gotReact: string[] }).gotReact.slice());
  await received(alice);
  await received(cleo);
  const target = bob.locator('#cbox .c[data-card="eight01"]');
  await target.hover();
  await target.locator('.react').click();
  await bob.locator('#react_bar button[data-react="party"]').click();
  for (const p of [alice, bob]) {
    await expect.poll(() => p.evaluate(() => (window as unknown as { landedOn: string[] }).landedOn))
      .toEqual([aliceHandle]);
  }
  // the thrower is Bob's card handle, not his mkey: no narrowing down by "nobody throws at the own card"
  for (const p of [alice, cleo]) {
    await expect.poll(() => got(p)).toEqual([`react:${bobHandle}:${aliceHandle}:party`]);
    const [, from, to] = (await got(p))[0].split(':'); // fields, not substrings (a handle may contain the mkey's digits)
    expect(from).toBe(bobHandle);
    expect(from).not.toBe(bobMkey);
    expect(to).not.toBe(aliceMkey);
  }

  // Bob nudges the 8: it rings (is-nudged-me) only on Alice's board, the others just see it shake
  const nudged = (p: Page) => p.evaluate(() => {
    const w = window as unknown as { nudgedMe: number; nudged: number };
    w.nudgedMe = 0; w.nudged = 0;
    new MutationObserver(list => list.forEach(m => {
      const el = m.target as Element;
      const before = m.oldValue ?? '';
      if (el.classList.contains('is-nudged-me') && !before.includes('is-nudged-me')) w.nudgedMe++;
      if (el.classList.contains('is-nudged') && !/\bis-nudged\b/.test(before)) w.nudged++;
    })).observe(document.getElementById('cbox') as HTMLElement,
      { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });
  const counts = (p: Page) => p.evaluate(() => {
    const w = window as unknown as { nudgedMe: number; nudged: number };
    return [w.nudged > 0, w.nudgedMe > 0];
  });
  for (const p of [alice, bob, cleo]) await nudged(p);
  await bob.waitForTimeout(1100); // poker-msg rate limit (B-131)
  await target.hover();
  await target.locator('.nudge').click();
  await expect.poll(() => counts(alice)).toEqual([true, true]);
  await expect.poll(() => counts(cleo)).toEqual([true, false]);
  await expect.poll(() => counts(bob)).toEqual([true, false]);

  // Alice's own trash can removes her seat (delete.php gets the real mkey, not the handle)
  const own = alice.locator('#cbox .c.is-me');
  await own.hover();
  await own.locator('.delete').click();
  await alice.locator('#rm_confirm .rm-ok').click();
  await expect.poll(() => sql(`select player_type from pok_players_tbl where team_id = '${t}' and id = '${safe(aliceId)}'`))
    .toBe('REMOVED');
});

test('observers after an anonymous reveal: masked like the players, a player turning observer is not identifiable', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'B163 Observers');
  const t = teamIdOf(url);
  const [anna, ben, cleo, olga] = await addPlayersViaApi(page, url, ['Anna', 'Ben', 'Cleo', 'Olga']);
  expect((await page.request.post(`/api/name.php?${new URLSearchParams({ t, name: 'Olga', type: 'observer' })}`,
    asUser(olga))).ok()).toBeTruthy();
  sql(`update pok_teams_tbl set anonymous_mode = 1, anonymous_request_toggle = 1 where id = '${t}'`);
  const olgaMkey = sql(`select mkey from pok_players_tbl where team_id = '${t}' and id = '${safe(olga)}'`);

  // before the reveal: observers by name, as always
  expect((await dao(page, t, anna)).observers).toEqual([{ name: 'Olga', mkey: olgaMkey, via_ai: false }]);

  await setc(page, t, anna, 'three01');
  await setc(page, t, ben, 'five001');
  await setc(page, t, cleo, 'eight01');
  const revealed = await dao(page, t, anna);
  expect(revealed.all_players_ready).toBe(true);
  expect(revealed.observers).toEqual([{ name: '******', mkey: '', via_ai: false }]);
  const names = (d: { players: Player[]; observers: { name: string }[] }) =>
    [...d.players.map(p => p.name), ...d.observers.map(o => o.name)];
  expect(names(revealed)).not.toContain('Olga');
  expect(revealed.observers.map((o: { mkey: string }) => o.mkey)).not.toContain(olgaMkey);
  // the own observer row stays recognisable for oneself
  expect((await dao(page, t, olga)).observers).toEqual([{ name: 'Olga', mkey: olgaMkey, via_ai: false }]);

  // Ben becomes an observer after the reveal: his card stays (same handle, same value) until the next round, one
  // more masked observer, no name anywhere
  const cardsOf = (d: { players: Player[] }) => d.players.map(p => `${p.mkey}:${p.display_card_key}`);
  expect((await page.request.post(`/api/name.php?${new URLSearchParams({ t, name: 'Ben', type: 'observer' })}`,
    asUser(ben))).ok()).toBeTruthy();
  const after = await dao(page, t, anna);
  expect(after.all_players_ready).toBe(true);
  expect(cardsOf(after)).toEqual(cardsOf(revealed));
  expect(after.players.map((p: Player) => p.display_card_key)).toEqual(['three01', 'five001', 'eight01']);
  expect(after.observers).toEqual([{ name: '******', mkey: '', via_ai: false }, { name: '******', mkey: '', via_ai: false }]);
  expect(names(after)).not.toContain('Ben');
  // Ben's own board: his card is no own card any more (he watches), his observer row comes first (Sina)
  const forBen = await dao(page, t, ben);
  expect(forBen.card_mkey).toBe('');
  expect(cardsOf(forBen)).toEqual(cardsOf(revealed));
  expect(forBen.observers[0]).toEqual({ name: 'Ben', mkey: expect.stringMatching(/^[0-9]+$/), via_ai: false });

  // Cleo leaves the table by herself: her card stays as well
  expect((await page.request.post(`/api/name.php?${new URLSearchParams({ t, name: '' })}`, asUser(cleo))).ok()).toBeTruthy();
  expect(sql(`select player_type from pok_players_tbl where team_id = '${t}' and id = '${safe(cleo)}'`)).toBe('REMOVED');
  expect(cardsOf(await dao(page, t, anna))).toEqual(cardsOf(revealed));

  // REST/MCP board: the same three cards, the result unchanged, masked observers without mkey
  const v1 = await page.request.get('/api/v1/board', { headers: { 'X-Poker-User': anna, 'X-Poker-Team': t } });
  expect(v1.status(), await v1.text()).toBe(200);
  const board = await v1.json();
  expect(board.players.map((p: { card_key: string }) => p.card_key)).toEqual(['three01', 'five001', 'eight01']);
  expect(board.round.result.distribution.map((v: { card_key: string; count: number }) => [v.card_key, v.count]))
    .toEqual([['three01', 1], ['five001', 1], ['eight01', 1]]);
  for (const o of board.observers) expect(o).toEqual({ name: '******', mkey: null, via_ai: false });

  // Ben plays again: his card is his own again, with the same handle
  expect((await page.request.post(`/api/name.php?${new URLSearchParams({ t, name: 'Ben', type: 'player' })}`,
    asUser(ben))).ok()).toBeTruthy();
  const back = await dao(page, t, ben);
  expect(cardsOf(back)).toEqual(cardsOf(revealed));
  expect(back.card_mkey).toBe(forBen.players.find((p: Player) => p.display_card_key === 'five001').mkey);

  // the web board (as Anna): two masked observer rows, no smiley on them
  await page.evaluate(id => localStorage.setItem('SID', id), anna);
  await page.goto(url);
  await expect(page.locator('#cbox .c.is-me')).toHaveAttribute('data-card', 'three01');
  await expect(page.locator('#cbox .c')).toHaveCount(3);
  await expect(page.locator('#observers .obs')).toHaveCount(2); // Olga and Cleo (removed, still connected)
  await expect(page.locator('#observers .obs .obs-name')).toHaveText(['******', '******']);
  await expect(page.locator('#observers .obs .react')).toHaveCount(0);

  // the next round: the card left behind by Cleo goes, as all cards
  await newRound(page, t, anna);
  const fresh = await dao(page, t, anna);
  expect(fresh.players.map((p: Player) => p.name).sort()).toEqual(['Anna', 'Ben']);
  expect(fresh.all_players_ready).toBe(false);
});
