import { test, expect, Page, Browser } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, setTeamDeck, deckCard } from './helpers';

/**
 * B-101: with the J.U.D.G.E. deck the tip after the reveal is about a decision, not an estimate. Accepted as long as
 * nobody needs to talk (5, ? counts as 5) and nobody vetoes (6); those who need to talk come first, then the veto.
 * No "Let them explain" for the extremes and no "Everyone agrees". Anonymous mode: counts instead of names.
 */
const DESKTOP = { width: 1400, height: 800 };
const BREAK = 'Maybe take a short break.';

async function setCard(page: Page, boardUrl: string, id: string, cardKey: string): Promise<void> {
  const t = new URL(boardUrl).searchParams.get('t') ?? '';
  const res = await page.request.post(
    `/api/setc.php?id=${encodeURIComponent(id)}&cardkey=${cardKey}&t=${encodeURIComponent(t)}`);
  expect(res.ok()).toBeTruthy();
}

/** a J.U.D.G.E. board (with ☕ and ?), Alice joined, the others via the API; vote() sets everyone's card and reloads */
async function judgeTeam(browser: Browser, team: string, others: string[]) {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, team);
  await joinAsPlayer(alice, url, 'Alice');
  await setTeamDeck(alice, url, 'judge', null, ['break01', 'qstmrk1']);
  const ids = await addPlayersViaApi(alice, url, others);
  const aliceId = await alice.evaluate(() => localStorage.getItem('SID') ?? '');
  await alice.reload();
  await expect(deckCard(alice, 'jdg6')).toBeVisible();
  const vote = async (cards: string[]) => {
    for (const [i, id] of [aliceId, ...ids].entries()) await setCard(alice, url, id, cards[i]);
    await alice.reload();
    await expect(alice.locator('#round_status')).toHaveText('revealed');
  };
  return { alice, url, vote, tip: alice.locator('#round_tip') };
}

test('J.U.D.G.E.: decision accepted, concerns offered (B-101)', async ({ browser }) => {
  const { alice, vote, tip } = await judgeTeam(browser, 'Judge Accepted', ['Bob', 'Cleo', 'Dan']);

  // only 0–2: accepted, no "Let them explain" for 0 and 2, spread still shown
  await vote(['jdg0', 'jdg1', 'jdg2', 'jdg1']);
  await expect(tip).toHaveText('Decision accepted.');
  await expect(alice.locator('#spread')).toBeVisible();

  // the same card for everyone: accepted, not "Everyone agrees"
  await vote(['jdg1', 'jdg1', 'jdg1', 'jdg1']);
  await expect(tip).toHaveText('Decision accepted.');

  // 3 and 4: accepted, the concerns are offered by name; coffee adds a break
  await vote(['jdg1', 'jdg3', 'jdg4', 'break01']);
  await expect(tip).toHaveText(`Decision accepted. Concerns from Bob (3) and Cleo (4) – want to hear them? ${BREAK}`);
  await expect(tip.locator('b')).toHaveText(['Bob (3)', 'Cleo (4)']);
});

test('J.U.D.G.E.: need to talk first, then the veto; ? counts as 5; veto only (B-101)', async ({ browser }) => {
  const { vote, tip } = await judgeTeam(browser, 'Judge Talk', ['Bob', 'Cleo', 'Dan']);

  // 5 and 6: talk first, then the veto (concerns are not mentioned)
  await vote(['jdg6', 'jdg5', 'jdg3', 'jdg1']);
  await expect(tip).toHaveText('Let them talk first: Bob (5). Then hear the veto: Alice (6)');
  await expect(tip.locator('b')).toHaveText(['Bob (5)', 'Alice (6)']);

  // ? counts as 5
  await vote(['jdg1', 'qstmrk1', 'jdg2', 'jdg1']);
  await expect(tip).toHaveText('Let them talk first: Bob (?)');
  await vote(['jdg5', 'jdg5', 'qstmrk1', 'jdg6']);
  await expect(tip).toHaveText('Let them talk first: Alice, Bob (5) and Cleo (?). Then hear the veto: Dan (6)');

  // veto only
  await vote(['jdg1', 'jdg6', 'jdg4', 'jdg6']);
  await expect(tip).toHaveText('Hear the veto: Bob, Dan (6)');
});

test('J.U.D.G.E. in anonymous mode: counts, nobody named (B-101)', async ({ browser }) => {
  const { alice, url, vote, tip } = await judgeTeam(browser, 'Judge Anonymous', ['Bob', 'Cleo', 'Dan']);
  const t = new URL(url).searchParams.get('t') ?? '';
  expect((await alice.request.post(`/api/update_team.php?t=${encodeURIComponent(t)}&anonymous_request_toggle=1`)).ok()).toBeTruthy();

  await vote(['jdg1', 'jdg2', 'jdg1', 'jdg0']);
  await expect(tip).toHaveText('Decision accepted.');
  await vote(['jdg1', 'jdg3', 'jdg4', 'jdg1']);
  await expect(tip).toHaveText('Decision accepted. 2 × concerns – want to hear them?');
  await vote(['jdg5', 'qstmrk1', 'jdg6', 'jdg1']);
  await expect(tip).toHaveText('Let them talk first: 2 × need to talk. Then hear the veto: 1 × veto');
  await vote(['jdg6', 'jdg1', 'jdg1', 'jdg1']);
  await expect(tip).toHaveText('Hear the veto: 1 × veto');
  await expect(tip.locator('b')).toHaveCount(0);
});
