import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, tableCard, expectTableCard } from './helpers';

// B-85: 4-byte UTF-8 characters (emojis) in free text. With utf8mb3 columns or an utf8mb3 connection
// api/update_topic.php failed with HTTP 500 and the topic was lost. Names, topics and the round history
// (newround.php copies topic and player names) must store and show them unchanged.

const TOPIC = 'Story 🚀 login 👍🏽 done ✅';
const TEAM_NAME = 'Rocket 🚀 Team';
const PLAYER_NAME = 'Ana 🦄';

/** Fails the test on any HTTP 5xx answer of the API. */
function failOnServerError(page: Page): void {
  page.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      throw new Error(`HTTP ${response.status()} from ${response.url()}`);
    }
  });
}

test('topic with emojis is saved and shown to all players', async ({ browser }) => {
  const alice = await newPlayer(browser);
  failOnServerError(alice);
  const url = await createTeam(alice, 'Emoji Topic Team');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');

  await alice.locator('#topic_btn').click();
  await alice.locator('#topic_txt').pressSequentially(TOPIC);
  const saved = alice.waitForResponse(r => r.url().includes('/api/update_topic.php'));
  await alice.locator('#topic_save').click();
  expect((await saved).status()).toBe(200);

  for (const page of [alice, bob]) {
    await expect(page.locator('#topic')).toHaveText(TOPIC);
  }
  // still there after a reload, i.e. stored in the database and not only shown locally
  await bob.reload();
  await expect(bob.locator('#topic')).toHaveText(TOPIC);
});

test('team name with emojis is saved and shown', async ({ browser }) => {
  const page = await newPlayer(browser);
  failOnServerError(page);
  const url = await createTeam(page, TEAM_NAME);
  await joinAsPlayer(page, url, 'Alice');

  await expect(page.locator('#team_name')).toHaveText(TEAM_NAME);
  await page.reload();
  await expect(page.locator('#team_name')).toHaveText(TEAM_NAME);
});

test('player name with emojis is saved and shown to all players', async ({ browser }) => {
  const alice = await newPlayer(browser);
  failOnServerError(alice);
  const url = await createTeam(alice, 'Emoji Name Team');
  await joinAsPlayer(alice, url, PLAYER_NAME);
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');

  for (const page of [alice, bob]) {
    await expect(tableCard(page, PLAYER_NAME)).toBeVisible();
  }
});

test('a new round with emojis in topic and player name is recorded', async ({ browser }) => {
  const alice = await newPlayer(browser);
  failOnServerError(alice);
  const url = await createTeam(alice, 'Emoji Round Team');
  await joinAsPlayer(alice, url, PLAYER_NAME);
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');

  await alice.locator('#topic_btn').click();
  await alice.locator('#topic_txt').pressSequentially(TOPIC);
  await alice.locator('#topic_save').click();
  await expect(bob.locator('#topic')).toHaveText(TOPIC);

  await pickCard(alice, 'three01');
  await pickCard(bob, 'five001');
  await expectTableCard(alice, 'Bob', 'five001');

  // newround.php copies the topic into pok_roundstats_tbl and the names into pok_roundstat_details_tbl
  const newRound = alice.waitForResponse(r => r.url().includes('/api/newround.php'));
  await alice.locator('#newroundbtn').click();
  expect((await newRound).status()).toBe(200);

  for (const page of [alice, bob]) {
    await expectTableCard(page, PLAYER_NAME, 'prgrss1');
    await expectTableCard(page, 'Bob', 'prgrss1');
  }
});
