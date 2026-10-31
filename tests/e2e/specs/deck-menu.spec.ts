import { test, expect, Page } from '@playwright/test';
import { teamWithTwoPlayers, deckCard, deckCards, pickCard, expectTableCard, tableCard, chooseCardSet } from './helpers';

/* R3 F5 (B-98): the deck menu (Board settings -> Deck, mock-up variant C). Every change is written at once
 * (api/update_deck.php, api/update_controls.php) and every board follows. */

const trayKeys = (page: Page) => deckCards(page).evaluateAll(cards => cards.map(c => c.getAttribute('data-card')));
const toggle = (page: Page, key: string) => page.locator(`#deck_cards [data-card="${key}"]`);
const control = (page: Page, key: string) => page.locator(`#deck_controls [data-card="${key}"]`);

test('choose a card set: J.U.D.G.E. and Delegation Poker with headings, for everybody', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Sets');
  await alice.locator('#cset_btn').click();
  await expect(alice.locator('#deck_change')).toBeFocused();
  await expect(alice.locator('#deck_change')).toContainText('Fibonacci');

  // the list: every set group with a fan of its cards, the current one marked
  await alice.locator('#deck_change').click();
  const rows = alice.locator('#deck_menu .dm-prow-b');
  await expect(rows).toHaveCount(8);
  await expect(rows.filter({ hasText: 'Fibonacci' })).toHaveAttribute('aria-current', 'true');
  await expect(rows.filter({ hasText: 'J.U.D.G.E.' }).locator('.dm-fan .dkc')).toHaveCount(4);
  await expect(alice.locator('#deck_pick_title')).toBeFocused();
  await rows.filter({ hasText: 'J.U.D.G.E.' }).click();

  // back on the overview; both trays hold the set plus the team's control cards
  await expect(alice.locator('#deck_change')).toContainText('J.U.D.G.E.');
  await expect(alice.locator('#deck_status')).toHaveText(/saved/);
  const judge = ['jdg0', 'jdg1', 'jdg2', 'jdg3', 'jdg4', 'jdg5', 'jdg6', 'break01', 'qstmrk1'];
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual(judge);
    await expect(deckCard(page, 'jdg3').locator('.dh')).toHaveText('severe concerns');
  }
  await pickCard(bob, 'jdg3');
  await pickCard(alice, 'jdg1');
  await expect(tableCard(alice, 'Bob').locator('.pc .ttl')).toHaveText('severe concerns');
  await expect(tableCard(alice, 'Bob').locator('.pc')).toHaveClass(/sty-inverted/);

  // Delegation Poker: a new round starts (cards were down), headings from the catalog
  await chooseCardSet(alice, 'Delegation Poker');
  for (const page of [alice, bob]) {
    await expect(deckCard(page, 'dlg3').locator('.dh')).toHaveText('Consult');
    await expectTableCard(page, 'Bob', 'prgrss1');
  }
});

test('variant and single cards: Short, a card off and on again, at least two cards stay', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Cards');
  await alice.locator('#cset_btn').click();

  // Fibonacci variants; keyboard: an arrow key only moves the choice, Enter saves it (no write, no round per key)
  const variant = (name: string) => alice.locator('#deck_variant').getByRole('radio', { name });
  let deckWrites = 0;
  alice.on('request', request => { if (request.url().includes('/api/update_deck.php')) deckWrites++; });
  await variant('Classic').focus();
  await alice.keyboard.press('ArrowRight');
  await expect(variant('Short')).toBeChecked();
  await expect(variant('Short')).toBeFocused();
  await alice.waitForTimeout(500);
  expect(deckWrites).toBe(0);
  await expect.poll(() => trayKeys(bob)).toContain('hundro1');
  await alice.keyboard.press('Enter');
  await expect.poll(() => trayKeys(bob)).not.toContain('hundro1');
  expect(deckWrites).toBe(1);
  // mouse: back to Classic and to Short again
  await variant('Classic').check();
  await expect.poll(() => trayKeys(bob)).toContain('hundro1');
  await variant('Short').check();
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual(['zero001', 'one0001', 'two0001', 'three01', 'five001', 'eight01',
      'thrtn01', 'twnty01', '4ty0001', 'break01', 'qstmrk1']);
  }

  // a card off: gone from both trays and from the spread
  await expect(toggle(alice, 'five001')).toHaveAttribute('aria-pressed', 'true');
  await toggle(alice, 'five001').click();
  await expect(toggle(alice, 'five001')).toHaveAttribute('aria-pressed', 'false');
  for (const page of [alice, bob]) {
    await expect(deckCard(page, 'five001')).toHaveCount(0);
    await expect(page.locator('#spread_bars [data-card="five001"]')).toHaveCount(0);
  }
  // and on again, in its place
  await toggle(alice, 'five001').click();
  await expect(deckCard(bob, 'five001')).toHaveCount(1);
  await expect.poll(() => trayKeys(bob)).toContain('five001');

  // Traffic lights: two of three off, the last two stay
  await alice.locator('#deck_change').click();
  await alice.locator('#deck_menu .dm-prow-b').filter({ hasText: 'Traffic lights' }).click();
  await expect(toggle(alice, 'red0001')).toBeVisible();
  await toggle(alice, 'red0001').click();
  await expect(deckCard(bob, 'red0001')).toHaveCount(0);
  await toggle(alice, 'yellow1').click();
  await expect(toggle(alice, 'yellow1')).toHaveAttribute('aria-pressed', 'true');
  await expect(alice.locator('#deck_status')).toHaveText(/at least two cards/);
  await expect(deckCard(bob, 'yellow1')).toHaveCount(1);
});

test('control cards per team: switched on and off, they stay when the set changes', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Controls');
  await alice.locator('#cset_btn').click();
  await expect(control(alice, 'break01')).toHaveAttribute('aria-pressed', 'true');
  await expect(control(alice, 'veto')).toHaveAttribute('aria-pressed', 'false');
  await expect(control(alice, 'veto')).toHaveAttribute('aria-label', 'veto');

  await control(alice, 'veto').click();
  await control(alice, 'break01').click();
  for (const page of [alice, bob]) {
    await expect(deckCard(page, 'veto')).toHaveCount(1);
    await expect(deckCard(page, 'break01')).toHaveCount(0);
  }

  await chooseCardSet(alice, 'T-Shirt');
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual(['xxs0001', 'xs00001', 's000001', 'm000001', 'l000001', 'xl00001',
      'xxl0001', 'qstmrk1', 'veto']);
  }
});

test('a new deck while cards are down: the note, then a new round for everybody', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Menu Round');
  await alice.locator('#cset_btn').click();
  await expect(alice.locator('#deck_round_hint')).toHaveCount(0);

  await pickCard(bob, 'five001');
  await expect(alice.locator('#deck_round_hint')).toHaveText(/changing the deck starts a new round/);
  await alice.locator('#deck_change').click();
  await expect(alice.locator('#deck_round_hint')).toBeVisible(); // also in the list of sets

  // a control card does not end the round
  await alice.locator('#deck_menu .dm-back').click();
  await control(alice, 'xclam01').click();
  await expect(deckCard(bob, 'xclam01')).toHaveCount(1);
  await expectTableCard(alice, 'Bob', 'done001');

  // a card of the set does
  await toggle(alice, 'zero001').click();
  await expect(alice.locator('#deck_status')).toHaveText(/new round/);
  for (const page of [alice, bob]) {
    await expectTableCard(page, 'Bob', 'prgrss1');
    await expect(deckCard(page, 'zero001')).toHaveCount(0);
  }
  await expect(bob.locator('#ctl .ctl.selected')).toHaveCount(0);
  await expect(alice.locator('#deck_round_hint')).toHaveCount(0);
});
