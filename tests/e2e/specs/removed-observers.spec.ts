import { test, expect } from '@playwright/test';
import { teamWithTwoPlayers, tableCard } from './helpers';

/**
 * B-154: a removed player (REMOVED) is an observer for everybody else: while his board is connected he stands in the
 * observer row (no own marking, same "not away" rule as observers, B-110). He himself still sees the overlay "You were
 * removed from the table" and can join again as a player.
 */
test('a removed player shows under the observers for the others and can join again (B-154)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Removed Observer');

  const bobCard = tableCard(alice, 'Bob');
  await expect(bobCard).toBeVisible();
  const observers = alice.locator('#observers .obs');
  await expect(observers).toHaveCount(0);

  // Alice removes Bob from the table
  await bobCard.hover();
  await bobCard.locator('.delete').click();
  await alice.locator('#rm_confirm').getByRole('button', { name: 'Remove' }).click();

  // Alice: Bob's card is gone, Bob stands in the observer row (his tab is open)
  await expect(bobCard).toHaveCount(0);
  await expect(observers).toHaveCount(1);
  await expect(observers.locator('.obs-name')).toHaveText('Bob');
  await expect(observers).not.toHaveClass(/is-me/);

  // Bob: still the overlay of a removed person
  await expect(bob.locator('#removed_msg')).toBeVisible();
  await expect(bob.locator('#removed_msg h1')).toHaveText('You were removed from the table');

  // Bob joins again as a player: back on the table, no longer an observer
  await bob.locator('#become_player_btn').click();
  await expect(bob.locator('#overlay_name_input')).toHaveClass(/hidden/);
  await expect(bobCard).toBeVisible();
  await expect(observers).toHaveCount(0);
  await expect(tableCard(bob, 'Bob')).toBeVisible();
});
