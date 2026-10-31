import { test, expect } from '@playwright/test';
import {
  newPlayer, createTeam, joinAsPlayer, teamWithTwoPlayers, tableCard, expectTableCard, pickCard,
} from './helpers';

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
  await expect(alice.locator('#ctl .ctl[data-card="three01"]')).not.toHaveClass(/selected/);
  await expect(bob.locator('#ctl .ctl[data-card="five001"]')).not.toHaveClass(/selected/);
});

test('changing the deck of cards applies to all players', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Team');
  // new teams start with the Fibonacci preset
  for (const page of [alice, bob]) {
    await expect(page.locator('#ctl .ctl[data-card="three01"]')).toHaveCount(1);
    await expect(page.locator('#ctl .ctl[data-card="green01"]')).toHaveCount(0);
  }

  await alice.locator('#cset_btn').click();
  await alice.locator('#cet_pre').selectOption({ label: 'Traffic Lights' });

  for (const page of [alice, bob]) {
    for (const card of ['green01', 'yellow1', 'red0001']) {
      await expect(page.locator(`#ctl .ctl[data-card="${card}"]`)).toHaveCount(1);
    }
    await expect(page.locator('#ctl .ctl[data-card="three01"]')).toHaveCount(0);
    // B-99: the tray holds only the cards of the deck, in deck order (the preset keeps the control
    // cards); the spread follows the deck
    const deck = ['green01', 'yellow1', 'red0001', 'break01', 'qstmrk1', 'xclam01'];
    await expect.poll(() => page.locator('#ctl .ctl').evaluateAll(cards =>
      cards.map(c => c.getAttribute('data-card')))).toEqual(deck);
    await expect.poll(() => page.locator('#spread_bars .spread-col').evaluateAll(cols =>
      cols.map(c => c.getAttribute('data-card')))).toEqual(deck);
  }
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
