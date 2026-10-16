import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, tableCard } from './helpers';

// Names and topics are stored as entered and only escaped on output (B-03):
// special characters must show up unchanged and must never be interpreted as HTML.

test('team name with special characters is shown as entered', async ({ browser }) => {
  const page = await newPlayer(browser);
  const teamName = `Bob's "A" & <b>B</b> #1 < 2`;
  await createTeam(page, teamName);

  await expect(page.locator('#team_name')).toHaveText(teamName);
  await expect(page.locator('#team_name b')).toHaveCount(0);
  await expect(page).toHaveTitle(new RegExp(`Agile Estimations: ${escapeRegExp(teamName)}$`));
});

test('renamed team keeps special characters', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Rename Team');
  await joinAsPlayer(page, url, 'Alice');
  const newName = `It's "C" & <i>D</i> #2`;

  await page.locator('#cset_btn').click();
  await page.locator('#cet_team_name').fill(newName);
  await page.locator('#cet_change_name').click();

  await expect(page.locator('#team_name')).toHaveText(newName);
  await expect(page.locator('#team_name i')).toHaveCount(0);
});

test('player name with special characters is shown as entered', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Name Team');
  const playerName = `O'N "x" <&> #1`; // 14 characters, the name field allows 15
  await joinAsPlayer(alice, url, playerName);

  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');

  for (const page of [alice, bob]) {
    await expect(tableCard(page, escapeRegExp(playerName))).toBeVisible();
  }
});

test('topic from the entry link is shown as entered', async ({ browser }) => {
  const page = await newPlayer(browser);
  const topic = `It's "quoted" & <b>not bold</b> #1`;
  await page.goto(`/?tool=e2e&team=${encodeURIComponent('Link Team')}&text=${encodeURIComponent(topic)}`);
  await page.waitForURL(/\?t=/);

  await expect(page.locator('#topic')).toHaveText(topic);
  await expect(page.locator('#topic b')).toHaveCount(0);
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('player name with umlauts up to the length limit can join', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Umlaut Team');
  const playerName = 'Jörg Müller-Ätz'; // 15 characters (the field limit), more than 15 bytes
  await joinAsPlayer(page, url, playerName);

  await expect(tableCard(page, playerName)).toBeVisible();
});

test('topic saved in the topic box keeps special characters', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Topic Team');
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  const topic = `A & B + 100% "<b>not bold</b>"`;

  await alice.locator('#topic_btn').click();
  // typing (not fill) triggers the keydown handler that enables the save button
  await alice.locator('#topic_txt').pressSequentially(topic);
  await alice.locator('#topic_save').click();

  for (const page of [alice, bob]) {
    await expect(page.locator('#topic')).toHaveText(topic);
    await expect(page.locator('#topic b')).toHaveCount(0);
  }
});
