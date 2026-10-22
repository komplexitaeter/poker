import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, tableCard, expectTableCard, pickCard } from './helpers';

// Regression guard for B-33: renaming an active player must not overwrite the card they already placed.
// A solo player who has placed a card makes all_players_ready = 1. The rename UPDATE in api/name.php
// used to set card_key = 'break01' whenever all_players_ready = 1, so the player suddenly got the
// coffee cup. After the fix the coffee cup is only assigned when the player has no card yet
// (card_key is null), so a placed card survives the rename.

test('renaming an active player keeps the card already placed (no coffee cup)', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Rename Keeps Card');
  await joinAsPlayer(page, url, 'Alice');

  // Solo player places a card -> all_players_ready = 1, the own card is revealed as its real value.
  await pickCard(page, 'three01');
  await expectTableCard(page, 'Alice', 'three01');

  // Rename via the user settings dialog.
  await page.locator('#user_settings_btn').click();
  await page.locator('#cet_usr_name').fill('Alicia');
  await page.locator('#cet_change_user').click();

  // The table card now carries the new name and must still show the placed card, not 'break01'.
  await expect(tableCard(page, 'Alicia')).toBeVisible();
  await expectTableCard(page, 'Alicia', 'three01');
});
