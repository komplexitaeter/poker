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
  await expect(alice.locator('#ctl img#three01')).not.toHaveClass(/selected/);
  await expect(bob.locator('#ctl img#five001')).not.toHaveClass(/selected/);
});

test('changing the deck of cards applies to all players', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Team');
  // new teams start with the Fibonacci preset
  for (const page of [alice, bob]) {
    await expect(page.locator('#ctl img#three01')).toHaveClass(/\bon\b/);
    await expect(page.locator('#ctl img#green01')).toHaveClass(/\boff\b/);
  }

  await alice.locator('#cset_btn').click();
  await alice.locator('#cet_pre').selectOption({ label: 'Traffic Lights' });

  for (const page of [alice, bob]) {
    for (const card of ['green01', 'yellow1', 'red0001']) {
      await expect(page.locator(`#ctl img#${card}`)).toHaveClass(/\bon\b/);
    }
    await expect(page.locator('#ctl img#three01')).toHaveClass(/\boff\b/);
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
