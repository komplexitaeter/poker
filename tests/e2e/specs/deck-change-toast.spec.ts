import { test, expect, Page } from '@playwright/test';
import { teamWithTwoPlayers, deckCard, chooseCardSet } from './helpers';

/* V6 (Andreas): another player switches the card set: the others see a toast with the set's name, the one who
 * switched does not (the deck menu shows it); other cards or a variant of the same set: no toast. */

const toast = (page: Page) => page.locator('#toast');

test('a new card set: a toast for the others, none for the one who switched, none within the set (V6)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Deck Toast');
  await expect(deckCard(bob, 'five001')).toBeVisible();
  await expect(toast(bob)).not.toHaveClass(/toast-on/); // not on the first load

  // Alice switches to J.U.D.G.E.: Bob sees it, Alice does not
  await chooseCardSet(alice, 'J.U.D.G.E.');
  await expect(deckCard(bob, 'jdg3')).toBeVisible();
  await expect(toast(bob)).toHaveClass(/toast-on/);
  await expect(toast(bob)).toHaveText('Card set changed to J.U.D.G.E.');
  await expect(deckCard(alice, 'jdg3')).toBeVisible();
  await expect(toast(alice)).not.toHaveClass(/toast-on/);
  await expect(toast(bob)).not.toHaveClass(/toast-on/, { timeout: 5000 }); // gone again

  // a card off within the same set: the decks follow, no toast
  await alice.locator('#deck_cards [data-card="jdg6"]').click();
  await expect(deckCard(bob, 'jdg6')).toHaveCount(0);
  await bob.waitForTimeout(300);
  await expect(toast(bob)).not.toHaveClass(/toast-on/);
  await expect(toast(alice)).not.toHaveClass(/toast-on/);

  // a reload (as after a reconnect) with the same set: no toast
  await bob.reload();
  await expect(deckCard(bob, 'jdg3')).toBeVisible();
  await bob.waitForTimeout(300);
  await expect(toast(bob)).not.toHaveClass(/toast-on/);
});
