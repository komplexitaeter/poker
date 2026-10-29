import { test, expect, Page, Browser } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, addPlayersViaApi } from './helpers';

/**
 * B-70: below the round status line a short tip tells the current user what to do now (large
 * screens only); once the cards are revealed it sits below the spread. Phones show no tip.
 */
const DESKTOP = { width: 1400, height: 800 };
const PHONE = { width: 390, height: 844 };

async function setCard(page: Page, boardUrl: string, id: string, cardKey: string): Promise<void> {
  const t = new URL(boardUrl).searchParams.get('t') ?? '';
  const res = await page.request.post(
    `/api/setc.php?id=${encodeURIComponent(id)}&cardkey=${cardKey}&t=${encodeURIComponent(t)}`);
  expect(res.ok()).toBeTruthy();
}

const below = async (page: Page, upper: string, lower: string) => {
  const a = (await page.locator(upper).boundingBox())!;
  const b = (await page.locator(lower).boundingBox())!;
  return b.y >= a.y + a.height - 1;
};

test('tip: invite, pick, wait, explain, agree; none on phones (B-70)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Tips');
  await joinAsPlayer(alice, url, 'Alice');
  const tip = alice.locator('#round_tip');

  // alone on the board
  await expect(tip).toHaveText('Copy the board link and invite your team.');
  await expect(tip).toBeVisible();

  // two more players, nobody has voted: pick a card
  const [bob, cleo] = await addPlayersViaApi(alice, url, ['Bob', 'Cleo']);
  await alice.reload();
  await expect(tip).toHaveText(/^Pick the card that fits best from your point of view\./);

  // picked: wait for the others, by name; below the status line
  await pickCard(alice, 'three01');
  await expect(tip).toHaveText('Waiting for Bob and Cleo. Once everyone has voted, cards are revealed automatically.');
  await expect(tip.locator('b')).toHaveText(['Bob', 'Cleo']);
  expect(await below(alice, '#round_status', '#round_tip')).toBe(true);

  // more than three missing: just the number
  const [dan, eve] = await addPlayersViaApi(alice, url, ['Dan', 'Eve']);
  await alice.reload();
  await expect(tip).toHaveText('Waiting for 4 players. Once everyone has voted, cards are revealed automatically.');

  // revealed, different cards: lowest and highest explain (infinity does not count), below the spread
  await setCard(alice, url, bob, 'three01');
  await setCard(alice, url, cleo, 'eight01');
  await setCard(alice, url, dan, 'infin01');
  await setCard(alice, url, eve, 'eight01');
  await alice.reload();
  await expect(alice.locator('#round_status')).toHaveText('revealed');
  await expect(tip).toHaveText('Let them explain: Alice, Bob (3) and Cleo, Eve (8)');
  // as in the mockup: the names stand out, the rest is muted
  await expect(tip.locator('b')).toHaveText(['Alice, Bob (3)', 'Cleo, Eve (8)']);
  await expect(alice.locator('.side > #round_tip')).toBeVisible();
  expect(await below(alice, '#spread', '#round_tip')).toBe(true);

  // revealed, all the same: agreement
  const aliceId = await alice.evaluate(() => localStorage.getItem('SID') ?? '');
  for (const id of [aliceId, bob, cleo, dan, eve]) await setCard(alice, url, id, 'five001');
  await alice.reload();
  await expect(tip).toHaveText('Everyone agrees – start a new round.');

  // phones: no tip
  const phone = await newPlayer(browser, { viewport: PHONE });
  await joinAsPlayer(phone, url, 'Finn');
  await expect(phone.locator('#round_status')).toBeHidden();
  await expect(phone.locator('#round_tip')).toBeHidden();
});

/** B-79: a board with the deck of a preset (mapping in cards.json), Alice joined, Bob and Cleo via the API */
async function teamWithDeck(browser: Browser, team: string, preset: string) {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  await alice.goto(`/?tool=e2e&team=${encodeURIComponent(team)}&preset=${encodeURIComponent(preset)}`);
  await alice.waitForURL(/\?t=/);
  const url = alice.url();
  await joinAsPlayer(alice, url, 'Alice');
  const [bob, cleo] = await addPlayersViaApi(alice, url, ['Bob', 'Cleo']);
  const aliceId = await alice.evaluate(() => localStorage.getItem('SID') ?? '');
  // all three vote, then the board reloads (revealed)
  const vote = async (cards: string[]) => {
    for (const [i, id] of [aliceId, bob, cleo].entries()) await setCard(alice, url, id, cards[i]);
    await alice.reload();
    await expect(alice.locator('#round_status')).toHaveText('revealed');
  };
  return { alice, url, vote };
}

const TALK = 'Talk about the cards you chose.';

test('tip after the reveal: talk about traffic lights, also in a mixed choice; control cards stay neutral (B-79)', async ({ browser }) => {
  const { alice, vote } = await teamWithDeck(browser, 'Tips Traffic', 'Traffic');
  const tip = alice.locator('#round_tip');
  await expect(alice.locator('#ctl img#green01')).toBeVisible(); // the Traffic Lights deck

  await vote(['green01', 'red0001', 'yellow1']);
  await expect(tip).toHaveText(TALK);
  await expect(tip.locator('b')).toHaveCount(0);

  // one traffic light among numbers is enough
  await vote(['three01', 'eight01', 'red0001']);
  await expect(tip).toHaveText(TALK);

  // control cards (coffee, ?, !) do not make it a talk: lowest and highest as before
  await vote(['three01', 'eight01', 'break01']);
  await expect(tip).toHaveText('Let them explain: Alice (3) and Bob (8)');
  await vote(['qstmrk1', 'xclam01', 'break01']);
  await expect(tip).toHaveText('');

  // no numbers to compare (infinity, veto): talk about them
  await vote(['infin01', 'veto', 'break01']);
  await expect(tip).toHaveText(TALK);
});

test('tip after the reveal: talk about emotions (B-79)', async ({ browser }) => {
  const { alice, vote } = await teamWithDeck(browser, 'Tips Emotions', 'Emoticons');
  await expect(alice.locator('#ctl img#satis01')).toBeVisible(); // the Emotions deck
  await vote(['satis01', 'angry01', 'qstmrk1']);
  await expect(alice.locator('#round_tip')).toHaveText(TALK);
  await vote(['enthu01', 'enthu01', 'enthu01']);
  await expect(alice.locator('#round_tip')).toHaveText(TALK);
});

test('tip after the reveal in anonymous mode: a general line, nobody named (B-79)', async ({ browser }) => {
  const { alice, url, vote } = await teamWithDeck(browser, 'Tips Anonymous', 'Fibonacci');
  const t = new URL(url).searchParams.get('t') ?? '';
  // no card on the table yet: anonymous mode starts right away
  expect((await alice.request.post(`/api/update_team.php?t=${encodeURIComponent(t)}&anonymous_request_toggle=1`)).ok()).toBeTruthy();
  const tip = alice.locator('#round_tip');
  for (const cards of [['three01', 'eight01', 'infin01'], ['five001', 'five001', 'five001'], ['three01', 'green01', 'break01']] as const) {
    await vote([...cards]);
    await expect(tip).toHaveText('Take the chance and talk about what you see.');
    await expect(tip.locator('b')).toHaveCount(0);
  }
});
