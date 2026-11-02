import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { teamWithTwoPlayers, deckCards, pickCard, tableCard, newPlayer, createTeam, joinAsPlayer } from './helpers';

/* B-98 S5: own card sets in the board (script/script_deck.js "Your sets", script/script_custom.js editor): create a
 * set (name, a text card, a symbol card with a value, moved), it is in play for everybody in its order, play and
 * reveal (range from the values), edit, delete (back to Fibonacci); a migrated "Our deck" shows its cards. */

const trayKeys = (page: Page) => deckCards(page).evaluateAll(cards => cards.map(c => c.getAttribute('data-card')));

type Set = { set_id: number; deck_id: string; name: string; rev: number;
  cards: { card_key: string; symbol: string | null; value: string; numeric_value: number | null; color: string }[] };

/** the board state shown last (gLastJson, a script-level let of script.js) */
async function lastJson(page: Page): Promise<{ deck: { id: string; cards: string[]; controls: string[] }; custom_sets: Set[] }> {
  return page.evaluate(() => (0, eval)('gLastJson'));
}

const editor = (page: Page) => page.locator('#cs_editor');

test('create an own set in the editor, play it, edit it and delete it', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Own Sets UI');
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();

  // "Your sets (0 / 5)" above the built-in sets, "+ New set"
  await expect(alice.locator('#deck_own_title')).toHaveText('Your sets 0 / 5');
  await expect(alice.locator('#deck_builtin_title')).toBeVisible();
  await alice.locator('#deck_new_set').click();

  // the editor: full screen, the focus in the name, two cards 1 and 2
  await expect(editor(alice)).toBeVisible();
  await expect(alice.locator('#cs_title')).toHaveText('New set');
  await expect(alice.locator('#cs_name')).toBeFocused();
  await expect(alice.locator('#cs_cards .cs-tile')).toHaveCount(2);
  await expect(alice.locator('#cs_value')).toHaveValue('1');
  await expect(alice.locator('#cs_remove')).toBeDisabled(); // at least two cards

  // Save without a name: the error at the field
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#cs_name_err')).toHaveText('Give the set a name.');
  await expect(alice.locator('#cs_name')).toBeFocused();
  await alice.locator('#cs_name').fill('Risk');

  // card 2 becomes the text "M" with value 5
  await alice.locator('[data-f="tile:1"]').click();
  await alice.locator('#cs_symbols').waitFor();
  await alice.locator('[data-f="mode:text"]').check({ force: true });
  await expect(alice.locator('#cs_text')).toBeFocused();
  await alice.locator('#cs_text').fill('M');
  await alice.locator('#cs_value').fill('5');
  await expect(alice.locator('[data-f="tile:1"] .tv')).toHaveText('M');

  // a third card: the symbol 3 (value 3 from the library), moved to the front
  await alice.locator('#cs_add').click();
  await expect(alice.locator('#cs_cards .cs-tile')).toHaveCount(3);
  await alice.locator('[data-f="cat:numbers"]').click();
  await alice.locator('[data-f="sym:s-3"]').click();
  await expect(alice.locator('#cs_value')).toHaveValue('3');
  await alice.locator('#cs_left').click();
  await alice.locator('#cs_left').click();
  await expect(alice.locator('[data-f="tile:0"]')).toHaveClass(/sel/);

  // Esc with unsaved changes asks first; "Keep editing" goes back
  await alice.keyboard.press('Escape');
  await expect(alice.locator('#cs_ask .cs-dlg')).toBeVisible();
  await alice.locator('[data-f="ask-keep"]').click();
  await expect(alice.locator('#cs_ask')).toBeHidden();
  await expect(editor(alice)).toBeVisible();

  await alice.locator('#cs_save').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#deck_change')).toContainText('Risk');
  await expect(alice.locator('#deck_status')).toHaveText('✓ Set created and in play for everyone');
  await expect(alice.locator('#deck_edit')).toBeFocused();

  // the deck of everybody: the set in its order, then the control cards
  let json = await lastJson(alice);
  const set = json.custom_sets[0];
  expect(set.name).toBe('Risk');
  expect(set.cards.map(c => [c.symbol, c.value, c.numeric_value])).toEqual([['s-3', '3', 3], ['s-1', '1', 1], [null, 'M', 5]]);
  const keys = set.cards.map(c => c.card_key);
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual([...keys, ...json.deck.controls]);
  }
  await expect(bob.locator(`#ctl .ctl[data-card="${keys[2]}"] .tv`)).toHaveText('M');
  // V6: Bob hears who put the set in play (deck.changed_by; the own user id goes with the write)
  await expect(bob.locator('#toast')).toHaveText('Alice changed the card set to Risk');

  // play and reveal: the range from the values (1 and M = 5)
  await alice.locator('#menu_close').click();
  await pickCard(alice, keys[2]);
  await pickCard(bob, keys[1]);
  await expect(tableCard(alice, 'Alice')).toHaveAttribute('data-card', keys[2]);
  await expect(tableCard(alice, 'Alice').locator('.pc .tv')).toHaveText('M');
  await expect(alice.locator('#spread_range')).toHaveText('range 1–M');

  // edit: one card less while cards are down -> "Save and start new round"
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_edit').click();
  await expect(alice.locator('#cs_title')).toHaveText('Edit set');
  await expect(alice.locator('[data-f="tile:0"]')).toBeFocused();
  await expect(alice.locator('#cs_save')).toHaveText('Save');
  await alice.locator('#cs_name').fill('Risk level');
  await expect(alice.locator('#cs_save')).toHaveText('Save'); // the name alone changes no cards
  await alice.locator('[data-f="tile:0"]').click();
  await alice.locator('#cs_remove').click();
  await expect(alice.locator('#cs_save')).toHaveText('Save and start new round');
  await alice.locator('#cs_save').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#deck_status')).toHaveText('✓ Set saved – new round started');
  await expect(alice.locator('#deck_change')).toContainText('Risk level');
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual([keys[1], keys[2], ...json.deck.controls]);
  }
  await expect(tableCard(bob, 'Alice')).toHaveAttribute('data-card', 'prgrss1');

  // the list: the set with its pen; delete it from the editor -> back to Fibonacci
  await alice.locator('#deck_change').click();
  await expect(alice.locator('#deck_own_title')).toHaveText('Your sets 1 / 5');
  const row = alice.locator('#deck_own_sets li');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.dm-prow-b')).toHaveAttribute('aria-current', 'true');
  await row.locator('.cs-edit').click();
  await alice.locator('#cs_delete').click();
  await expect(alice.locator('#cs_ask')).toContainText('the deck goes back to Fibonacci');
  await alice.locator('#cs_delete_ok').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#deck_own_sets li')).toHaveCount(0);
  await expect(alice.locator('#deck_status_live')).toHaveText('Set deleted');
  json = await lastJson(alice);
  for (const page of [alice, bob]) {
    await expect.poll(async () => (await lastJson(page)).deck.id).toBe('fib-classic');
    await expect.poll(() => trayKeys(page)).toContain('three01');
  }
});

test('the limit of sets disables "+ New set"; Cancel without changes closes at once', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'Own Sets Limit');
  const t = new URL(url).searchParams.get('t') as string;
  const card = (symbol: string) => ({ symbol, color: 'blue' });
  for (let i = 1; i <= 5; i++) {
    const res = await alice.request.post(`/api/custom_set_create.php?t=${encodeURIComponent(t)}`, {
      data: JSON.stringify({ name: `Set ${i}`, style: 'plain', cards: [card('s-1'), card('s-2')] }),
      headers: { 'Content-Type': 'application/json' } });
    expect(res.ok()).toBeTruthy();
  }
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();
  await expect(alice.locator('#deck_own_sets li')).toHaveCount(5);
  await expect(alice.locator('#deck_new_set')).toBeDisabled();
  await expect(alice.locator('#deck_new_hint')).toContainText('5 of 5 sets');

  // choosing an own set puts it in play
  await alice.locator('#deck_own_sets .dm-prow-b').filter({ hasText: 'Set 3' }).click();
  await expect(alice.locator('#deck_change')).toContainText('Set 3');
  await expect(bob.locator('#toast')).toHaveText('Alice changed the card set to Set 3');
  // from one own set to another (both group 'custom'): a toast with the set's name as well
  await alice.locator('#deck_change').click();
  await alice.locator('#deck_own_sets .dm-prow-b').filter({ hasText: 'Set 4' }).click();
  await expect(alice.locator('#deck_change')).toContainText('Set 4');
  await expect(bob.locator('#toast')).toHaveText('Alice changed the card set to Set 4');
  await expect(alice.locator('#toast')).not.toHaveClass(/toast-on/);

  // Cancel without changes: no question, the focus back on "Edit set"
  await alice.locator('#deck_edit').click();
  await alice.locator('#cs_cancel').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#deck_edit')).toBeFocused();
});

test('a team with a migrated "Our deck" sees its cards', async ({ browser }) => {
  const page = await newPlayer(browser);
  const url = await createTeam(page, 'Own Sets Migrated');
  await joinAsPlayer(page, url, 'Alice');
  const t = new URL(url).searchParams.get('t') as string;
  expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  // the old deck menu: Fibonacci 1 2 3 + 🙂 + ? (cards.json v1 positions)
  const flags = Array(46).fill('0');
  [2, 3, 4, 18, 43].forEach(i => flags[i] = '1');
  execFileSync('mysql', ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e', '-e',
    `update pok_teams_tbl set cardset_flags='${flags.join('')}', deck_id=null, deck_cards=null, deck_controls=null where id='${t}'`]);
  await page.reload();

  await expect.poll(async () => (await trayKeys(page)).length).toBe(5);
  const json = await lastJson(page);
  const set = json.custom_sets[0];
  expect(set.name).toBe('Our deck');
  expect(await trayKeys(page)).toEqual([...set.cards.map(c => c.card_key), 'qstmrk1']);
  // symbols drawn (no text fallback with the key)
  await expect(page.locator(`#ctl .ctl[data-card="${set.cards[0].card_key}"] svg.mot`)).toHaveCount(1);
  await expect(page.locator(`#ctl .ctl[data-card="${set.cards[3].card_key}"] svg.mot`)).toHaveCount(1);

  await page.locator('#cset_btn').click();
  await expect(page.locator('#deck_change')).toContainText('Our deck');
  await expect(page.locator('#deck_cards .cs-rocard')).toHaveCount(4);
});
