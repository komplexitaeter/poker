import { test, expect } from '@playwright/test';
import { teamWithTwoPlayers, tableCard, expectTableCard, pickCard } from './helpers';

// Regression guard for B-01: getDao() must return player.mkey as a string in the JSON.
// The frontend reuses a table card only when player.mkey === card.id (the DOM id, always a string,
// see updateCards()/addCards() in script/script.js). If mkey comes back as an int (7 !== "7"),
// every pull removes and recreates all cards, which breaks the glide on re-sort (FLIP only animates
// cards that already existed, B-41) and restarts the fade-in. We mark the existing DOM cards and
// prove they survive a re-render.

test('table cards are reused across a re-render (mkey stays a string)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Reuse Team');

  // both cards must be on the table before we mark them
  await expect(tableCard(alice, 'Alice')).toBeVisible();
  await expect(tableCard(alice, 'Bob')).toBeVisible();

  // mark the live DOM nodes; a reused card keeps the attribute, a recreated one loses it
  const marked = await alice.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#cbox .c'));
    cards.forEach(card => card.setAttribute('data-reuse-mark', '1'));
    return cards.length;
  });
  expect(marked).toBe(2);

  // Bob picks a card -> Alice receives a pull and re-renders her board (updatePlayersCards)
  await pickCard(bob, 'three01');

  // proves the re-render actually ran on Alice's page
  await expectTableCard(alice, 'Bob', 'done001');

  // with the regression both cards would have been removed and recreated, losing the mark
  await expect(alice.locator('#cbox .c[data-reuse-mark="1"]')).toHaveCount(2);
});
