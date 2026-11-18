import { test, expect } from '@playwright/test';
import { teamWithTwoPlayers } from './helpers';

/**
 * The note in the topics menu (Fund Tessa, 2026-11-17): after "Save" the menu shows the saved text at once, and while
 * the menu is open the field follows a new board state, unless the user typed since opening.
 */

test('note: saved, opened again at once, the field shows the new text (before the board reload)', async ({ browser }) => {
  const { alice } = await teamWithTwoPlayers(browser, 'Note Saved');
  await alice.locator('#topic_btn').click();
  await alice.locator('#topic_txt').fill('first note');
  // the board reload after the save comes late: the field must not wait for it
  await alice.route('**/api/dao.php*', async route => { await new Promise(r => setTimeout(r, 3000)); await route.continue(); });
  await alice.locator('#topic_save').click();
  await expect(alice.locator('dialog#menu')).not.toHaveAttribute('open');
  await alice.locator('#topic_btn').click();
  await expect(alice.locator('#topic_txt')).toHaveValue('first note', { timeout: 1000 });
  await expect(alice.locator('#topic_save')).toBeDisabled();
  await alice.unroute('**/api/dao.php*');
  await expect(alice.locator('#board_note_text')).toHaveText('first note');
  await expect(alice.locator('#topic_txt')).toHaveValue('first note');
});

test('note: the open menu follows a note of another player, unless the user typed', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Note Follows');
  await alice.locator('#topic_btn').click();
  await expect(alice.locator('#topic_txt')).toHaveValue('');

  // untouched: the field follows
  await bob.locator('#topic_btn').click();
  await bob.locator('#topic_txt').fill('from Bob');
  await bob.locator('#topic_save').click();
  await expect(alice.locator('#topic_txt')).toHaveValue('from Bob');
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#topic_save')).toBeDisabled();

  // typed: the typed text stays
  await alice.locator('#topic_txt').fill('mine');
  await bob.locator('#topic_btn').click();
  await bob.locator('#topic_txt').fill('from Bob again');
  await bob.locator('#topic_save').click();
  await expect(alice.locator('#board_note_text')).toHaveText('from Bob again');
  await expect(alice.locator('#topic_txt')).toHaveValue('mine');
  await expect(alice.locator('#topic_save')).toBeEnabled();
});
