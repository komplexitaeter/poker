import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { teamWithTwoPlayers, deckCards, pickCard, tableCard, newPlayer, createTeam, joinAsPlayer } from './helpers';

/* B-98 S5: own card sets in the board (script/script_deck.js "Your sets", script/script_custom.js editor): create a
 * set (name, style, a text card with heading and description, a symbol card from the picker, moved with ↑), "Save &
 * play" puts it in play for everybody in its order and style, play and reveal (range from the values), edit, delete
 * (back to Fibonacci); Save alone does not play; a migrated "Our deck" shows its cards. */

const trayKeys = (page: Page) => deckCards(page).evaluateAll(cards => cards.map(c => c.getAttribute('data-card')));

type Set = { set_id: number; deck_id: string; name: string; style: string; rev: number;
  cards: { card_key: string; symbol: string | null; value: string; numeric_value: number | null; color: string;
    heading: string | null }[] };

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

  // first the choice (B-98 copy): from scratch
  await expect(alice.locator('#cs_title')).toHaveText('New card set');
  await expect(alice.locator('#cs_scratch')).toBeFocused();
  await alice.locator('#cs_scratch').click();

  // the editor: full screen, the focus in the name, two cards 1 and 2
  await expect(editor(alice)).toBeVisible();
  await expect(alice.locator('#cs_title')).toHaveText('New card set');
  await expect(alice.locator('#cs_name')).toBeFocused();
  await expect(alice.locator('#cs_list [data-f^="card:"]')).toHaveCount(2);
  await expect(alice.locator('#cs_cards_label')).toHaveText('Cards (2 of 20)');
  await expect(alice.locator('#cs_value')).toHaveValue('1');
  await expect(alice.locator('#cs_remove')).toBeDisabled(); // at least two cards

  // Save without a name: the error at the field
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#cs_name_err')).toHaveText('Give the set a name.');
  await expect(alice.locator('#cs_name')).toBeFocused();
  await alice.locator('#cs_name').fill('Risk');
  // the style of the set: every card follows it
  await alice.locator('[data-f="style:badge"]').check({ force: true });
  await expect(alice.locator('[data-f="card:0"] .pc')).toHaveClass(/sty-badge/);

  // card 2 becomes the text "M" (picker: "Text") with a heading, a description and the value 5
  await alice.locator('[data-f="card:1"]').click();
  await alice.locator('#cs_sym').click();
  await expect(alice.locator('#cs_sym_search')).toBeFocused();
  await alice.locator('#cs_opt_text').click();
  await expect(alice.locator('#cs_pick')).toHaveCount(0);
  await expect(alice.locator('#cs_text')).toBeFocused();
  await alice.locator('#cs_text').fill('M');
  await alice.locator('#cs_heading').fill('medium');
  await alice.locator('#cs_desc').fill('Some risk, we can handle it.');
  await alice.locator('#cs_value').fill('5');
  await expect(alice.locator('[data-f="card:1"] .tv')).toHaveText('M');
  await expect(alice.locator('[data-f="card:1"] .ttl')).toHaveText('medium');

  // a third card; the picker: search, Esc closes only the picker, Enter picks
  await alice.locator('#cs_add').click();
  await expect(alice.locator('#cs_list [data-f^="card:"]')).toHaveCount(3);
  await alice.locator('#cs_sym').click();
  await alice.locator('#cs_sym_search').fill('sat');
  await expect(alice.locator('#cs_sym_list [role="option"]')).toHaveText(['satisfied']);
  await alice.keyboard.press('Escape');
  await expect(alice.locator('#cs_pick')).toHaveCount(0);
  await expect(editor(alice)).toBeVisible();
  await expect(alice.locator('#cs_sym')).toBeFocused();
  await alice.locator('#cs_sym').click();
  await alice.locator('#cs_sym_search').fill('3');
  await alice.keyboard.press('Enter'); // the first match: the number 3
  await expect(alice.locator('#cs_value')).toHaveValue('3');
  await expect(alice.locator('#cs_sym')).toBeFocused();
  await expect(alice.locator('#cs_sym')).toContainText('3');
  // moved to the front with ↑
  await alice.locator('#cs_up').click();
  await alice.locator('#cs_up').click();
  await expect(alice.locator('[data-f="card:0"]')).toHaveAttribute('aria-current', 'true');
  await expect(alice.locator('#cs_up')).toBeDisabled();

  // Esc with unsaved changes asks first; "Keep editing" goes back
  await alice.keyboard.press('Escape');
  await expect(alice.locator('#cs_ask .cs-dlg')).toBeVisible();
  await alice.locator('[data-f="ask-keep"]').click();
  await expect(alice.locator('#cs_ask')).toBeHidden();
  await expect(editor(alice)).toBeVisible();

  // "Save & play": saved and in play for everybody
  await alice.locator('#cs_play').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#deck_change')).toContainText('Risk');
  // the result as a toast (Andreas: messages of the deck menu as toasts)
  await expect(alice.locator('#toast')).toHaveText('Set saved and in play');
  await expect(alice.locator('#deck_edit')).toBeFocused();

  // the deck of everybody: the set in its order and style, then the control cards
  let json = await lastJson(alice);
  const set = json.custom_sets[0];
  expect(set.name).toBe('Risk');
  expect(set.style).toBe('badge');
  expect(set.cards.map(c => [c.symbol, c.value, c.numeric_value, c.heading])).toEqual(
    [['s-3', '3', 3, null], ['s-1', '1', 1, null], [null, 'M', 5, 'medium']]);
  const keys = set.cards.map(c => c.card_key);
  for (const page of [alice, bob]) {
    await expect.poll(() => trayKeys(page)).toEqual([...keys, ...json.deck.controls]);
  }
  await expect(bob.locator(`#ctl .ctl[data-card="${keys[2]}"] .tv`)).toHaveText('M');
  await expect(bob.locator(`#ctl .ctl[data-card="${keys[2]}"] .sty-badge`)).toHaveCount(1);
  // V6: Bob hears who put the set in play (deck.changed_by; the own user id goes with the write)
  await expect(bob.locator('#toast')).toHaveText('Alice changed the card set to Risk');

  // play and reveal: the range from the values (1 and M = 5)
  await alice.locator('#menu_close').click();
  await pickCard(alice, keys[2]);
  await pickCard(bob, keys[1]);
  await expect(tableCard(alice, 'Alice')).toHaveAttribute('data-card', keys[2]);
  await expect(tableCard(alice, 'Alice').locator('.pc .tv')).toHaveText('M');
  await expect(alice.locator('#spread_range')).toHaveText('range 1–M');

  // edit: one card less while cards are down -> the hint "Save starts a new round"
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_edit').click();
  await expect(alice.locator('#cs_title')).toHaveText('Edit card set');
  await expect(alice.locator('[data-f="card:0"]')).toBeFocused();
  await expect(alice.locator('#cs_play')).toHaveCount(0); // in play already
  await expect(alice.locator('#cs_round')).toHaveCount(0);
  await alice.locator('#cs_name').fill('Risk level');
  await expect(alice.locator('#cs_round')).toHaveCount(0); // the name alone changes no cards
  await alice.locator('#cs_remove').click();
  await expect(alice.locator('#cs_round')).toHaveText('Cards are down – Save starts a new round.');
  await alice.locator('#cs_save').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#toast')).toHaveText('Set saved – new round started');
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
  await expect(alice.locator('#toast')).toHaveText('Set deleted');
  json = await lastJson(alice);
  for (const page of [alice, bob]) {
    await expect.poll(async () => (await lastJson(page)).deck.id).toBe('fib-classic');
    await expect.poll(() => trayKeys(page)).toContain('three01');
  }
});

test('Save creates a set without playing it; "Save & play" of a saved set puts it in play', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Own Sets Play');
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();
  await alice.locator('#deck_new_set').click();
  await alice.locator('#cs_scratch').click();
  await alice.locator('#cs_name').fill('Later');
  await alice.locator('#cs_save').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#toast')).toHaveText('Set created');
  expect((await lastJson(alice)).deck.id).toBe('fib-classic');
  // the focus on the pen of the new set in the list
  const pen = alice.locator('#deck_own_sets .cs-edit');
  await expect(pen).toBeFocused();

  await pen.click();
  await expect(alice.locator('#cs_play')).toBeVisible();
  await alice.locator('#cs_play').click(); // no changes: only put in play
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#toast')).toHaveText('Set saved and in play');
  await expect(alice.locator('#deck_change')).toContainText('Later');
  await expect(bob.locator('#toast')).toHaveText('Alice changed the card set to Later');
  await expect.poll(async () => (await lastJson(bob)).deck.id).toBe((await lastJson(alice)).custom_sets[0].deck_id);
});

test('"+ New set" from a built-in set: the choice, Esc cancels, Fibonacci fills the editor', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Own Sets Copy');
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();

  // the choice in the overlay: from scratch or a built-in set (a row per group); Esc cancels, nothing is stored
  await alice.locator('#deck_new_set').click();
  await expect(editor(alice)).toBeVisible();
  await expect(alice.locator('#cs_from [data-group]')).toHaveCount(8);
  await expect(alice.locator('#cs_from [data-group="fib"]')).toContainText('Fibonacci');
  await expect(alice.locator('#cs_save')).toHaveCount(0);
  await alice.keyboard.press('Escape');
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#deck_new_set')).toBeFocused();
  // × as well
  await alice.locator('#deck_new_set').click();
  await alice.locator('#cs_x').click();
  await expect(editor(alice)).toBeHidden();

  // Fibonacci: all 17 cards of the group (every variant, catalog order), its style, the name empty
  await alice.locator('#deck_new_set').click();
  await alice.locator('#cs_from [data-group="fib"]').click();
  await expect(alice.locator('#cs_title')).toHaveText('New card set');
  await expect(alice.locator('#cs_name')).toHaveValue('');
  await expect(alice.locator('#cs_name')).toBeFocused();
  await expect(alice.locator('#cs_list [data-f^="card:"]')).toHaveCount(17);
  await expect(alice.locator('#cs_cards_label')).toHaveText('Cards (17 of 20)');
  await expect(alice.locator('[data-f="style:plain"]')).toBeChecked();
  await expect(alice.locator('#cs_value')).toHaveValue('0');
  await alice.locator('[data-f="card:16"]').click();
  await expect(alice.locator('#cs_sym')).toContainText('∞');
  await expect(alice.locator('#cs_value')).toHaveValue('');

  // the name is required
  await alice.locator('#cs_play').click();
  await expect(alice.locator('#cs_name_err')).toHaveText('Give the set a name.');
  await expect(alice.locator('#cs_name')).toBeFocused();
  await alice.locator('#cs_name').fill('Our Fibonacci');
  await alice.locator('#cs_play').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#toast')).toHaveText('Set saved and in play');

  const json = await lastJson(alice);
  const set = json.custom_sets[0];
  expect(set.name).toBe('Our Fibonacci');
  expect(set.cards.map(c => c.value)).toEqual(
    ['0', '½', '1', '2', '3', '5', '8', '13', '20', '21', '34', '40', '55', '60', '89', '100', '∞']);
  expect(set.cards[16].symbol).toBe('s-inf');
  expect(set.cards[16].numeric_value).toBeNull();
  for (const page of [alice, bob]) {
    await expect.poll(async () => (await trayKeys(page)).length).toBe(17 + json.deck.controls.length);
  }
  await expect(bob.locator(`#ctl .ctl[data-card="${set.cards[16].card_key}"] svg.mot`)).toHaveCount(1);
});

test('an emoji as card text: counted as one character, played and shown on the table', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Own Sets Emoji');
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();
  await alice.locator('#deck_new_set').click();
  await alice.locator('#cs_scratch').click();
  await alice.locator('#cs_name').fill('Party');

  // card 1 becomes the text 🎉 (one character of 6, the hint without "no emoji")
  await alice.locator('#cs_sym').click();
  await alice.locator('#cs_opt_text').click();
  await expect(alice.locator('#cs_text_help')).toContainText('letters, digits, signs or emoji');
  await alice.locator('#cs_text').fill('🎉🎉🎉🎉🎉🎉🎉');
  await expect(alice.locator('#cs_text_count')).toHaveText('7/6');
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#cs_text_err')).toHaveText('Up to 6 characters.');
  await expect(alice.locator('#cs_text')).toBeFocused();
  await alice.locator('#cs_text').fill('a\u202Eb');
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#cs_text_err')).toHaveText('Use visible characters only.');
  await alice.locator('#cs_text').fill('🎉');
  await expect(alice.locator('#cs_text_count')).toHaveText('1/6');
  await expect(alice.locator('#cs_text_err')).toHaveCount(0);
  await expect(alice.locator('[data-f="card:0"] .tv')).toHaveText('🎉');
  await alice.locator('#cs_play').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#toast')).toHaveText('Set saved and in play');

  const set = (await lastJson(alice)).custom_sets[0];
  expect(set.cards.map(c => [c.symbol, c.value])).toEqual([[null, '🎉'], ['s-2', '2']]);
  const key = set.cards[0].card_key;
  await expect(bob.locator(`#ctl .ctl[data-card="${key}"] .tv`)).toHaveText('🎉');
  await alice.locator('#menu_close').click();
  await pickCard(alice, key);
  await pickCard(bob, set.cards[1].card_key);
  await expect(tableCard(alice, 'Alice')).toHaveAttribute('data-card', key);
  await expect(tableCard(alice, 'Alice').locator('.pc .tv')).toHaveText('🎉');
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

  // an error of the API without a field: a toast above the editor, the editor stays open with the changes
  await alice.locator('#deck_edit').click();
  await alice.locator('#cs_name').fill('Set 4b');
  await alice.route('**/api/custom_set_save.php*', route => route.fulfill({ status: 500, body: '' }));
  await alice.locator('#cs_save').click();
  await expect(editor(alice).locator('#toast')).toHaveText('Not saved \u2013 please try again');
  await expect(editor(alice)).toBeVisible();
  await expect(alice.locator('#cs_name')).toHaveValue('Set 4b');
  await alice.unroute('**/api/custom_set_save.php*');
  await alice.locator('#cs_cancel').click();
  await alice.locator('[data-f="ask-ok"]').click(); // discard
  await expect(editor(alice)).toBeHidden();

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
