import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, deckCard, deckCards, pickCard, tableCard, setTeamDeck } from './helpers';

/* B-99 (R3, F2/F3): cards are rendered (script/cards.js, symbols from src/cards.svg) instead of images. */

const FIB_WITH_CONTROLS = { deck: 'fib-classic', controls: ['break01', 'qstmrk1'], length: 14 }; // Fibonacci + ☕ ?
const PICTURES = { deck: 'traffic', controls: ['break01'], length: 4 };                          // traffic lights, ☕

function teamParam(url: string): string {
  return encodeURIComponent(new URL(url).searchParams.get('t')!);
}

async function setDeck(page: Page, url: string, deck: { deck: string, controls: string[] }): Promise<void> {
  await setTeamDeck(page, url, deck.deck, null, deck.controls);
}

async function setCard(page: Page, url: string, id: string, key: string): Promise<void> {
  const res = await page.request.post(`/api/setc.php?id=${id}&cardkey=${key}&t=${teamParam(url)}`);
  expect(res.ok()).toBeTruthy();
}

test('table and deck cards are rendered with a symbol and an accessible name', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Rendered Cards');
  const [bob, carol] = await addPlayersViaApi(alice, url, ['Bob', 'Carol']);
  await joinAsPlayer(alice, url, 'Alice');
  await setDeck(alice, url, FIB_WITH_CONTROLS);
  await setCard(alice, url, bob, 'three01');

  // the deck: buttons with the symbol of the sprite, a name, not pressed
  const five = deckCard(alice, 'five001');
  await expect(five).toHaveAttribute('aria-label', '5');
  await expect(five).toHaveAttribute('aria-pressed', 'false');
  await expect(five.locator('svg.mot use')).toHaveAttribute('href', /src\/cards\.svg\?v=\d+#s-5$/);
  await expect(deckCard(alice, 'break01')).toHaveAttribute('aria-label', 'need a break');
  await expect(deckCard(alice, '1pnt501')).toHaveAttribute('aria-label', 'one half');

  // status cards while voting: ready (check) and thinking (thought bubble), each with a name
  await expect(tableCard(alice, 'Bob').locator('.pc')).toHaveAttribute('aria-label', 'card played');
  await expect(tableCard(alice, 'Bob').locator('.pc use')).toHaveAttribute('href', /#s-check$/);
  await expect(tableCard(alice, 'Carol').locator('.pc')).toHaveAttribute('aria-label', 'thinking, no card yet');
  await expect(tableCard(alice, 'Carol').locator('.pc use')).toHaveAttribute('href', /#s-thought$/);

  await pickCard(alice, 'five001');
  await expect(five).toHaveAttribute('aria-pressed', 'true');
  await setCard(alice, url, carol, 'break01');

  // revealed: the value's symbol and name; the control card in a Fibonacci deck shows its symbol only
  await expect(tableCard(alice, 'Alice').locator('.pc[role="img"]')).toHaveAttribute('aria-label', '5');
  await expect(tableCard(alice, 'Bob').locator('.pc use')).toHaveAttribute('href', /#s-3$/);
  const coffee = tableCard(alice, 'Carol').locator('.pc');
  await expect(coffee).toHaveAttribute('aria-label', 'need a break');
  await expect(coffee.locator('use')).toHaveAttribute('href', /#s-coffee$/);
  await expect(coffee.locator('.ttl')).toHaveCount(0);
});

test('a card without a symbol shows its value as text', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Text Value');
  const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
  await joinAsPlayer(alice, url, 'Alice');
  // a key no catalog knows (like a custom card): the board keeps the player and shows the key as text
  await setCard(alice, url, bob, 'c-zz1');
  await pickCard(alice, 'three01');
  const face = tableCard(alice, 'Bob').locator('.pc');
  await expect(face.locator('.tv')).toHaveText('c-zz1');
  await expect(face.locator('svg')).toHaveCount(0);
  await expect(face).toHaveAttribute('aria-label', 'c-zz1');
});

test('picture symbols: headings and descriptions on the table, mini symbols in the spread', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Pictures');
  const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
  await joinAsPlayer(alice, url, 'Alice');
  await setDeck(alice, url, PICTURES);
  await expect(deckCards(alice)).toHaveCount(PICTURES.length);
  // a deck with texts: the deck cards show their headings, control cards too
  await expect(deckCard(alice, 'green01').locator('.dh')).toHaveText('green light');
  await expect(deckCard(alice, 'break01').locator('.dh')).toHaveText('need a break');

  await setCard(alice, url, bob, 'red0001');
  await pickCard(alice, 'green01');
  const red = tableCard(alice, 'Bob').locator('.pc');
  await expect(red).toHaveAttribute('aria-label', 'red light. I see a blocker. Let\'s talk before we go on.');
  await expect(red.locator('.ttl')).toHaveText('red light');
  await expect(red.locator('.txt')).toHaveText('I see a blocker. Let\'s talk before we go on.');
  await expect(red.locator('use')).toHaveAttribute('href', /#s-light-red$/);

  const spreadValue = alice.locator('#spread_bars [data-card="green01"] .spread-value');
  await expect(spreadValue.locator('.mini use')).toHaveAttribute('href', /#s-light-green$/);
  await expect(spreadValue.locator('.mini')).toHaveAttribute('title', 'green light');
  // the range: both ends as mini symbols (B-99 F6, no system emoji)
  const range = alice.locator('#spread_range');
  await expect(range.locator('.mini use')).toHaveCount(2);
  await expect(range.locator('.mini use').first()).toHaveAttribute('href', /#s-light-green$/);
  await expect(range.locator('.mini use').last()).toHaveAttribute('href', /#s-light-red$/);
  await expect(range).toHaveText('green light – red light'); // the names for screen readers
});

test('the info line shows heading and description on hover and keyboard focus; arrows move in the deck', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Info Line');
  await joinAsPlayer(alice, url, 'Alice');
  await setDeck(alice, url, FIB_WITH_CONTROLS);
  await expect(deckCards(alice)).toHaveCount(FIB_WITH_CONTROLS.length);
  const info = alice.locator('#deck_info');

  // Fibonacci: no texts for numbers, the control cards explain themselves
  await deckCard(alice, 'five001').hover();
  await expect(info).toBeHidden();
  await deckCard(alice, 'break01').hover();
  await expect(info).toBeVisible();
  await expect(info).toHaveText('need a break — I need a short break before we go on.');
  await expect(info.locator('.deck-info-value .mini use')).toHaveAttribute('href', /#s-coffee$/); // no emoji (F6)
  await alice.mouse.move(5, 5);
  await expect(info).toBeHidden();

  // keyboard: one tab stop in the deck, the arrows move between its cards
  await deckCard(alice, 'infin01').focus();
  await expect(info).toBeHidden();
  await alice.keyboard.press('ArrowRight');
  await expect(deckCard(alice, 'break01')).toBeFocused();
  await expect(info).toContainText('need a break');
  await alice.keyboard.press('ArrowRight');
  await expect(deckCard(alice, 'qstmrk1')).toBeFocused();
  await expect(info).toContainText('question');
  await expect(deckCards(alice).and(alice.locator('[tabindex="0"]'))).toHaveCount(1);
  // Enter picks the focused card
  await alice.keyboard.press('Enter');
  await expect(deckCard(alice, 'qstmrk1')).toHaveAttribute('aria-pressed', 'true');
});

test('touch: the hint line names the control card in the middle of the carousel', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const url = await createTeam(alice, 'Hint Line');
  await joinAsPlayer(alice, url, 'Alice');
  await setDeck(alice, url, FIB_WITH_CONTROLS);
  await expect(deckCards(alice)).toHaveCount(FIB_WITH_CONTROLS.length);
  const line = alice.locator('#deck_pick');
  await expect(line).toHaveText('tap to pick a card');
  await deckCard(alice, 'break01').evaluate(el => el.parentElement!.scrollIntoView({ inline: 'center' }));
  await expect(line).toHaveText('tap to pick · need a break');
  await expect(line.locator('b .mini use')).toHaveAttribute('href', /#s-coffee$/); // no emoji (F6)
});

test('the card colours follow light and dark mode', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Card Colours');
  await joinAsPlayer(alice, url, 'Alice');
  const face = deckCard(alice, 'five001').locator('.dkc');
  const colours = () => face.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor].join('|'));
  const dark = await colours();
  await alice.locator('#cmode_btn').click();
  await expect(alice.locator('body')).toHaveClass(/light-theme/);
  await expect.poll(colours).not.toBe(dark);
});

/* B-99 (F6): small places show each value per symbol as mono text or as a mini symbol, never as a system emoji */
const EMOJI = /\p{Extended_Pictographic}/u;

test('spread labels: numbers as text, faces, coffee and hand as mini symbols, no emoji', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Small Symbols');
  const [bob] = await addPlayersViaApi(alice, url, ['Bob']);
  await joinAsPlayer(alice, url, 'Alice');

  await setTeamDeck(alice, url, 'emotions', null, ['break01', 'qstmrk1', 'xclam01', 'veto']);
  await expect(deckCards(alice)).toHaveCount(10);
  const value = (key: string) => alice.locator(`#spread_bars [data-card="${key}"] .spread-value`);
  for (const [key, symbol] of [['sad0001', 's-face-sad'], ['break01', 's-coffee'], ['veto', 's-hand']]) {
    await expect(value(key).locator('.mini use')).toHaveAttribute('href', new RegExp(`#${symbol}$`));
    await expect(value(key).locator('.sm-text')).toHaveCount(0);
  }
  await expect(value('qstmrk1').locator('.sm-text')).toHaveText('?');
  await expect(value('xclam01').locator('.sm-text')).toHaveText('!');
  const labels = await alice.locator('#spread_bars .spread-value').allTextContents();
  expect(labels.filter(text => EMOJI.test(text))).toEqual([]);

  // J.U.D.G.E.: the tip names the hand as a mini symbol, "Hear the veto: Bob (✋)" without the emoji
  await setTeamDeck(alice, url, 'judge', null, ['break01', 'veto']);
  await expect(value('jdg3').locator('.sm-text')).toHaveText('3');
  await setCard(alice, url, bob, 'veto');
  await pickCard(alice, 'jdg1');
  await expect(alice.locator('#round_tip b .mini use')).toHaveAttribute('href', /#s-hand$/);
  expect(EMOJI.test(await alice.locator('aside.side').textContent() ?? '')).toBe(false);

  await setTeamDeck(alice, url, 'fib-classic', null, ['break01', 'veto']);
  await expect(value('five001').locator('.sm-text')).toHaveText('5');
  await expect(value('1pnt501').locator('.sm-text')).toHaveText('½');
  await expect(value('infin01').locator('.sm-text')).toHaveText('∞');
  await expect(value('five001').locator('.mini')).toHaveCount(0);
  await expect(value('break01').locator('.mini use')).toHaveAttribute('href', /#s-coffee$/);
});

test('info line: a face as mini symbol, no emoji', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Small Info');
  await joinAsPlayer(alice, url, 'Alice');
  await setTeamDeck(alice, url, 'emotions', null, ['break01']);
  await expect(deckCards(alice)).toHaveCount(7);
  const info = alice.locator('#deck_info');
  await deckCard(alice, 'sad0001').hover();
  await expect(info).toBeVisible();
  await expect(info.locator('.deck-info-value .mini use')).toHaveAttribute('href', /#s-face-sad$/);
  expect(EMOJI.test(await info.textContent() ?? '')).toBe(false);
});
