import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, teamWithTwoPlayers, tableCard, expectTableCard, pickCard, deckCard, deckCards, selectedDeckCards } from './helpers';

test('create a team from the start page', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'E2E Team');

  expect(new URL(url).searchParams.get('t')).toBeTruthy();
  await expect(page.locator('#team_name')).toHaveText('E2E Team');
  await expect(page.locator('#overlay_name_input')).toHaveClass(/visible/);
});

test('two players join and see each other', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Join Team');
  await joinAsPlayer(alice, url, 'Alice');
  await expect(tableCard(alice, 'Alice')).toBeVisible();

  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');

  // Alice gets Bob via the poker-msg push, without reloading
  await expect(tableCard(alice, 'Bob')).toBeVisible();
  await expect(tableCard(bob, 'Alice')).toBeVisible();
  await expect(tableCard(bob, 'Bob')).toBeVisible();
});

test('name entry: focused on desktop, on touch phones only after a tap (B-75)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Name Focus');
  await expect(alice.locator('#overlay_name_input')).toHaveClass(/visible/);
  await expect(alice.locator('#nameinput')).toBeFocused();

  // iOS opens the keyboard only for a focus inside a tap: no focus (and no ring) on load
  const bob = await newPlayer(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await bob.goto(url);
  const overlay = bob.locator('#overlay_name_input');
  await expect(overlay).toHaveClass(/visible/);
  await bob.waitForTimeout(500);
  await expect(bob.locator('#nameinput')).not.toBeFocused();
  // a tap anywhere on the overlay (here beside the field) focuses the field
  await overlay.tap({ position: { x: 10, y: 10 } });
  await expect(bob.locator('#nameinput')).toBeFocused();
  await bob.locator('#nameinput').fill('Bob');
  await bob.locator('#become_player_btn').tap();
  await expect(overlay).toHaveClass(/hidden/);
});

test('a picked card is shown as hidden to the other player', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Pick Team');

  await pickCard(alice, 'three01');

  await expectTableCard(bob, 'Alice', 'done001');
  await expectTableCard(bob, 'Bob', 'prgrss1');
  await expectTableCard(alice, 'Alice', 'done001');
});

test('cards are revealed when all players have picked', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reveal Team');

  await pickCard(alice, 'three01');
  await pickCard(bob, 'five001');

  for (const page of [alice, bob]) {
    await expectTableCard(page, 'Alice', 'three01');
    await expectTableCard(page, 'Bob', 'five001');
    await expect(page.locator('#newroundbtn')).toHaveValue('New Round');
  }
});

test('a new round resets all cards', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Round Team');
  await pickCard(alice, 'three01');
  await pickCard(bob, 'five001');
  await expectTableCard(alice, 'Bob', 'five001');

  await alice.locator('#newroundbtn').click();

  for (const page of [alice, bob]) {
    await expectTableCard(page, 'Alice', 'prgrss1');
    await expectTableCard(page, 'Bob', 'prgrss1');
  }
  await expect(deckCard(alice, 'three01')).not.toHaveClass(/selected/);
  await expect(deckCard(bob, 'five001')).not.toHaveClass(/selected/);
});

test('changing the deck of cards applies to all players', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Team');
  // new teams start with the Fibonacci preset
  for (const page of [alice, bob]) {
    await expect(deckCard(page, 'three01')).toHaveCount(1);
    await expect(deckCard(page, 'green01')).toHaveCount(0);
  }

  await alice.locator('#cset_btn').click();
  await alice.locator('#cet_pre').selectOption({ label: 'Traffic Lights' });

  for (const page of [alice, bob]) {
    for (const card of ['green01', 'yellow1', 'red0001']) {
      await expect(deckCard(page, card)).toHaveCount(1);
    }
    await expect(deckCard(page, 'three01')).toHaveCount(0);
    // B-99: the tray holds only the cards of the deck, in deck order (the preset keeps the control
    // cards, new teams start with ☕ and ?, B-98); the spread follows the deck
    const deck = ['green01', 'yellow1', 'red0001', 'break01', 'qstmrk1'];
    await expect.poll(() => deckCards(page).evaluateAll(cards =>
      cards.map(c => c.getAttribute('data-card')))).toEqual(deck);
    await expect.poll(() => page.locator('#spread_bars .spread-col').evaluateAll(cols =>
      cols.map(c => c.getAttribute('data-card')))).toEqual(deck);
  }
});

test('a placed card that is no longer in the deck stays on the table (B-99)', async ({ browser }) => {
  // the average pointer is on, so the reveal also runs the average with a card outside the deck
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Gone Card Team');
  const t = new URL(url).searchParams.get('t')!;
  expect((await alice.request.post(`/api/update_show_avg.php?t=${encodeURIComponent(t)}&show_avg=1`)).ok()).toBeTruthy();
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  const errors: string[] = [];
  for (const page of [alice, bob]) page.on('pageerror', e => errors.push(e.message));

  await pickCard(alice, 'three01');
  await alice.locator('#cset_btn').click();
  await alice.locator('#cet_pre').selectOption({ label: 'Traffic Lights' });

  // today a deck change does not start a new round (that comes with S2): the card stays placed,
  // but the tray no longer holds it; the table shows the status card
  for (const page of [alice, bob]) {
    await expect(deckCard(page, 'green01')).toHaveCount(1);
    await expect(deckCard(page, 'three01')).toHaveCount(0);
    await expectTableCard(page, 'Alice', 'done001');
  }
  await expect(selectedDeckCards(alice)).toHaveCount(0);

  // Bob picks the last card: revealed, Alice's card shows its value, the spread follows the deck
  await pickCard(bob, 'green01');
  for (const page of [alice, bob]) {
    await expectTableCard(page, 'Alice', 'three01');
    await expectTableCard(page, 'Bob', 'green01');
    await expect(page.locator('#round_status')).toHaveText('revealed');
    await expect(page.locator('#spread')).toBeVisible();
    await expect(page.locator('#spread_bars [data-card="green01"] .spread-count')).toHaveText('1');
    await expect(page.locator('#spread_bars [data-card="three01"]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('idle boards stay connected and keep receiving updates (heartbeat)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Idle Team');
  let reconnects = 0;
  bob.on('console', msg => { if (msg.text() === 'initializeWSConnection') reconnects++; });

  // poker-msg pings every 2 s in the tests (POKER_MSG_KEEPALIVE) and closes connections that do not answer
  await bob.waitForTimeout(7_000);
  await pickCard(alice, 'three01');

  await expectTableCard(bob, 'Alice', 'done001');
  expect(reconnects).toBe(0);
});

test('board stays hidden until the first server response, even without the stylesheet', async ({ browser }) => {
  const creator = await newPlayer(browser);
  const url = await createTeam(creator, 'Hidden Team');
  const page = await newPlayer(browser);
  // simulate a stylesheet that is not loaded yet (e.g. reload without cache) and a slow first response
  await page.route('**/style/style.css*', route => route.abort());
  await page.route('**/api/dao.php*', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => getComputedStyle(document.body).opacity)).toBe('0');

  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).opacity)).toBe('1');
});
