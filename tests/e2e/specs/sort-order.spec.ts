import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, tableCard, pickCard, teamWithTwoPlayers } from './helpers';

/**
 * B-42: The order of the revealed cards is only set in the menu ("Arrange revealed cards by":
 * Card value = SEQUENCE, Player name = NAME). The Name/Value bar below the cards is gone. In
 * anonymous mode the server always arranges by card value, so the choice is disabled, shows
 * "Card value" whatever is stored, and a hint is shown. The stored value is kept.
 * B-51: the choice is a radio group (fieldset #cet_order_by) in the tab "Results" of the board
 * settings panel. B-74: picking a card (a click outside the panel) closes it.
 */
const firstCard = (page: Page) => page.locator('#cbox .c').first();
const cardId = (page: Page, name: string) => tableCard(page, name).getAttribute('id') as Promise<string>;

const orderRadio = (page: Page, value: 'SEQUENCE' | 'NAME') =>
  page.locator(`input[name=cet_order_by][value=${value}]`);

/** Opens "Board settings" and its tab "Results". */
async function openResults(page: Page) {
  await page.locator('#cset_btn').click();
  await page.locator('#cset_box').getByRole('tab', { name: 'Results' }).click();
  await expect(page.locator('#cet_order_by')).toBeVisible();
}

test('the menu setting arranges revealed cards by player name or by card value, without a bar (B-42)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Sort Team');
  await expect(tableCard(alice, 'Bob')).toBeVisible();
  const aliceId = await cardId(alice, 'Alice');
  const bobId = await cardId(alice, 'Bob');

  await openResults(alice);
  const group = alice.locator('#cet_order_by');
  await expect(group.locator('legend')).toHaveText('Arrange revealed cards by');
  await expect(group.locator('label')).toHaveText(['Card value', 'Player name']);
  await expect(orderRadio(alice, 'SEQUENCE')).toBeChecked();
  await expect(alice.locator('#cet_order_by_hint')).toBeHidden();
  await expect(group).not.toHaveAttribute('aria-describedby');

  await orderRadio(alice, 'NAME').check();
  await expect(orderRadio(alice, 'NAME')).toBeChecked();

  // Alice 8, Bob 3: by name Alice comes first
  await pickCard(alice, 'eight01');
  await pickCard(bob, 'three01');
  await expect(alice.locator(`#cbox .c[id="${bobId}"] img.card_image`)).toHaveAttribute('src', 'src/c_three01.png');
  await expect(firstCard(alice)).toHaveAttribute('id', aliceId);
  await expect(firstCard(bob)).toHaveAttribute('id', aliceId);

  // no Name/Value bar after revealing
  await expect(alice.locator('#order_by_div')).toHaveCount(0);

  // switching to "Card value" re-arranges the revealed cards right away, for everyone
  // (B-74: picking a card closed the panel)
  await openResults(alice);
  await orderRadio(alice, 'SEQUENCE').check();
  await expect(firstCard(alice)).toHaveAttribute('id', bobId);
  await expect(firstCard(bob)).toHaveAttribute('id', bobId);
  await expect(orderRadio(bob, 'SEQUENCE')).toBeChecked();
});

test('anonymous mode: the choice is disabled, shows "Card value", a hint is shown and cards are arranged by card value (B-42)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Anon Sort');
  const t = encodeURIComponent(new URL(url).searchParams.get('t')!);
  // the team keeps its stored "Player name" setting while anonymous mode is on
  expect((await alice.request.post(`/api/update_results_order.php?t=${t}&results_order=NAME`)).ok()).toBeTruthy();
  expect((await alice.request.post(`/api/update_team.php?t=${t}&anonymous_request_toggle=1`)).ok()).toBeTruthy();
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser);
  await joinAsPlayer(bob, url, 'Bob');
  await expect(tableCard(alice, 'Bob')).toBeVisible();
  const bobId = await cardId(alice, 'Bob');

  await openResults(alice);
  const group = alice.locator('#cet_order_by');
  await expect(orderRadio(alice, 'SEQUENCE')).toBeDisabled();
  await expect(orderRadio(alice, 'NAME')).toBeDisabled();
  await expect(orderRadio(alice, 'SEQUENCE')).toBeChecked();
  await expect(group.locator('input:checked + span')).toHaveText('Card value');
  const hint = alice.locator('#cet_order_by_hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('In anonymous mode, revealed cards are always arranged by card value.');
  await expect(group).toHaveAttribute('aria-describedby', 'cet_order_by_hint');

  // Alice 8, Bob 3: arranged by card value although "Player name" is stored
  await pickCard(alice, 'eight01');
  await pickCard(bob, 'three01');
  await expect(alice.locator(`#cbox .c[id="${bobId}"] img.card_image`)).toHaveAttribute('src', 'src/c_three01.png');
  await expect(firstCard(alice)).toHaveAttribute('id', bobId);
  await expect(alice.locator('#order_by_div')).toHaveCount(0);
});

test('choosing "Anonymous" in the menu disables the choice at once and keeps the stored "Player name" (B-42)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Anon Toggle');
  await expect(tableCard(alice, 'Bob')).toBeVisible();

  await openResults(alice);
  const group = alice.locator('#cet_order_by');
  const hint = alice.locator('#cet_order_by_hint');
  await orderRadio(alice, 'NAME').check();
  await expect(orderRadio(alice, 'NAME')).toBeChecked();
  await expect(hint).toBeHidden();

  // a card on the table: anonymous mode itself only starts with the next round
  await pickCard(bob, 'three01');

  await alice.locator('input[name=cet_anonymous][value="1"]').check();
  await expect(alice.locator('input[name=cet_anonymous][value="1"]')).toBeChecked();
  await expect(orderRadio(alice, 'SEQUENCE')).toBeDisabled();
  await expect(orderRadio(alice, 'NAME')).toBeDisabled();
  await expect(orderRadio(alice, 'SEQUENCE')).toBeChecked();
  await expect(hint).toBeVisible();
  await expect(group).toHaveAttribute('aria-describedby', 'cet_order_by_hint');

  // switching anonymous mode off again shows the stored value, nothing was overwritten
  await alice.locator('input[name=cet_anonymous][value="0"]').check();
  await expect(orderRadio(alice, 'NAME')).toBeEnabled();
  await expect(orderRadio(alice, 'NAME')).toBeChecked();
  await expect(hint).toBeHidden();
  await expect(group).not.toHaveAttribute('aria-describedby');
  await expect(orderRadio(bob, 'NAME')).toBeChecked();
});
