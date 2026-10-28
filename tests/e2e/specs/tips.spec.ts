import { test, expect, Page } from '@playwright/test';
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
  await expect(tip).toHaveText('Waiting for Bob and Cleo. The cards are revealed once everyone has voted.');
  expect(await below(alice, '#round_status', '#round_tip')).toBe(true);

  // more than three missing: just the number
  const [dan, eve] = await addPlayersViaApi(alice, url, ['Dan', 'Eve']);
  await alice.reload();
  await expect(tip).toHaveText('Waiting for 4 players. The cards are revealed once everyone has voted.');

  // revealed, different cards: lowest and highest explain (infinity does not count), below the spread
  await setCard(alice, url, bob, 'three01');
  await setCard(alice, url, cleo, 'eight01');
  await setCard(alice, url, dan, 'infin01');
  await setCard(alice, url, eve, 'eight01');
  await alice.reload();
  await expect(alice.locator('#round_status')).toHaveText('revealed');
  await expect(tip).toHaveText('Alice, Bob (3) and Cleo, Eve (8): explain your choice.');
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
