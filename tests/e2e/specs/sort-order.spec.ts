import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, tableCard, pickCard, teamWithTwoPlayers } from './helpers';

/**
 * B-42: The order of the revealed cards is only set in the menu ("Arrange revealed cards by":
 * Card value = SEQUENCE, Player name = NAME). The Name/Value bar below the cards is gone. In
 * anonymous mode the server always arranges by card value, so the select is disabled, shows
 * "Card value" whatever is stored, and a hint is shown. The stored value is kept.
 */
const firstCard = (page: Page) => page.locator('#cbox .c').first();
const cardId = (page: Page, name: string) => tableCard(page, name).getAttribute('id') as Promise<string>;

test('the menu setting arranges revealed cards by player name or by card value, without a bar (B-42)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Sort Team');
  await expect(tableCard(alice, 'Bob')).toBeVisible();
  const aliceId = await cardId(alice, 'Alice');
  const bobId = await cardId(alice, 'Bob');

  await alice.locator('#cset_btn').click();
  const select = alice.locator('#cet_order_by');
  await expect(select).toBeVisible();
  await expect(alice.locator('label[for="cet_order_by"]')).toHaveText('Arrange revealed cards by');
  await expect(select.locator('option')).toHaveText(['Card value', 'Player name']);
  await expect(select).toHaveValue('SEQUENCE');
  await expect(alice.locator('#cet_order_by_hint')).toBeHidden();
  await expect(select).not.toHaveAttribute('aria-describedby');

  await select.selectOption({ label: 'Player name' });
  await expect(select).toHaveValue('NAME');

  // Alice 8, Bob 3: by name Alice comes first
  await pickCard(alice, 'eight01');
  await pickCard(bob, 'three01');
  await expect(alice.locator(`#cbox .c[id="${bobId}"] img.card_image`)).toHaveAttribute('src', 'src/c_three01.png');
  await expect(firstCard(alice)).toHaveAttribute('id', aliceId);
  await expect(firstCard(bob)).toHaveAttribute('id', aliceId);

  // no Name/Value bar after revealing
  await expect(alice.locator('#order_by_div')).toHaveCount(0);

  // switching to "Card value" re-arranges the revealed cards right away, for everyone
  // (picking a card closed the menu, so open it again)
  await expect(select).toBeHidden();
  await alice.locator('#cset_btn').click();
  await select.selectOption({ label: 'Card value' });
  await expect(firstCard(alice)).toHaveAttribute('id', bobId);
  await expect(firstCard(bob)).toHaveAttribute('id', bobId);
  await expect(bob.locator('#cet_order_by')).toHaveValue('SEQUENCE');
});

test('anonymous mode: the select is disabled, shows "Card value", a hint is shown and cards are arranged by card value (B-42)', async ({ browser }) => {
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

  await alice.locator('#cset_btn').click();
  const select = alice.locator('#cet_order_by');
  await expect(select).toBeDisabled();
  await expect(select).toHaveValue('SEQUENCE');
  await expect(select.locator('option:checked')).toHaveText('Card value');
  const hint = alice.locator('#cet_order_by_hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('In anonymous mode, revealed cards are always arranged by card value.');
  await expect(select).toHaveAttribute('aria-describedby', 'cet_order_by_hint');

  // Alice 8, Bob 3: arranged by card value although "Player name" is stored
  await pickCard(alice, 'eight01');
  await pickCard(bob, 'three01');
  await expect(alice.locator(`#cbox .c[id="${bobId}"] img.card_image`)).toHaveAttribute('src', 'src/c_three01.png');
  await expect(firstCard(alice)).toHaveAttribute('id', bobId);
  await expect(alice.locator('#order_by_div')).toHaveCount(0);
});

test('choosing "Hide names" in the menu disables the select at once and keeps the stored "Player name" (B-42)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Anon Toggle');
  await expect(tableCard(alice, 'Bob')).toBeVisible();

  await alice.locator('#cset_btn').click();
  const select = alice.locator('#cet_order_by');
  const hint = alice.locator('#cet_order_by_hint');
  await select.selectOption({ label: 'Player name' });
  await expect(select).toHaveValue('NAME');
  await expect(hint).toBeHidden();

  // a card on the table: anonymous mode itself only starts with the next round
  await pickCard(bob, 'three01');

  await alice.locator('#cet_anonymous').selectOption('1');
  await expect(select).toBeDisabled();
  await expect(select).toHaveValue('SEQUENCE');
  await expect(hint).toBeVisible();
  await expect(select).toHaveAttribute('aria-describedby', 'cet_order_by_hint');

  // switching anonymous mode off again shows the stored value, nothing was overwritten
  await alice.locator('#cet_anonymous').selectOption('0');
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue('NAME');
  await expect(hint).toBeHidden();
  await expect(select).not.toHaveAttribute('aria-describedby');
  await expect(bob.locator('#cet_order_by')).toHaveValue('NAME');
});
