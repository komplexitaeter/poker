import { test, expect, Page, Browser } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, pickCard, setTeamDeck, removeExampleSet } from './helpers';
import * as fs from 'fs';

/**
 * B-52 S1/S1b (script/topics.js): the topic list on the board.
 * - S1b: the note stays a note. The topic field (update_topic.php) is the team's note, shown in the column as before;
 *   items come in addition: in the topics menu below the note ("+ Add item", a button with a dashed outline).
 * - More items: the list in the menu (open with "now" on top, done), move by dragging the grip (mouse) or with the
 *   arrow keys on the grip (announced in #ti_live); "Done 0" is an inactive tab (aria-disabled), the
 *   column shows the active item, "+N more · next: …" and the note below. After the reveal "Next item" next to
 *   "New round", for the last open item "Finish item" (then no item is active, the note stays).
 * - The lists come from get_topics.php only while the menu shows them and only when topics_rev changed.
 * - History: a done item shows the agreed value, the rounds, the date of the last round; its spread unfolds, built like
 *   the spread of the results panel (a column per deck card, also without votes; the agreed value marked as .est).
 * - Result: the highest card is marked in the spread; a click on a bar with votes or the dropdown changes it.
 *   Traffic lights (deck aim 'perspectives'): no mark, no dropdown, one sentence instead.
 * - Maturity: set in the item form; in the voting panel name and text, in the results panel the text unfolds
 *   with a click on the triangle; "not set" shows nothing.
 * - The set editor: the goal of an own set (agree on a value / show perspectives).
 * - S1c: the note on the board above the cards (also with the column collapsed); the topics menu with tabs
 *   Note · Items · Done (start: Items while items are open, else Note; Done loads when its tab opens); "Next item" /
 *   "Finish item" always ask (#leave_item: close with the estimate / without a value / later; perspectives: close /
 *   later; Enter confirms the suggestion, Cancel, Escape and a click beside it cancel); the rail (collapsed column):
 *   the item marker on top and after the reveal the split "next item" / "new round".
 */

const DESKTOP = { width: 1280, height: 800 };

async function setup(browser: Browser, name: string) {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, name);
  const t = new URL(url).searchParams.get('t') as string;
  const ids = await addPlayersViaApi(alice, url, ['Ann', 'Ben']);
  await joinAsPlayer(alice, url, 'Alice');
  return { alice, url, t, ids };
}

/** Ann and Ben vote through the API, Alice in the deck: the round is revealed */
async function reveal(page: Page, t: string, ids: string[], cards: [string, string, string]) {
  for (const [i, cardkey] of cards.slice(1).entries()) {
    const res = await page.request.post(`/api/setc.php?t=${encodeURIComponent(t)}&id=${ids[i]}&cardkey=${cardkey}`);
    expect(res.ok()).toBeTruthy();
  }
  await pickCard(page, cards[0]);
  await expect(page.locator('#round_status')).toHaveText('revealed');
}

async function openTopics(page: Page) {
  await page.locator('#topic_btn').click();
  await expect(page.locator('#topic_box')).toBeVisible();
}

async function showTab(page: Page, tab: 'note' | 'open' | 'done') {
  await page.locator(`#topic_tab_${tab}`).click();
  await expect(page.locator(`#topic_panel_${tab}`)).toBeVisible();
}

/** "Next item" / "Finish item" opens the overlay; the choice by its mode */
async function leave(page: Page, mode: 'close' | 'close_empty' | 'later' = 'close', opener = '#nextitem_btn') {
  await page.locator(opener).click();
  await expect(page.locator('#leave_item')).toBeVisible();
  await page.locator(`#leave_item .leave-opt[data-mode="${mode}"]`).click();
  await expect(page.locator('#leave_item')).toBeHidden();
}

async function closeMenu(page: Page) {
  await page.locator('#menu_close').click();
  await expect(page.locator('#topic_box')).toBeHidden();
}

/** adds an item with the form of the list ("+ Add item") */
async function fillItem(page: Page, heading: string, extId = '', maturity = '') {
  if (!await page.locator('#topic_panel_open').isVisible()) await showTab(page, 'open');
  if (await page.locator('#ti_form').count() === 0) await page.locator('#ti_add').click();
  await page.locator('#ti_ext').fill(extId);
  await page.locator('#ti_heading').fill(heading);
  if (maturity !== '') await page.locator('#ti_form .seg label', { hasText: maturity }).click();
  await page.locator('#ti_save').click();
  await expect(page.locator('#ti_form')).toHaveCount(0);
}

/** counts the requests to get_topics.php of a page (and whether they asked for the done items) */
function countTopicLoads(page: Page) {
  const loads: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/get_topics.php')) loads.push(request.url());
  });
  return loads;
}

const openHeadings = (page: Page) => page.locator('#ti_open .ti-it .ti-h');

test('the note stays a note: on the board above the cards, tabs Note · Items 0 · Done 0 (B-52 S1b, S1c)', async ({ browser }) => {
  const { alice } = await setup(browser, 'Topic UI Note');
  const loads = countTopicLoads(alice);
  await expect(alice.locator('#board_note')).toBeHidden(); // no note: no room
  await openTopics(alice);
  // no items: the menu starts on "Note" with the field focused (no extra click for the simple case)
  await expect(alice.locator('#topic_tab_note')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#topic_tab_open')).toHaveText('Items 0');
  await expect(alice.locator('#topic_tab_done')).toHaveText('Done 0');
  await expect(alice.locator('#topic_txt')).toBeFocused();
  await expect(alice.locator('#topic_txt')).toHaveAttribute('placeholder', 'A note for everyone – e.g. today’s goal or how you estimate.');
  await expect(alice.locator('label[for="topic_txt"]')).toHaveText('What are you estimating? (optional, Markdown works)');
  // the entry to the items on "Open": a clearly visible button with a dashed outline, no list yet
  await showTab(alice, 'open');
  const add = alice.locator('#ti_add');
  await expect(add).toBeVisible();
  await expect(add).toHaveText('Add item');
  expect(await add.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  await expect(alice.locator('#ti_open, #ti_done')).toHaveCount(0);
  // "Done 0" is inactive: a click does nothing, the arrow keys skip it (Items -> Note)
  await expect(alice.locator('#topic_tab_done')).toHaveAttribute('aria-disabled', 'true');
  await alice.locator('#topic_tab_done').click({ force: true });
  await expect(alice.locator('#topic_tab_open')).toHaveAttribute('aria-selected', 'true');
  await alice.locator('#topic_tab_open').focus();
  await alice.keyboard.press('ArrowRight');
  await expect(alice.locator('#topic_tab_note')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#topic_tab_note')).toBeFocused();
  await showTab(alice, 'note');
  await alice.locator('#topic_txt').fill('PAY-142 pay by invoice\nwith **details**');
  await alice.locator('#topic_save').click();
  await expect(alice.locator('#topic_box')).toBeHidden();

  // the board: the note above the cards (markdown), no topic bar in the column, no "Next item"
  await expect(alice.locator('#board_note_text')).toContainText('PAY-142 pay by invoice');
  await expect(alice.locator('#board_note_text strong')).toHaveText('details');
  const note = (await alice.locator('#board_note').boundingBox())!;
  expect(note.y + note.height).toBeLessThanOrEqual((await alice.locator('#cbox').boundingBox())!.y);
  await expect(alice.locator('.topic-bar')).toBeHidden();
  await expect(alice.locator('#topic .ti-heading, #ti_next_hint')).toHaveCount(0);

  // opened again: the note in the field, still no items - and no team without items loads a list
  await openTopics(alice);
  await expect(alice.locator('#topic_txt')).toHaveValue('PAY-142 pay by invoice\nwith **details**');
  await showTab(alice, 'open');
  await expect(alice.locator('#ti_open')).toHaveCount(0);
  expect(loads).toHaveLength(0);
});

test('items in addition to the note: add, move, next item, finish item; the note stays (B-52 S1b)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI List');
  await openTopics(alice);
  await alice.locator('#topic_txt').fill('Timebox: 5 minutes per item');
  await alice.locator('#topic_save').click();
  await openTopics(alice);
  await showTab(alice, 'open');
  await alice.locator('#ti_add').click();
  await expect(alice.locator('#ti_heading')).toBeFocused();
  await fillItem(alice, 'Login with SSO');
  await fillItem(alice, 'Export orders as CSV', 'PAY-150');
  await fillItem(alice, 'Spike: PDF library');
  await expect(openHeadings(alice)).toHaveText(['Login with SSO', 'Export orders as CSV', 'Spike: PDF library']);
  await expect(alice.locator('#ti_open .ti-it.now .ti-tag')).toHaveText('now');
  await expect(alice.locator('#topic_tab_open')).toHaveText('Items 3');
  await expect(alice.locator('label[for="topic_txt"]')).toHaveText('Note for everyone (optional, Markdown works)');
  // the note is untouched by the items
  await expect(alice.locator('#topic_txt')).toHaveValue('Timebox: 5 minutes per item');

  await expect(alice.locator('#topic_panel_open .ti-note')).toHaveText('The top item is shown to everyone.');
  await expect(alice.locator('#ti_open [data-ti-act="up"], #ti_open [data-ti-act="down"]')).toHaveCount(0);

  // move the third one up with the arrow keys on its grip (the focus stays on the moved item's grip)
  const grip = alice.locator('#ti_open .ti-grip').nth(2);
  await expect(grip).toHaveAccessibleName('Move item: Spike: PDF library');
  await expect(grip).toHaveAccessibleDescription('Drag, or use the up and down arrow keys.');
  await grip.focus();
  await alice.keyboard.press('ArrowUp');
  await expect(openHeadings(alice)).toHaveText(['Login with SSO', 'Spike: PDF library', 'Export orders as CSV']);
  await expect(alice.locator('#ti_open .ti-grip').nth(1)).toBeFocused();
  await expect(alice.locator('#ti_live')).toHaveText('Moved to position 2 of 3.');
  await closeMenu(alice);

  // the column: the active item and what comes next; the note stays on the board (not in the column)
  await expect(alice.locator('.topic-label')).toHaveText('item 1 of 3');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Login with SSO');
  await expect(alice.locator('#ti_next_hint')).toHaveText('+2 more · next: Spike: PDF library');
  await expect(alice.locator('#board_note_text')).toHaveText('Timebox: 5 minutes per item');
  await expect(alice.locator('#topic')).not.toContainText('Timebox');
  await alice.locator('#ti_next_hint').click();
  await expect(alice.locator('#topic_tab_open')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#ti_open')).toBeVisible();
  await closeMenu(alice);

  // no "Next item" before the reveal
  await expect(alice.locator('#nextitem_btn')).toBeHidden();
  await reveal(alice, t, ids, ['three01', 'five001', 'eight01']);
  await expect(alice.locator('#nextitem_btn')).toBeVisible();
  await expect(alice.locator('#nextitem_btn')).toHaveText('Next item');
  await expect(alice.locator('#newroundbtn')).toHaveValue('New round');
  // the highest card is the result
  await expect(alice.locator('#spread_bars .spread-col.est')).toHaveAttribute('data-card', 'eight01');
  await expect(alice.locator('#spread_est_sel')).toHaveValue('eight01');

  await leave(alice, 'close');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Spike: PDF library');
  await expect(alice.locator('.topic-label')).toHaveText('item 1 of 2');
  await expect(alice.locator('#round_status')).not.toHaveText('revealed'); // a new round
  await expect(alice.locator('#nextitem_btn')).toBeHidden();

  await openTopics(alice);
  await expect(openHeadings(alice)).toHaveText(['Spike: PDF library', 'Export orders as CSV']);
  await expect(alice.locator('#topic_tab_done')).toHaveText('Done 1');
  await showTab(alice, 'done');
  const done = alice.locator('#ti_done > li');
  await expect(done).toHaveCount(1);
  await expect(done.first()).toContainText('Login with SSO');
  await expect(done.first().locator('.ti-res-val')).toHaveText('8');

  // reopen: right after the active item
  await done.first().locator('[data-ti-act="reopen"]').click();
  await expect(alice.locator('#ti_done > li')).toHaveCount(0);
  await expect(alice.locator('#topic_tab_done')).toHaveText('Done 0');
  await showTab(alice, 'open');
  await expect(openHeadings(alice)).toHaveText(['Spike: PDF library', 'Login with SSO', 'Export orders as CSV']);

  // delete asks once more: two items are left
  await alice.locator('#ti_open [data-ti-act="delete"]').nth(2).click();
  await alice.locator('#ti_open [data-ti-act="delete-sure"]').click();
  await expect(openHeadings(alice)).toHaveText(['Spike: PDF library', 'Login with SSO']);
  await closeMenu(alice);

  // through to the end: "Next item", then "Finish item" for the last one
  await reveal(alice, t, ids, ['three01', 'three01', 'three01']);
  await leave(alice, 'close');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Login with SSO');
  await expect(alice.locator('#ti_next_hint')).toHaveCount(0);
  await reveal(alice, t, ids, ['five001', 'five001', 'five001']);
  await expect(alice.locator('#nextitem_btn')).toHaveText('Finish item');
  await leave(alice, 'close');

  // the general mode: no active item, no topic bar; the note stays on the board
  await expect(alice.locator('#topic .ti-heading')).toHaveCount(0);
  await expect(alice.locator('.topic-bar')).toBeHidden();
  await expect(alice.locator('#board_note_text')).toHaveText('Timebox: 5 minutes per item');
  await expect(alice.locator('#nextitem_btn')).toBeHidden();
  await expect(alice.locator('#spread_est')).toBeHidden();
  await openTopics(alice);
  // nothing open: the menu starts on "Note"
  await expect(alice.locator('#topic_tab_note')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#topic_tab_open')).toHaveText('Items 0');
  await showTab(alice, 'open');
  await expect(alice.locator('#ti_open')).toHaveCount(0);
  await expect(alice.locator('#ti_add')).toBeVisible();
  await showTab(alice, 'done');
  await expect(alice.locator('#ti_done > li')).toHaveCount(2);
});

test('grip: drag with the mouse, arrow keys; "Done 0" inactive; "+ Add item" below the note (B-52 feedback)', async ({ browser }) => {
  const { alice, t } = await setup(browser, 'Topic UI Drag');
  // no items: the menu starts on "Note"; "+ Add item" below the note opens the form on "Items"
  await openTopics(alice);
  await expect(alice.locator('#topic_tab_note')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#topic_note_add')).toBeVisible();
  await alice.locator('#topic_note_add').click();
  await expect(alice.locator('#topic_tab_open')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#ti_heading')).toBeFocused();
  await fillItem(alice, 'First');
  await fillItem(alice, 'Second');
  await fillItem(alice, 'Third');
  await expect(openHeadings(alice)).toHaveText(['First', 'Second', 'Third']);

  // drag "Third" by its grip above "First": a placeholder while dragging, the order at once and on the server
  const grip = alice.locator('#ti_open .ti-grip').nth(2);
  const from = (await grip.boundingBox())!;
  const top = (await alice.locator('#ti_open .ti-it').first().boundingBox())!;
  await alice.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await alice.mouse.down();
  await alice.mouse.move(from.x + from.width / 2, top.y + 4, { steps: 12 });
  await expect(alice.locator('#ti_open .ti-drop')).toHaveCount(1);
  await expect(alice.locator('#ti_open .ti-it.dragging')).toHaveCount(1);
  await alice.mouse.up();
  await expect(alice.locator('#ti_open .ti-drop')).toHaveCount(0);
  await expect(openHeadings(alice)).toHaveText(['Third', 'First', 'Second']);
  await expect(alice.locator('#ti_open .ti-it.now .ti-h')).toHaveText('Third');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Third');
  const lists = await (await alice.request.get(`/api/get_topics.php?t=${encodeURIComponent(t)}`)).json();
  expect(lists.open.map((i: { heading: string }) => i.heading)).toEqual(['Third', 'First', 'Second']);

  // the keyboard on the grip: up at the top does nothing, down moves it one place (announced)
  await alice.locator('#ti_open .ti-grip').first().focus();
  await alice.keyboard.press('ArrowUp');
  await alice.keyboard.press('ArrowDown');
  await expect(openHeadings(alice)).toHaveText(['First', 'Third', 'Second']);
  await expect(alice.locator('#ti_open .ti-grip').nth(1)).toBeFocused();
  await expect(alice.locator('#ti_live')).toHaveText('Moved to position 2 of 3.');

  // "Done 0" is inactive; it becomes active as soon as an item is done (here: someone else, the menu open)
  const done = alice.locator('#topic_tab_done');
  await expect(done).toHaveAttribute('aria-disabled', 'true');
  const first = lists.open.find((i: { heading: string }) => i.heading === 'First').id;
  const res = await alice.request.post(`/api/topic_item_next.php?t=${encodeURIComponent(t)}&item=${first}&mode=close_empty`);
  expect(res.ok()).toBeTruthy();
  await expect(done).toHaveText('Done 1');
  await expect(done).not.toHaveAttribute('aria-disabled', 'true');
  await showTab(alice, 'done');
  // the last done item deleted: back to "Items", "Done 0" inactive again
  await alice.locator('#ti_done [data-ti-act="delete"]').click();
  await alice.locator('#ti_done [data-ti-act="delete-sure"]').click();
  await expect(done).toHaveText('Done 0');
  await expect(done).toHaveAttribute('aria-disabled', 'true');
  await expect(alice.locator('#topic_tab_open')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#topic_tab_open')).toBeFocused();
  await expect(openHeadings(alice)).toHaveText(['Third', 'Second']);
});

test('history: agreed value, rounds, date of the last round, the spread unfolds (B-52 S1b)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI History');
  await openTopics(alice);
  await fillItem(alice, 'Checkout redesign');
  await fillItem(alice, 'Second topic');
  await closeMenu(alice);
  // two rounds for the first item
  await reveal(alice, t, ids, ['three01', 'five001', 'eight01']);
  await alice.locator('#newroundbtn').click();
  await expect(alice.locator('#round_status')).not.toHaveText('revealed');
  await reveal(alice, t, ids, ['five001', 'five001', 'eight01']);
  await leave(alice, 'close');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Second topic');

  await openTopics(alice);
  await showTab(alice, 'done');
  const done = alice.locator('#ti_done > li').first();
  await expect(done.locator('.ti-h')).toHaveText('Checkout redesign');
  await expect(done.locator('.ti-res-lab')).toHaveText('agreed');
  await expect(done.locator('.ti-res-val')).toHaveText('8');
  await expect(done.locator('.ti-rounds')).toHaveText('2 rounds');
  // today, short and in the local format of the browser (the API sends ISO 8601 in UTC)
  const today = await alice.evaluate(() => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  await expect(done.locator('.ti-date')).toHaveText(today);
  // S1c: "…Z" dates are UTC, shown in the browser's time zone
  expect(await alice.evaluate(() => (0, eval)('topicDate')('2026-03-01T23:30:00Z').long))
    .toBe(await alice.evaluate(() => new Date(Date.UTC(2026, 2, 1, 23, 30)).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })));

  // the spread of the last round behind the triangle
  const toggle = done.locator('[data-ti-act="dist"]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const dist = done.locator('.ti-dist');
  await expect(dist).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(dist).toBeVisible();
  // like the spread of the results panel: a column per card of the deck (in deck order, also without votes: the
  // base line), a block per vote, the count above; the agreed value marked like the current estimate
  const deckKeys = await alice.locator('#spread_bars .spread-col').evaluateAll(cols => cols.map(col => col.getAttribute('data-card')));
  expect(deckKeys.length).toBeGreaterThan(3);
  expect(await dist.locator('.spread-col').evaluateAll(cols => cols.map(col => col.getAttribute('data-card')))).toEqual(deckKeys);
  await expect(dist.locator('.spread-col:not(.zero)')).toHaveCount(2);
  await expect(dist.locator('.spread-col[data-card="five001"] .spread-count')).toHaveText('2');
  await expect(dist.locator('.spread-col[data-card="five001"] .spread-seg')).toHaveCount(2);
  await expect(dist.locator('.spread-col[data-card="three01"]')).toHaveClass(/\bzero\b/);
  await expect(dist.locator('.spread-col[data-card="three01"] .spread-count')).toHaveText('');
  await expect(dist.locator('.spread-col.est')).toHaveCount(1);
  await expect(dist.locator('.spread-col.est')).toHaveAttribute('data-card', 'eight01');
  await expect(dist.locator('.spread-col.top')).toHaveCount(0); // the agreed value is the only accent
  // the same look: block and base line as in the spread, the columns fit the menu
  const box = (await dist.boundingBox())!;
  const menuBox = (await alice.locator('#topic_box').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(menuBox.x + menuBox.width + 1);
  const zeroBar = (await dist.locator('.spread-col[data-card="three01"] .spread-bar').boundingBox())!;
  expect(Math.round(zeroBar.height)).toBe(1);
  // the deck changed since (a card of the item no longer in it): only the played cards, in catalog order
  expect(await alice.evaluate(() => (0, eval)('topicDistColumnKeys')({ green01: 1, five001: 2, eight01: 0 }).sort()))
    .toEqual(['five001', 'green01']);
  // the keyboard closes it again
  await toggle.focus();
  await alice.keyboard.press('Enter');
  await expect(dist).toBeHidden();
  await expect(alice.locator('#ti_done [data-ti-act="dist"]').first()).toBeFocused();
});

test('get_topics.php only when topics_rev changed, done items with their tab (B-52 S1b, S1c)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI Loads');
  const add = (heading: string) => alice.request.post(`/api/topic_item_add.php?t=${encodeURIComponent(t)}`, { form: { heading } });
  expect((await add('First')).ok()).toBeTruthy();
  expect((await add('Second')).ok()).toBeTruthy();
  await alice.reload();
  const loads = countTopicLoads(alice);
  await expect(alice.locator('#topic .ti-heading')).toHaveText('First');
  // the column lives on dao.php alone
  expect(loads).toHaveLength(0);

  // items open: the menu starts on "Items" (the tab focused), loads the open items only
  await openTopics(alice);
  await expect(alice.locator('#topic_tab_open')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#topic_tab_open')).toBeFocused();
  await expect(openHeadings(alice)).toHaveText(['First', 'Second']);
  expect(loads).toHaveLength(1);
  expect(loads[0]).not.toContain('done=1');

  // a board reload without a change of the items (a card) loads no list; closed and opened again neither
  await pickCard(alice, 'five001'); // (the click on the deck closes the side panel, B-74)
  await expect(alice.locator('#round_status')).toContainText('1 of 3 voted');
  await expect(alice.locator('#topic_box')).toBeHidden();
  await openTopics(alice);
  await expect(openHeadings(alice)).toHaveText(['First', 'Second']);
  expect(loads).toHaveLength(1);

  // someone else adds an item while the menu is open: exactly one more load
  expect((await add('Third')).ok()).toBeTruthy();
  await expect(openHeadings(alice)).toHaveText(['First', 'Second', 'Third']);
  await expect(alice.locator('#topic_tab_open')).toHaveText('Items 3');
  await expect.poll(() => loads.length).toBe(2);

  // a change while the menu is closed: no load until it opens again; the done items only with their tab
  await closeMenu(alice);
  await reveal(alice, t, ids, ['three01', 'five001', 'five001']);
  await leave(alice, 'close');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Second');
  expect(loads).toHaveLength(2);
  await openTopics(alice);
  await expect(openHeadings(alice)).toHaveText(['Second', 'Third']);
  await expect(alice.locator('#topic_tab_done')).toHaveText('Done 1');
  expect(loads).toHaveLength(3);
  expect(loads[2]).not.toContain('done=1');
  // the keyboard: arrow right to "Done" (focus follows) loads it with the done items
  await alice.locator('#topic_tab_open').focus();
  await alice.keyboard.press('ArrowRight');
  await expect(alice.locator('#topic_tab_done')).toBeFocused();
  await expect(alice.locator('#topic_tab_done')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#ti_done > li')).toHaveCount(1);
  expect(loads).toHaveLength(4);
  expect(loads[3]).toContain('done=1');
  await alice.keyboard.press('ArrowLeft');
  await expect(alice.locator('#topic_tab_open')).toBeFocused();
  await alice.keyboard.press('ArrowLeft');
  await expect(alice.locator('#topic_tab_note')).toHaveAttribute('aria-selected', 'true');
  await alice.waitForTimeout(500);
  expect(loads).toHaveLength(4); // no second request for the same rev
});

test('the result: a click on a bar, the dropdown, back to auto (B-52 S1)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI Result');
  await openTopics(alice);
  await fillItem(alice, 'Rate limit');
  await closeMenu(alice);
  await reveal(alice, t, ids, ['three01', 'five001', 'five001']);

  // one item: the result is there as well (the most chosen highlight gives way to it), "Finish item"
  const est = alice.locator('#spread_bars .spread-col.est');
  await expect(est).toHaveAttribute('data-card', 'five001');
  await expect(alice.locator('#spread_bars .spread-col.top')).toHaveCount(0);
  await expect(alice.locator('#spread_est label')).toHaveText('Current estimate');
  await expect(alice.locator('#nextitem_btn')).toHaveText('Finish item');

  // a bar with votes is a button; one without votes is not
  await expect(alice.locator('#spread_bars [data-card="eight01"]')).not.toHaveAttribute('role', 'button');
  await alice.locator('#spread_bars [data-card="three01"]').click();
  await expect(est).toHaveAttribute('data-card', 'three01');
  await expect(alice.locator('#spread_est_sel')).toHaveValue('three01');
  await expect(alice.locator('#spread_est_why')).toHaveText('Picked by the team.');

  // the dropdown: also a deck card nobody played (with a value); the keyboard on a bar works too
  await alice.locator('#spread_est_sel').selectOption('thrtn01');
  await expect(alice.locator('#spread_est_sel')).toHaveValue('thrtn01');
  await expect(est).toHaveAttribute('data-card', 'thrtn01'); // its bar is marked, also without votes
  await alice.locator('#spread_bars [data-card="five001"]').focus();
  await alice.keyboard.press('Enter');
  await expect(est).toHaveAttribute('data-card', 'five001');

  // back to auto: the highest card again
  await alice.locator('#spread_est_sel').selectOption('');
  await expect(alice.locator('#spread_est_why')).toHaveText('Highest card – click a bar to pick another.');
  await expect(est).toHaveAttribute('data-card', 'five001');

  // the server has it as well
  const dao = await (await alice.request.get(`/api/dao.php?t=${encodeURIComponent(t)}&id=${ids[0]}`)).json();
  expect(dao.topic_items.active).toMatchObject({ result_card_key: 'five001', result_auto: 1 });
});

test('traffic lights: no single value, the sentence instead; done item with the spread (B-52 S1)', async ({ browser }) => {
  const { alice, url, t, ids } = await setup(browser, 'Topic UI Traffic');
  await setTeamDeck(alice, url, 'traffic');
  await openTopics(alice);
  await fillItem(alice, 'Release plan Q1 realistic?');
  await fillItem(alice, 'Second topic');
  await closeMenu(alice);
  await reveal(alice, t, ids, ['green01', 'green01', 'red0001']);

  await expect(alice.locator('#spread_note')).toHaveText('No single value for this deck – the spread is what you talk about.');
  await expect(alice.locator('#spread_est')).toBeHidden();
  await expect(alice.locator('#spread_bars .spread-col.est')).toHaveCount(0);
  await expect(alice.locator('#spread_bars [role="button"]')).toHaveCount(0);

  // the overlay for perspectives: "Close" and "Bring it back later" only
  await alice.locator('#nextitem_btn').click();
  await expect(alice.locator('#leave_item .leave-opt .leave-opt-t')).toHaveText(['Close', 'Bring it back later']);
  await expect(alice.locator('#leave_item .leave-opt').first()).toBeFocused();
  await alice.keyboard.press('Enter');
  await expect(alice.locator('#leave_item')).toBeHidden();
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Second topic');
  await openTopics(alice);
  await showTab(alice, 'done');
  const done = alice.locator('#ti_done > li').first();
  await expect(done.locator('.ti-res-val, .ti-res-lab')).toHaveCount(0); // no agreed value
  await expect(done.locator('.ti-rounds')).toHaveText('1 round');
  await done.locator('[data-ti-act="dist"]').click();
  // every light of the deck, the two played ones with their votes; no agreed value: the most chosen as in the spread
  await expect(done.locator('.ti-dist .spread-col')).toHaveCount(await alice.locator('#spread_bars .spread-col').count());
  await expect(done.locator('.ti-dist .spread-col:not(.zero)')).toHaveCount(2);
  await expect(done.locator('.ti-dist .spread-col.est')).toHaveCount(0);
  await expect(done.locator('.ti-dist .spread-col.top')).toHaveAttribute('data-card', 'green01');
});

test('maturity: set in the form, name and text in the column, unfolds after the reveal, removed again (B-52 S1)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI Maturity');
  await openTopics(alice);
  await fillItem(alice, 'Pay by invoice', 'PAY-142', 'rough');
  await expect(alice.locator('#ti_open .ti-it .mat-name')).toHaveText('rough');
  await closeMenu(alice);

  const text = 'We have a rough idea and can start asking the right questions.';
  await expect(alice.locator('#topic .ti-ext')).toHaveText('PAY-142');
  await expect(alice.locator('#topic .mat-name')).toHaveText('rough');
  await expect(alice.locator('#ti_mat_text')).toHaveText(text);
  await expect(alice.locator('#ti_mat_text')).toBeVisible();

  // results panel: the text unfolds with a click on the triangle
  await reveal(alice, t, ids, ['three01', 'three01', 'three01']);
  await expect(alice.locator('#ti_mat_text')).toBeHidden();
  await alice.locator('#ti_mat_btn').click();
  await expect(alice.locator('#ti_mat_text')).toBeVisible();
  await expect(alice.locator('#ti_mat_btn')).toHaveAttribute('aria-expanded', 'true');

  // not set: nothing is shown
  await openTopics(alice);
  await alice.locator('#ti_open [data-ti-act="edit"]').first().click();
  await expect(alice.locator('#ti_form input[name="ti_mat"][value="1"]')).toBeChecked();
  await alice.locator('#ti_form .seg label', { hasText: 'not set' }).click();
  await alice.locator('#ti_save').click();
  await expect(alice.locator('#ti_form')).toHaveCount(0);
  await closeMenu(alice);
  await expect(alice.locator('#topic .mat')).toHaveCount(0);
  await expect(alice.locator('#ti_mat_text')).toHaveCount(0);
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Pay by invoice');
});

test('the goal of an own set in the editor: agree or perspectives, saved with the set (B-52 S1b)', async ({ browser }) => {
  const { alice, url } = await setup(browser, 'Topic UI Set Goal');
  await removeExampleSet(url, alice);
  await alice.locator('#cset_btn').click();
  await alice.locator('#deck_change').click();

  // from scratch: agree on a value, one line explains it
  await alice.locator('#deck_new_set').click();
  await alice.locator('#cs_scratch').click();
  const agree = alice.locator('#cs_aim input[value="agree"]');
  const perspectives = alice.locator('#cs_aim input[value="perspectives"]');
  await expect(agree).toBeChecked();
  await expect(alice.locator('#cs_aim_help')).toHaveText('The goal is to find a value everyone can agree on.');
  await alice.locator('#cs_aim label', { hasText: 'Show perspectives' }).click();
  await expect(perspectives).toBeChecked();
  await expect(alice.locator('#cs_aim_help')).toHaveText('The goal is to make everyone\'s individual perspective visible.');
  await alice.locator('#cs_name').fill('Health');
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#cs_editor')).toBeHidden();
  await expect.poll(async () => (await alice.evaluate(() => (0, eval)('gLastJson'))).custom_sets[0]?.aim).toBe('perspectives');

  // edited: the goal is there, changed back to agree (only the goal changes: Save stores it)
  await alice.locator('#deck_own_sets .cs-edit').click();
  await expect(perspectives).toBeChecked();
  await alice.locator('#cs_aim label', { hasText: 'Agree on a value' }).click();
  await alice.locator('#cs_save').click();
  await expect(alice.locator('#cs_editor')).toBeHidden();
  await expect.poll(async () => (await alice.evaluate(() => (0, eval)('gLastJson'))).custom_sets[0]?.aim).toBe('agree');

  // a copy of traffic lights (a built-in set without a single value) starts with perspectives
  await alice.locator('#deck_new_set').click();
  await alice.locator('#cs_from [data-group="traffic"]').click();
  await expect(perspectives).toBeChecked();
});

test('leaving an item always asks: suggestion, Enter, Cancel, Escape, click beside, all three modes (B-52 S1c)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI Leave');
  await openTopics(alice);
  await fillItem(alice, 'Alpha');
  await fillItem(alice, 'Beta');
  await fillItem(alice, 'Gamma');
  await closeMenu(alice);
  await reveal(alice, t, ids, ['three01', 'five001', 'eight01']);
  const dialog = alice.locator('#leave_item');
  const options = dialog.locator('.leave-opt');

  // also with a value the team picked: the overlay comes, the current estimate is the suggestion (focused)
  await alice.locator('#spread_bars [data-card="five001"]').click();
  await expect(alice.locator('#spread_est_sel')).toHaveValue('five001');
  await alice.locator('#nextitem_btn').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h2')).toHaveText('How do you want to leave this item?');
  await expect(alice.locator('#leave_item_heading')).toHaveText('Alpha');
  await expect(dialog.locator('.leave-opt-t')).toHaveText(['Close with 5', 'Close without a value', 'Bring it back later']);
  await expect(options.first()).toBeFocused();
  await expect(options.first()).toHaveClass(/primary/);

  // Cancel, Escape and a click beside the box: nothing happens, the focus is back on the button
  await dialog.locator('#leave_item_cancel').click();
  await expect(dialog).toBeHidden();
  await expect(alice.locator('#nextitem_btn')).toBeFocused();
  await alice.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(alice.locator('#nextitem_btn')).toBeFocused();
  await alice.locator('#nextitem_btn').click();
  await alice.mouse.click(10, 400);
  await expect(dialog).toBeHidden();
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Alpha');
  await expect(alice.locator('#round_status')).toHaveText('revealed');

  // the focus stays inside (Tab from the last control goes round to the first)
  await alice.locator('#nextitem_btn').click();
  await alice.locator('#leave_item_cancel').focus();
  await alice.keyboard.press('Tab');
  await expect(options.first()).toBeFocused();
  await alice.keyboard.press('Shift+Tab');
  await expect(alice.locator('#leave_item_cancel')).toBeFocused();
  // the arrow keys move between the choices; Enter on the suggestion closes with 5
  await options.first().focus();
  await alice.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toBeFocused();
  await alice.keyboard.press('ArrowUp');
  await expect(options.first()).toBeFocused();
  await alice.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Beta');
  await expect(alice.locator('#round_status')).not.toHaveText('revealed');

  // "Bring it back later": stays open, goes to the end; a new round
  await reveal(alice, t, ids, ['three01', 'three01', 'eight01']);
  await alice.locator('#nextitem_btn').click();
  await expect(options.first().locator('.leave-opt-t')).toHaveText('Close with 8'); // the highest card (auto)
  await alice.locator('#leave_item .leave-opt[data-mode="later"]').click();
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Gamma');
  await expect(alice.locator('#round_status')).not.toHaveText('revealed');
  await openTopics(alice);
  await expect(openHeadings(alice)).toHaveText(['Gamma', 'Beta']);
  await closeMenu(alice);

  // "Close without a value": done without an agreed value
  await reveal(alice, t, ids, ['three01', 'five001', 'eight01']);
  await leave(alice, 'close_empty');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Beta');
  await openTopics(alice);
  await showTab(alice, 'done');
  await expect(alice.locator('#ti_done > li .ti-h')).toHaveText(['Gamma', 'Alpha']);
  await expect(alice.locator('#ti_done > li').first().locator('.ti-res-val')).toHaveCount(0);
  await expect(alice.locator('#ti_done > li').nth(1).locator('.ti-res-val')).toHaveText('5');
  await closeMenu(alice);

  // the last one: "Finish item"; Beta kept its rounds from before "later"
  await reveal(alice, t, ids, ['five001', 'five001', 'five001']);
  await expect(alice.locator('#nextitem_btn')).toHaveText('Finish item');
  await leave(alice, 'close');
  await expect(alice.locator('.topic-bar')).toBeHidden();
});

test('no card with a value (only infinity): the overlay offers no "Close with" (B-52 S1c)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI Leave Infinity');
  await openTopics(alice);
  await fillItem(alice, 'Only coffee');
  await closeMenu(alice);
  await reveal(alice, t, ids, ['infin01', 'infin01', 'infin01']);
  await alice.locator('#nextitem_btn').click();
  await expect(alice.locator('#leave_item .leave-opt-t')).toHaveText(['Close without a value', 'Bring it back later']);
  await expect(alice.locator('#leave_item .leave-opt').first()).toBeFocused();
  await alice.keyboard.press('Escape');
});

test('the rail: item marker, "next item" / "new round" split only after the reveal with an item; the note stays (B-52 S1c)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI Rail');
  const ctx = alice.locator('.container');
  await alice.request.post(`/api/update_topic.php?t=${encodeURIComponent(t)}`, { form: { topic: 'Timebox: 5 minutes' } });
  await alice.locator('#side_collapse').click();
  await expect(ctx).toHaveClass(/side-collapsed/);
  await alice.mouse.move(200, 300);
  // the note stays on the board with the column collapsed
  await expect(alice.locator('#board_note_text')).toHaveText('Timebox: 5 minutes');
  await expect(alice.locator('#board_note')).toBeVisible();
  // no item: no marker, revealed: the round button alone as before
  await expect(alice.locator('#rail_item')).toBeHidden();
  await reveal(alice, t, ids, ['three01', 'three01', 'three01']);
  // the state is kept per phase: collapse the results panel as well
  await alice.locator('#side_collapse').click();
  await expect(ctx).toHaveClass(/side-collapsed/);
  await alice.mouse.move(200, 300);
  await expect(alice.locator('#rail_round')).toBeVisible();
  await expect(alice.locator('#rail_next')).toBeHidden();
  await expect(alice.locator('#rail_acts')).not.toHaveClass(/split/);
  await alice.locator('#rail_round').click();
  await expect(alice.locator('#round_status')).not.toHaveText('revealed');

  for (const heading of ['One', 'Two']) {
    expect((await alice.request.post(`/api/topic_item_add.php?t=${encodeURIComponent(t)}`, { form: { heading } })).ok()).toBeTruthy();
  }
  // voting: the marker "1/2", no split
  await expect(alice.locator('#rail_item')).toBeVisible();
  await expect(alice.locator('#rail_item_pos')).toHaveText('1/2');
  await expect(alice.locator('#rail_item')).toContainText('item');
  await expect(alice.locator('#rail_next')).toBeHidden();
  // a click on the marker opens the column over the table
  await alice.locator('#rail_item').click();
  await expect(ctx).toHaveClass(/side-peek/);
  await expect(alice.locator('#topic .ti-heading')).toHaveText('One');
  await alice.keyboard.press('Escape');
  await expect(ctx).not.toHaveClass(/side-peek/);
  await alice.mouse.move(200, 300);

  // revealed: one block, "next item" over "new round", each labelled inside the button
  await reveal(alice, t, ids, ['three01', 'five001', 'five001']);
  await expect(alice.locator('#rail_acts')).toHaveClass(/split/);
  await expect(alice.locator('#rail_next')).toBeVisible();
  await expect(alice.locator('#rail_next')).toHaveAttribute('aria-label', 'Next item');
  await expect(alice.locator('#rail_next .rail-lbl')).toHaveText('next item');
  await expect(alice.locator('#rail_round .rail-lbl')).toBeVisible();
  await expect(alice.locator('#rail_round .rail-lbl')).toHaveText('new round');
  const next = (await alice.locator('#rail_next').boundingBox())!;
  const round = (await alice.locator('#rail_round').boundingBox())!;
  expect(Math.abs(next.height - round.height)).toBeLessThan(1);
  expect(Math.abs(next.width - round.width)).toBeLessThan(1);
  expect(next.y).toBeLessThan(round.y);

  // "next item" asks as well; Escape keeps the column collapsed and closed
  await alice.locator('#rail_next').click();
  await expect(alice.locator('#leave_item')).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(alice.locator('#leave_item')).toBeHidden();
  await expect(alice.locator('#rail_next')).toBeFocused();
  await leave(alice, 'close', '#rail_next');
  await expect(alice.locator('#rail_item_pos')).toHaveText('1/1');
  await expect(alice.locator('#rail_next')).toBeHidden();

  // the last item: "finish item"
  await reveal(alice, t, ids, ['eight01', 'eight01', 'eight01']);
  await expect(alice.locator('#rail_next')).toHaveAttribute('aria-label', 'Finish item');
  await expect(alice.locator('#rail_next .rail-lbl')).toHaveText('finish item');
  await expect(ctx).toHaveClass(/side-collapsed/);
});

test('phone: the note above the cards, the item in the strip, the overlay from the dock (B-52 S1c)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 390, height: 844 } });
  const url = await createTeam(alice, 'Topic UI Phone');
  const t = new URL(url).searchParams.get('t') as string;
  const ids = await addPlayersViaApi(alice, url, ['Ann', 'Ben']);
  await joinAsPlayer(alice, url, 'Alice');
  await alice.request.post(`/api/update_topic.php?t=${encodeURIComponent(t)}`, { form: { topic: 'Timebox: 5 minutes per item' } });
  for (const heading of ['Phone item', 'Second']) {
    expect((await alice.request.post(`/api/topic_item_add.php?t=${encodeURIComponent(t)}`, { form: { heading } })).ok()).toBeTruthy();
  }
  await expect(alice.locator('#board_note_text')).toHaveText('Timebox: 5 minutes per item');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Phone item');
  const strip = (await alice.locator('.topic-bar').boundingBox())!;
  const note = (await alice.locator('#board_note').boundingBox())!;
  expect(strip.y + strip.height).toBeLessThanOrEqual(note.y + 1);
  expect(note.y + note.height).toBeLessThanOrEqual((await alice.locator('#cbox').boundingBox())!.y);

  // the menu (bottom sheet) on "Open"
  await alice.locator('#menu_btn').click();
  await alice.locator('#menu_index [data-open="topic"]').click();
  await expect(alice.locator('#topic_tab_open')).toHaveAttribute('aria-selected', 'true');
  await expect(openHeadings(alice)).toHaveText(['Phone item', 'Second']);
  await alice.locator('#menu_close').click();

  await reveal(alice, t, ids, ['three01', 'five001', 'five001']);
  await expect(alice.locator('#nextitem_btn')).toBeVisible();
  await alice.locator('#nextitem_btn').tap().catch(() => alice.locator('#nextitem_btn').click());
  await expect(alice.locator('#leave_item')).toBeVisible();
  const box = (await alice.locator('#leave_item').boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(844); // a sheet at the bottom
  await alice.locator('#leave_item .leave-opt[data-mode="close"]').click();
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Second');
});

test('done items without pen; the red "Delete" cancels on a click beside it, Escape and a tab change (B-52)', async ({ browser }) => {
  const { alice, t } = await setup(browser, 'Topic UI Delete Confirm');
  await openTopics(alice);
  await fillItem(alice, 'First');
  await fillItem(alice, 'Second');
  await fillItem(alice, 'Third');
  const trash = (i: number) => alice.locator('#ti_open [data-ti-act="delete"]').nth(i);
  const sure = alice.locator('#topic_box [data-ti-act="delete-sure"]');

  // a click beside it (an empty spot of the menu): back to the trash can, nothing deleted, the menu stays open
  await trash(1).click();
  await expect(sure).toBeVisible();
  await alice.locator('#topic_panel_open').click({ position: { x: 4, y: 4 } });
  await expect(sure).toHaveCount(0);
  await expect(trash(1)).toBeFocused();
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(openHeadings(alice)).toHaveText(['First', 'Second', 'Third']);

  // Escape: cancels, the menu stays open
  await trash(1).click();
  await expect(sure).toBeFocused();
  await alice.keyboard.press('Escape');
  await expect(sure).toHaveCount(0);
  await expect(trash(1)).toBeFocused();
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(openHeadings(alice)).toHaveText(['First', 'Second', 'Third']);

  // a tab change: cancels; back on "Items" the trash can again
  await trash(1).click();
  await expect(sure).toBeVisible();
  await showTab(alice, 'note');
  await showTab(alice, 'open');
  await expect(sure).toHaveCount(0);
  await expect(openHeadings(alice)).toHaveText(['First', 'Second', 'Third']);

  // confirming still deletes
  await trash(1).click();
  await sure.click();
  await expect(openHeadings(alice)).toHaveText(['First', 'Third']);

  // a done item: no pen, delete and reopen stay; Escape cancels there too
  const lists = await (await alice.request.get(`/api/get_topics.php?t=${encodeURIComponent(t)}`)).json();
  const first = lists.open.find((i: { heading: string }) => i.heading === 'First').id;
  const res = await alice.request.post(`/api/topic_item_next.php?t=${encodeURIComponent(t)}&item=${first}&mode=close_empty`);
  expect(res.ok()).toBeTruthy();
  await expect(alice.locator('#topic_tab_done')).toHaveText('Done 1');
  await showTab(alice, 'done');
  const done = alice.locator('#ti_done > li').first();
  await expect(done.locator('.ti-h')).toHaveText('First');
  await expect(done.locator('[data-ti-act="edit"]')).toHaveCount(0);
  await expect(done.locator('[data-ti-act="reopen"]')).toBeVisible();
  const doneTrash = done.locator('[data-ti-act="delete"]');
  await doneTrash.click();
  await expect(sure).toBeFocused();
  await alice.keyboard.press('Escape');
  await expect(sure).toHaveCount(0);
  await expect(doneTrash).toBeFocused();
  await expect(alice.locator('#topic_box')).toBeVisible();
  // and a click beside it
  await doneTrash.click();
  await expect(sure).toBeVisible();
  await alice.locator('#topic_panel_done').click({ position: { x: 4, y: 4 } });
  await expect(sure).toHaveCount(0);
  await expect(doneTrash).toBeFocused();
  await expect(alice.locator('#ti_done > li')).toHaveCount(1);
});

test('done items export: Copy as a tab separated table, Download CSV; all items, oldest first, formulas defused (B-52)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP, permissions: ['clipboard-read', 'clipboard-write'] });
  const url = await createTeam(alice, 'Topic UI Export');
  const t = new URL(url).searchParams.get('t') as string;
  const ids = await addPlayersViaApi(alice, url, ['Ann', 'Ben']);
  await joinAsPlayer(alice, url, 'Alice');
  const tq = encodeURIComponent(t);
  const add = async (form: Record<string, string>, query = '') => {
    expect((await alice.request.post(`/api/topic_item_add.php?t=${tq}&at=end${query}`, { form })).ok()).toBeTruthy();
  };
  await add({ ext_id: 'PROJ-1', heading: 'Login, "quick"', description: 'First line\n- second, with a comma' }, '&maturity=2');
  await add({ heading: '=SUM(A1:A2)', description: '-1 is a formula too' });
  await add({ ext_id: '@me', heading: '+plus' });
  await add({ heading: 'Four' });
  await add({ heading: 'Five' });
  const activeId = async () => (await (await alice.request.get(`/api/get_topics.php?t=${tq}`)).json()).open[0].id;
  // the first one with a round (agreed 5), the others closed through the API: with a card or without a value
  await reveal(alice, t, ids, ['five001', 'five001', 'three01']);
  const close = async (query: string) => {
    expect((await alice.request.post(`/api/topic_item_next.php?t=${tq}&item=${await activeId()}&${query}`)).ok()).toBeTruthy();
  };
  await close('mode=close&card=five001');
  await close('mode=close_empty');
  await close('mode=close&card=eight01');
  await close('mode=close_empty');
  await close('mode=close_empty');
  await expect(alice.locator('#topic_tab_done')).toHaveText('Done 5');

  // rounds and date of the first item as the API has them (the date in local time, YYYY-MM-DD)
  const first = (await (await alice.request.get(`/api/get_topics.php?t=${tq}&done=1`)).json()).done
    .find((i: { heading: string }) => i.heading.startsWith('Login'));
  const day = await alice.evaluate(value => {
    const d = new Date(value);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }, first.last_round_date);
  const rows = [
    ['ID', 'Heading', 'Description', 'Agreed value', 'Rounds', 'Last round', 'Maturity'],
    ['PROJ-1', 'Login, "quick"', 'First line\n- second, with a comma', '5', String(first.rounds_cnt), day, 'shaping'],
    ['', "'=SUM(A1:A2)", "'-1 is a formula too", '', '0', '', ''],
    ["'@me", "'+plus", '', '8', '0', '', ''],
    ['', 'Four', '', '', '0', '', ''],
    ['', 'Five', '', '', '0', '', ''],
  ];
  const quote = (cell: string, sep: string) =>
    cell.includes(sep) || /["\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
  const table = (sep: string) => rows.map(row => row.map(cell => quote(cell, sep)).join(sep)).join('\r\n') + '\r\n';

  // the export pages through get_topics.php (here 2 per page, so every item comes from a later page too)
  const pages: string[] = [];
  await alice.route(/\/api\/get_topics\.php\?.*done_limit=/, route => {
    const u = new URL(route.request().url());
    u.searchParams.set('done_limit', '2');
    pages.push(u.searchParams.get('done_offset') as string);
    return route.continue({ url: u.toString() });
  });

  await openTopics(alice);
  await showTab(alice, 'done');
  await expect(alice.locator('#ti_done > li')).toHaveCount(5);
  const copy = alice.locator('#ti_export_copy');
  const csv = alice.locator('#ti_export_csv');
  await expect(copy).toBeVisible();
  await expect(copy).toHaveText('Copy');
  await expect(csv).toHaveText('Download CSV');
  // below the list
  expect((await copy.boundingBox())!.y).toBeGreaterThan((await alice.locator('#ti_done').boundingBox())!.y);

  await copy.click();
  await expect(alice.locator('#toast')).toHaveText('Copied 5 items');
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toBe(table('\t'));
  expect(pages).toEqual(['0', '2', '4']);

  pages.length = 0;
  const [download] = await Promise.all([alice.waitForEvent('download'), csv.click()]);
  const name = 'topics-' + await alice.evaluate(() => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }) + '.csv';
  expect(download.suggestedFilename()).toBe(name);
  const bytes = fs.readFileSync(await download.path());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
  expect(bytes.subarray(3).toString('utf8')).toBe(table(','));
  await expect(alice.locator('#toast')).toHaveText(`Downloaded ${name} (5 items)`);
  expect(pages).toEqual(['0', '2', '4']);
  // the done list itself is not affected
  await expect(alice.locator('#ti_done > li')).toHaveCount(5);
});

test('done items export: no buttons without done items (B-52)', async ({ browser }) => {
  const { alice, t } = await setup(browser, 'Topic UI Export Empty');
  expect((await alice.request.post(`/api/topic_item_add.php?t=${encodeURIComponent(t)}`, { form: { heading: 'Open' } })).ok()).toBeTruthy();
  await openTopics(alice);
  await expect(alice.locator('#topic_tab_done')).toHaveAttribute('aria-disabled', 'true');
  await expect(alice.locator('#ti_export_copy, #ti_export_csv')).toHaveCount(0);
});
