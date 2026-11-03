import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { teamWithTwoPlayers, deckCard, deckCards, pickCard, tableCard, newPlayer, createTeam, joinAsPlayer } from './helpers';

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
  await expect(alice.locator('#deck_own_title + #deck_new_set')).toHaveText('+New set');
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
  // R3 (Andreas, 2026-11-03): the column on the desktop moves with ↑ ↓
  await expect(alice.locator('#cs_up')).toHaveText('↑', { useInnerText: true });
  await expect(alice.locator('#cs_down')).toHaveText('↓', { useInnerText: true });
  await expect(alice.locator('#cs_up')).toHaveAttribute('aria-label', 'Move card earlier');

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
  await expect(alice.locator('#toast')).toHaveText('Set saved and in use');
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

test('Save creates a set without playing it; "Save & use" of a saved set puts it in use', async ({ browser }) => {
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
  await expect(alice.locator('#toast')).toHaveText('Set saved and in use');
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
  // Andreas (compact list): one line per row, no line below the names, "Start from scratch" first
  await expect(alice.locator('#cs_body small')).toHaveCount(0);
  await expect(alice.locator('#cs_body .dm-prow-b').first()).toHaveAttribute('id', 'cs_scratch');
  await expect(alice.locator('#cs_from [data-group] .dm-fan')).toHaveCount(8);
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
  await expect(alice.locator('#toast')).toHaveText('Set saved and in use');

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

/* Andreas: "Copy from an existing set" lists the team's own sets below the built-in ones; a copy takes every card
 * (symbol / text, heading, description, value, colour, also a colour from a template outside the palette) and the
 * style, the name stays empty */
test('"+ New set" copies an own set with all its cards, a template colour included', async ({ browser }) => {
  const { alice, url } = await teamWithTwoPlayers(browser, 'Own Sets Copy Own');
  const t = new URL(url).searchParams.get('t') as string;
  const res = await alice.request.post(`/api/custom_set_create.php?t=${encodeURIComponent(t)}`, {
    data: JSON.stringify({ name: 'Source', style: 'badge', cards: [
      { key: 'jdg3', symbol: 's-3', color: 'j3' },
      { text: 'Hi', heading: 'Head', description: 'Desc', numeric_value: 7, color: 'blue' }] }),
    headers: { 'Content-Type': 'application/json' } });
  expect(res.ok()).toBeTruthy();
  await alice.reload();
  const source = (await lastJson(alice)).custom_sets[0];
  expect(source.cards[0].color).toBe('j3');

  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();
  await alice.locator('#deck_new_set').click();
  await expect(alice.locator('#cs_from_title')).toHaveText('Copy from an existing set');
  // the built-in sets first, then the own set (a fan, no pen)
  await expect(alice.locator('#cs_from .dm-prow-b').last()).toHaveAttribute('data-set', String(source.set_id));
  const row = alice.locator(`#cs_from [data-set="${source.set_id}"]`);
  await expect(row.locator('.dm-t')).toHaveText('Source');
  await expect(row.locator('.dm-fan .dkc')).toHaveCount(2);
  await expect(alice.locator('#cs_from .cs-edit')).toHaveCount(0);
  await row.click();

  await expect(alice.locator('#cs_title')).toHaveText('New card set');
  await expect(alice.locator('#cs_name')).toHaveValue('');
  await expect(alice.locator('#cs_list [data-f^="card:"]')).toHaveCount(2);
  await expect(alice.locator('[data-f="style:badge"]')).toBeChecked();
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#cs_name_err')).toHaveText('Give the set a name.');
  await alice.locator('#cs_name').fill('Copy');
  await alice.locator('#cs_save').click();
  await expect(editor(alice)).toBeHidden();

  await expect.poll(async () => (await lastJson(alice)).custom_sets.length).toBe(2);
  const copy = (await lastJson(alice)).custom_sets.find(set => set.name === 'Copy')!;
  expect(copy.style).toBe('badge');
  expect(copy.cards.map(c => [c.symbol, c.color])).toEqual([['s-3', 'j3'], [null, 'blue']]);
  expect(copy.cards[1]).toMatchObject({ value: 'Hi', heading: 'Head', numeric_value: 7 });
  expect((copy.cards[1] as unknown as { description: string }).description).toBe('Desc');
  // new cards of their own, the source unchanged
  expect(copy.cards.map(c => c.card_key)).not.toContain(source.cards[0].card_key);
  const after = (await lastJson(alice)).custom_sets.find(set => set.name === 'Source')!;
  expect(after.cards.map(c => [c.card_key, c.color])).toEqual(source.cards.map(c => [c.card_key, c.color]));
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
  await expect(alice.locator('#toast')).toHaveText('Set saved and in use');

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
  // Andreas (compact list): the hint as the title of the small button in the heading
  await expect(alice.locator('#deck_own_title + #deck_new_set')).toHaveAttribute('title', /^5 of 5 sets/);
  // Delia: the reason visible as well (touch, keyboard, screen readers)
  await expect(alice.locator('#deck_new_hint')).toHaveText('Delete one of your sets to create a new one.');
  await expect(alice.locator('#deck_new_hint')).toBeVisible();
  await expect(alice.locator('#deck_new_set')).toHaveAttribute('aria-describedby', 'deck_new_hint');

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

/* R3 (Andreas): the small places (spread labels, range, deck info, tips) show what was entered as the card's text,
 * cut to its first three characters (an emoji counts as one, no "…"), or the symbol; never heading or description */
test('own set: the small places show the entered text (first 3 characters) or the symbol, never the heading', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'Own Sets Small');
  const t = new URL(url).searchParams.get('t') as string;
  const res = await alice.request.post(`/api/custom_set_create.php?${new URLSearchParams({ t }).toString()}`, {
    data: JSON.stringify({ name: 'Small', style: 'plain', activate: true, cards: [
      { text: '🎉', heading: 'party', description: 'Time to celebrate.', numeric_value: 2, color: 'pink' },
      { text: 'SPLIT', heading: 'split it', description: 'Too big, split the story.', numeric_value: 8, color: 'red' },
      { symbol: 's-face-sad', heading: 'gloomy', color: 'blue' },
      { symbol: 's-5', heading: 'five', numeric_value: 5, color: 'green' },
    ] }),
    headers: { 'Content-Type': 'application/json' } });
  expect(res.ok()).toBeTruthy();
  const keys: string[] = (await res.json()).set.cards.map((c: { card_key: string }) => c.card_key);
  const [party, split, sad, five] = keys;
  await expect.poll(() => trayKeys(alice)).toEqual(expect.arrayContaining(keys));

  // the spread labels: before the reveal already (the columns follow the deck)
  const value = (key: string) => alice.locator(`#spread_bars [data-card="${key}"] .spread-value`);
  await expect(value(party).locator('.sm-text')).toHaveText('🎉');
  await expect(value(split).locator('.sm-text')).toHaveText('SPL');
  await expect(value(split).locator('.sm-text')).toHaveAttribute('title', 'SPLIT');
  await expect(value(sad).locator('.mini use')).toHaveAttribute('href', /#s-face-sad$/);
  await expect(value(sad).locator('.sm-text')).toHaveCount(0);
  await expect(value(five).locator('.sm-text')).toHaveText('5');

  // the deck info: the chip shows the value, the heading only in the text next to it
  await deckCard(alice, split).hover();
  await expect(alice.locator('#deck_info .deck-info-value')).toHaveText('SPL');
  await deckCard(alice, party).hover();
  await expect(alice.locator('#deck_info .deck-info-value')).toHaveText('🎉');

  // play and reveal: labels and range without any heading
  await pickCard(alice, split);
  await pickCard(bob, party);
  await expect(alice.locator('#spread_range')).toHaveText('range 🎉–SPL');
  const labels = await alice.locator('#spread_bars .spread-value').allTextContents();
  for (const heading of ['party', 'split it', 'five']) expect(labels.join('|')).not.toContain(heading);
  await expect(alice.locator(`#spread_bars [data-card="${split}"] .spread-count`)).toHaveText('1');
  if (process.env.SMALL_SHOT) await alice.screenshot({ path: process.env.SMALL_SHOT });
});

/* R3 fix (Andreas, iPhone Safari): the editor fits a phone. Its fields are at least 16px (else iOS zooms into the
 * focused name field and cuts off the right side and the foot), nothing is wider than the screen, Save is in view */
for (const phone of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test(`editor on a phone ${phone.width}×${phone.height}: no zoom, no overflow, Save in view`, async ({ browser }) => {
    const alice = await newPlayer(browser, { viewport: phone, isMobile: true, hasTouch: true });
    const url = await createTeam(alice, 'Own Sets Phone');
    await joinAsPlayer(alice, url, 'Alice');
    await alice.locator('#menu_btn').click();
    await alice.locator('#menu_index').getByRole('button', { name: /^Board settings/ }).click();
    await alice.locator('#deck_change').click();
    await alice.locator('#deck_new_set').click();

    const fits = async () => {
      const m = await alice.evaluate(() => {
        const dialog = document.getElementById('cs_editor')!.getBoundingClientRect();
        const wide = Array.from(document.querySelectorAll('#cs_editor *')).filter(el => {
          const r = el.getBoundingClientRect();
          // inside a scroller (the card strip) a card may lie beyond the edge
          return r.width > 0 && r.right > innerWidth + 0.5 && el.closest('.cs-list') === null;
        }).map(el => el.id || el.className);
        return { sw: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight,
          dialog: [dialog.left, dialog.top, dialog.right, dialog.bottom], wide };
      });
      expect(m.sw).toBeLessThanOrEqual(m.w);
      expect(m.dialog[0]).toBeGreaterThanOrEqual(0);
      expect(m.dialog[1]).toBeGreaterThanOrEqual(0);
      expect(m.dialog[2]).toBeLessThanOrEqual(m.w);
      expect(m.dialog[3]).toBeLessThanOrEqual(m.h);
      expect(m.wide).toEqual([]);
      return m;
    };

    // the choice first: in view as well
    await expect(alice.locator('#cs_scratch')).toBeVisible();
    await fits();
    if (phone.width === 375) await alice.screenshot({ path: `${process.env.PHONE_SHOTS || 'test-results'}/start-375x667.png` });
    await alice.locator('#cs_scratch').click();
    await expect(alice.locator('#cs_name')).toBeFocused();

    // no iOS zoom: every field of the editor at least 16px
    const sizes = await alice.locator('#cs_editor input:not([type="radio"]):not([type="checkbox"]), #cs_editor textarea, #cs_editor select')
      .evaluateAll(els => els.map(el => [el.id, parseFloat(getComputedStyle(el).fontSize)] as [string, number]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter(([, size]) => size < 16)).toEqual([]);

    const m = await fits();
    // the close button and Save in view
    for (const id of ['#cs_save', '#cs_editor .cs-x']) {
      const box = (await alice.locator(id).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(m.w);
      expect(box.y + box.height).toBeLessThanOrEqual(m.h);
    }
    if (phone.width === 375) await alice.screenshot({ path: `${process.env.PHONE_SHOTS || 'test-results'}/editor-top-375x667.png` });

    // the symbol picker's search field (opens with focus) is 16px, too
    await alice.locator('[data-f="card:0"]').click();
    // R3 (Andreas, 2026-11-03): the strip runs sideways, its arrows too (← earlier, → later)
    await expect(alice.locator('#cs_up')).toHaveText('←', { useInnerText: true });
    await expect(alice.locator('#cs_down')).toHaveText('→', { useInnerText: true });
    await expect(alice.locator('#cs_down')).toHaveAttribute('aria-label', 'Move card later');
    await alice.locator('#cs_down').click();
    await expect(alice.locator('[data-f="card:1"]')).toHaveAttribute('aria-current', 'true');
    if (phone.width === 390) await alice.screenshot({ path: `${process.env.PHONE_SHOTS || 'test-results'}/arrows-phone.png` });
    await alice.locator('[data-f="card:0"]').click();
    await alice.locator('#cs_sym').click();
    await expect(alice.locator('#cs_sym_search')).toBeFocused();
    expect(await alice.locator('#cs_sym_search').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await alice.keyboard.press('Escape');
    await fits();

    // scrolled to the bottom: Save still there
    await alice.locator('#cs_editor .cs-body').evaluate(el => el.scrollTo(0, el.scrollHeight));
    await expect(alice.locator('#cs_save')).toBeInViewport({ ratio: 1 });
    if (phone.width === 375) await alice.screenshot({ path: `${process.env.PHONE_SHOTS || 'test-results'}/editor-bottom-375x667.png` });
  });
}

/* R3 fix (Andreas): saving the active set with another style or heading (same card keys, in place) changes deck,
 * table and result for everybody at once, without a reload; a new value (new key) starts a new round */
test('a new style or heading of the active set shows at once for everybody', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'Own Sets Restyle');
  const t = new URL(url).searchParams.get('t') as string;
  const res = await alice.request.post(`/api/custom_set_create.php?${new URLSearchParams({ t }).toString()}`, {
    data: JSON.stringify({ name: 'Restyle', style: 'plain', activate: true, cards: [
      { text: 'M', heading: 'medium', color: 'red' },
      { symbol: 's-3', heading: 'three', numeric_value: 3, color: 'green' },
    ] }),
    headers: { 'Content-Type': 'application/json' } });
  expect(res.ok()).toBeTruthy();
  const [m, three] = (await res.json()).set.cards.map((c: { card_key: string }) => c.card_key) as string[];
  await expect.poll(() => trayKeys(bob)).toEqual(expect.arrayContaining([m, three]));
  await pickCard(alice, m);
  await pickCard(bob, three);
  for (const page of [alice, bob]) {
    await expect(tableCard(page, 'Alice').locator('.pc')).toHaveClass(/sty-plain/);
    await expect(page.locator(`#spread_bars [data-card="${three}"] .sm-text`)).toHaveText('3');
  }

  // the style: inverted (keys stay)
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_edit').click();
  await alice.locator('[data-f="style:inverted"]').check({ force: true });
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#toast')).toHaveText('Set saved');
  for (const page of [alice, bob]) {
    await expect(page.locator(`#ctl .ctl[data-card="${m}"] .dkc`)).toHaveClass(/sty-inverted/);
    await expect(page.locator(`#ctl .ctl[data-card="${three}"] .dkc`)).toHaveClass(/sty-inverted/);
    await expect(tableCard(page, 'Alice').locator('.pc')).toHaveClass(/sty-inverted/);
    await expect(tableCard(page, 'Bob').locator('.pc')).toHaveClass(/sty-inverted/);
    await expect(page.locator(`#spread_bars [data-card="${three}"] .sm-inv`)).toHaveCount(1);
  }

  // the style alone keeps the cards: both still down, no new round
  for (const page of [alice, bob]) {
    await expect(tableCard(page, 'Alice')).toHaveAttribute('data-card', m);
    await expect(tableCard(page, 'Bob')).toHaveAttribute('data-card', three);
  }

  // a heading changes in place (Andreas 2026-11-03): same key, no hint, no new round, the cards stay down and
  // everybody sees the new heading without a reload (the toast must fade first: the same text again tells nothing)
  await expect(alice.locator('#toast')).not.toHaveClass(/toast-on/);
  await alice.locator('#deck_edit').click();
  await alice.locator('[data-f="card:0"]').click();
  await alice.locator('#cs_heading').fill('MEDIUM');
  await expect(alice.locator('#cs_round')).toHaveCount(0);
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#toast')).toHaveText('Set saved');
  await expect(alice.locator('#toast')).toHaveClass(/toast-on/);
  for (const page of [alice, bob]) {
    await expect(page.locator(`#ctl .ctl[data-card="${m}"] .dh`)).toHaveText('MEDIUM');
    await expect(tableCard(page, 'Alice')).toHaveAttribute('data-card', m);
    await expect(tableCard(page, 'Bob')).toHaveAttribute('data-card', three);
  }
  await expect(tableCard(alice, 'Alice').locator('.pc .ttl')).toContainText('MEDIUM');

  // the value of a card that is down changes (new key): the editor says so, Save starts a new round
  await alice.locator('#deck_edit').click();
  await alice.locator('[data-f="card:1"]').click();
  await alice.locator('#cs_value').fill('4');
  await expect(alice.locator('#cs_round')).toBeVisible();
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#toast')).toHaveText('Set saved \u2013 new round started');
  for (const page of [alice, bob]) {
    await expect(page.locator(`#ctl .ctl[data-card="${three}"]`)).toHaveCount(0);
    await expect(page.locator(`#ctl .ctl[data-card="${m}"]`)).toHaveCount(1);
    await expect(tableCard(page, 'Alice')).not.toHaveAttribute('data-card', m);
    await expect(tableCard(page, 'Bob')).not.toHaveAttribute('data-card', three);
  }
});

/* R3 fix (Andreas): every change of the active set (name, add, remove, move, symbol <-> text, text, heading,
 * description, value, colour) shows for the writer and the others without a reload: deck, menu overview, table, result */
test('changes of the active set show everywhere for everybody without a reload', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'Own Sets Live');
  const t = new URL(url).searchParams.get('t') as string;
  type Out = { set: { set_id: number; rev: number; cards: { card_key: string }[] }; deck: { controls: string[] }; new_round: boolean };
  const post = async (path: string, params: Record<string, string>, body: unknown): Promise<Out> => {
    const res = await alice.request.post(`/api/${path}?${new URLSearchParams({ t, ...params }).toString()}`,
      { data: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const M = { text: 'M', heading: 'medium', numeric_value: 5, color: 'red' };
  const THREE = { symbol: 's-3', heading: 'three', numeric_value: 3, color: 'green' };
  let out = await post('custom_set_create.php', {}, { name: 'Live', style: 'badge', activate: true, cards: [M, THREE] });
  const id = String(out.set.set_id);
  const save = async (name: string, cards: unknown[]) => {
    out = await post('custom_set_save.php', { set: id }, { name, style: 'badge', rev: out.set.rev, cards });
    return out.set.cards.map(c => c.card_key);
  };
  const [m, three] = out.set.cards.map(c => c.card_key);
  // both see the set; Bob keeps the menu open on its overview
  await bob.locator('#cset_btn').click();
  await expect(bob.locator('#deck_change')).toContainText('Live');
  const expectEverywhere = async (keys: string[]) => {
    for (const page of [alice, bob]) await expect.poll(() => trayKeys(page)).toEqual([...keys, ...out.deck.controls]);
    await expect.poll(() => bob.locator('#deck_cards [data-card]').evaluateAll(els => els.map(el => el.getAttribute('data-card'))))
      .toEqual(keys);
  };

  // name, move, add
  let keys = await save('Live 2', [{ ...THREE, key: three }, { ...M, key: m }, { text: 'XL', heading: 'huge', numeric_value: 13, color: 'violet' }]);
  expect(keys.slice(0, 2)).toEqual([three, m]); // unchanged cards keep their keys
  await expectEverywhere(keys);
  await expect(bob.locator('#deck_change')).toContainText('Live 2');
  await expect(alice.locator(`#ctl .ctl[data-card="${keys[2]}"] .tv`)).toHaveText('XL');

  // remove, symbol -> text, text, heading, description, value, colour
  keys = await save('Live 2', [{ text: 'T3', heading: 'three', numeric_value: 3, color: 'green' },
    { text: 'L', heading: 'large', description: 'Large one', numeric_value: 8, color: 'blue' }]);
  await expectEverywhere(keys);
  const [t3, l] = keys;
  for (const page of [alice, bob]) {
    await expect(page.locator(`#ctl .ctl[data-card="${t3}"] .tv`)).toHaveText('T3');
    await expect(page.locator(`#ctl .ctl[data-card="${t3}"] svg.mot`)).toHaveCount(0);
    await expect(page.locator(`#ctl .ctl[data-card="${l}"] .dh`)).toHaveText('large');
  }
  await expect(bob.locator('#deck_cards [data-card]')).toHaveCount(2);

  // table and result
  await bob.locator('#menu_close').click();
  await pickCard(alice, l);
  await pickCard(bob, t3);
  for (const page of [alice, bob]) {
    await expect(tableCard(page, 'Alice').locator('.pc .tv')).toHaveText('L');
    await expect(tableCard(page, 'Alice').locator('.pc .txt')).toHaveText('Large one');
    await expect(page.locator('#spread_range')).toHaveText('range T3–L');
  }

  // text -> symbol, value and colour while cards are down: a new round, the new cards for both
  keys = await save('Live 2', [{ symbol: 's-4', heading: 'four', numeric_value: 4, color: 'teal' },
    { text: 'L', heading: 'large', description: 'Large one', numeric_value: 1, color: 'red' }]);
  expect(out.new_round).toBe(true);
  await expectEverywhere(keys);
  for (const page of [alice, bob]) {
    await expect(page.locator(`#ctl .ctl[data-card="${keys[0]}"] svg.mot use`)).toHaveAttribute('href', /#s-4$/);
    await expect(tableCard(page, 'Alice')).not.toHaveAttribute('data-card', l);
  }
});

/* R3 (Andreas, 2026-11-03): focus the app moves itself (the choice opens, the editor closes, "Change" / "‹ Deck")
 * shows its ring only after a key, not after a mouse click (focusQuietly() in script.js) */
test('focus moved by the deck menu and the editor: no ring after a click, a ring after a key', async ({ browser }) => {
  const { alice } = await teamWithTwoPlayers(browser, 'Focus Ring');
  const ring = (selector: string) => alice.locator(selector).evaluate(el => ({
    focused: document.activeElement === el,
    visible: el.matches(':focus-visible'),
    outline: getComputedStyle(el).outlineStyle,
  }));
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();
  await expect(alice.locator('#deck_pick_title')).toBeFocused();
  expect((await ring('#deck_pick_title')).visible).toBe(false);

  // mouse: the choice opens with the focus on "Start from scratch", × closes, the focus back on "+ New set", no ring
  await alice.locator('#deck_new_set').click();
  await expect(alice.locator('#cs_scratch')).toBeFocused();
  expect((await ring('#cs_scratch')).outline).toBe('none');
  await alice.locator('#cs_x').click();
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#deck_new_set')).toBeFocused();
  expect(await ring('#deck_new_set')).toEqual({ focused: true, visible: false, outline: 'none' });

  // like Safari: the browser would show the ring after the click (Chrome does so after a key); the page hides it
  await alice.keyboard.press('F2');
  const safariClick = (selector: string) => alice.locator(selector).evaluate(el => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    (el as HTMLElement).click();
  });
  await safariClick('#deck_new_set');
  await expect(alice.locator('#cs_scratch')).toBeFocused();
  expect(await ring('#cs_scratch')).toEqual({ focused: true, visible: true, outline: 'none' });
  await safariClick('#cs_x');
  await expect(alice.locator('#deck_new_set')).toBeFocused();
  expect(await ring('#deck_new_set')).toEqual({ focused: true, visible: true, outline: 'none' });
  // a key brings the ring back
  await alice.keyboard.press('F2');
  expect((await ring('#deck_new_set')).outline).toBe('solid');

  // keyboard: Enter opens the choice with the ring, Esc closes it, the focus with its ring back on "+ New set"
  await alice.locator('#deck_new_set').focus();
  await alice.keyboard.press('Enter');
  await expect(alice.locator('#cs_scratch')).toBeFocused();
  expect(await ring('#cs_scratch')).toEqual({ focused: true, visible: true, outline: 'solid' });
  await alice.keyboard.press('Escape');
  await expect(editor(alice)).toBeHidden();
  await expect(alice.locator('#deck_new_set')).toBeFocused();
  expect(await ring('#deck_new_set')).toEqual({ focused: true, visible: true, outline: 'solid' });
});

/* R3 (Andreas, staging): the own picked card of an own set is taken back like one of a built-in set: a second click,
 * a second tap (phone, carousel) or the same letter key again */
for (const way of ['click', 'tap', 'key'] as const) {
  test(`own set: the picked card is taken back by a second ${way}`, async ({ browser }) => {
    const phone = way === 'tap' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {};
    const alice = await newPlayer(browser, phone);
    const url = await createTeam(alice, 'Own Sets Take Back');
    await joinAsPlayer(alice, url, 'Alice');
    const bob = await newPlayer(browser);
    await joinAsPlayer(bob, url, 'Bob'); // Bob has no card: Alice's card can be taken back
    const t = new URL(url).searchParams.get('t') as string;
    const res = await alice.request.post(`/api/custom_set_create.php?t=${encodeURIComponent(t)}`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ name: 'Risk', style: 'badge', activate: true, cards: [
        { symbol: 's-1', heading: 'low', numeric_value: 1, color: 'green' },
        { text: 'M', heading: 'medium', description: 'Some risk.', numeric_value: 2, color: 'amber' },
        { text: 'L', numeric_value: 3, color: 'red' }] }) });
    expect(res.ok()).toBeTruthy();
    const keys: string[] = (await res.json()).set.cards.map((c: { card_key: string }) => c.card_key);
    const card = deckCard(alice, keys[1]);
    await expect(card).toBeVisible();
    const press = async () => {
      if (way === 'tap') await card.tap();
      else if (way === 'key') await alice.keyboard.press('KeyW'); // the second card of the deck
      else await card.click();
    };

    await press();
    await expect(card).toHaveClass(/selected/);
    await expect(tableCard(bob, 'Alice')).toHaveAttribute('data-card', 'done001');
    await alice.waitForTimeout(800); // a real second press, not a double click
    await press();
    await expect(card).not.toHaveClass(/selected/);
    await expect(card).toHaveAttribute('aria-pressed', 'false');
    await expect(tableCard(alice, 'Alice')).toHaveAttribute('data-card', 'prgrss1');
    await expect(tableCard(bob, 'Alice')).toHaveAttribute('data-card', 'prgrss1');
    expect((await lastJson(alice) as unknown as { selected_card_key: string | null }).selected_card_key).toBeFalsy();
  });
}

/* R3 (Andreas, staging): the editor is open on a desktop and the window gets narrow (phone layout): the menu behind
 * it does not come up above the editor (it would be reopened as a modal sheet in the top layer); it switches when
 * the editor closes */
test('editor open, window from 1280 to 390: the menu stays behind the editor', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 800 } });
  const url = await createTeam(alice, 'Own Sets Resize');
  await joinAsPlayer(alice, url, 'Alice');
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();
  await alice.locator('#deck_new_set').click();
  await alice.locator('#cs_scratch').click();
  await expect(editor(alice)).toBeVisible();
  await expect(alice.locator('#cs_name')).toBeFocused();
  const menuModal = () => alice.locator('#menu').evaluate(el => el.matches(':modal'));
  const top = () => alice.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return el === null ? null : el.closest('dialog')?.id ?? null;
  });
  expect(await menuModal()).toBe(false);

  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(300);
  await expect(editor(alice)).toBeVisible();
  expect(await menuModal()).toBe(false);
  expect(await top()).toBe('cs_editor');
  await expect(alice.locator('#cs_name')).toBeFocused();
  await alice.locator('#cs_name').fill('Narrow');

  // back to wide and narrow again: still the editor on top
  await alice.setViewportSize({ width: 1280, height: 800 });
  await alice.setViewportSize({ width: 390, height: 844 });
  await alice.waitForTimeout(300);
  expect(await top()).toBe('cs_editor');
  await expect(alice.locator('#cs_name')).toHaveValue('Narrow');
});
