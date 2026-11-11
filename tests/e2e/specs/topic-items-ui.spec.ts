import { test, expect, Page, Browser } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, addPlayersViaApi, pickCard, setTeamDeck } from './helpers';

/**
 * B-52 S1 (script/topics.js): the topic list on the board.
 * - One topic as before: the menu has the one field (plus a quiet "+ next item"), the column shows the text as before.
 * - More items: the list in the menu (open with "now" on top, done), move with the arrow buttons (keyboard), the
 *   column shows the active item and "+N more · next: …". After the reveal "Next item" next to "New round".
 * - Result: the highest card is marked in the spread; a click on a bar with votes or the dropdown changes it.
 *   Traffic lights (deck aim 'perspectives'): no mark, no dropdown, one sentence instead.
 * - Maturity: set in the item form; in the voting panel name and text, in the results panel the text unfolds
 *   with a click on the triangle; "not set" shows nothing.
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

async function closeMenu(page: Page) {
  await page.locator('#menu_close').click();
  await expect(page.locator('#topic_box')).toBeHidden();
}

/** adds an item with the form of the list ("Add item" or the open form of "+ next item") */
async function fillItem(page: Page, heading: string, extId = '', maturity = '') {
  if (await page.locator('#ti_form').count() === 0) await page.locator('#ti_add').click();
  await page.locator('#ti_ext').fill(extId);
  await page.locator('#ti_heading').fill(heading);
  if (maturity !== '') await page.locator('#ti_form .seg label', { hasText: maturity }).click();
  await page.locator('#ti_save').click();
  await expect(page.locator('#ti_form')).toHaveCount(0);
}

const openHeadings = (page: Page) => page.locator('#ti_open .ti-it .ti-h');

test('one topic as before: the field, the text in the column, no list (B-52 S1)', async ({ browser }) => {
  const { alice } = await setup(browser, 'Topic UI Simple');
  await openTopics(alice);
  await expect(alice.locator('#topic_txt')).toBeFocused();
  await expect(alice.locator('#topic_add_next')).toBeVisible();
  await expect(alice.locator('#topic_list')).toBeHidden();
  await alice.locator('#topic_txt').fill('PAY-142 pay by invoice\nwith **details**');
  await alice.locator('#topic_save').click();
  await expect(alice.locator('#topic_box')).toBeHidden();

  // the column: as before (markdown of the text), label "topic", no item parts
  await expect(alice.locator('#topic')).toContainText('PAY-142 pay by invoice');
  await expect(alice.locator('#topic strong')).toHaveText('details');
  await expect(alice.locator('.topic-label')).toHaveText('topic');
  await expect(alice.locator('#topic .ti-heading, #ti_next_hint')).toHaveCount(0);

  // opened again: still the one field with the text
  await openTopics(alice);
  await expect(alice.locator('#topic_txt')).toHaveValue('PAY-142 pay by invoice\nwith **details**');
  await expect(alice.locator('#topic_list')).toBeHidden();
});

test('several items: add, move with the keyboard, next item, done list with the result (B-52 S1)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI List');
  await openTopics(alice);
  await alice.locator('#topic_txt').fill('Login with SSO');
  // "+ next item" saves the text first and opens the form for the next one
  await alice.locator('#topic_add_next').click();
  await expect(alice.locator('#ti_heading')).toBeFocused();
  await fillItem(alice, 'Export orders as CSV', 'PAY-150');
  await fillItem(alice, 'Spike: PDF library');
  await expect(openHeadings(alice)).toHaveText(['Login with SSO', 'Export orders as CSV', 'Spike: PDF library']);
  await expect(alice.locator('#ti_open .ti-it.now .ti-tag')).toHaveText('now');

  // move the third one up with the keyboard (focus stays on the moved item's button)
  const up = alice.locator('#ti_open [data-ti-act="up"]').nth(2);
  await up.focus();
  await alice.keyboard.press('Enter');
  await expect(openHeadings(alice)).toHaveText(['Login with SSO', 'Spike: PDF library', 'Export orders as CSV']);
  await expect(alice.locator('#ti_open [data-ti-act="up"]').nth(1)).toBeFocused();
  await closeMenu(alice);

  // the column: the active item and what comes next
  await expect(alice.locator('.topic-label')).toHaveText('item 1 of 3');
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Login with SSO');
  await expect(alice.locator('#ti_next_hint')).toHaveText('+2 more · next: Spike: PDF library');
  await alice.locator('#ti_next_hint').click();
  await expect(alice.locator('#topic_list')).toBeVisible();
  await closeMenu(alice);

  // no "Next item" before the reveal
  await expect(alice.locator('#nextitem_btn')).toBeHidden();
  await reveal(alice, t, ids, ['three01', 'five001', 'eight01']);
  await expect(alice.locator('#nextitem_btn')).toBeVisible();
  await expect(alice.locator('#newroundbtn')).toHaveValue('New round');
  // the highest card is the result
  await expect(alice.locator('#spread_bars .spread-col.est')).toHaveAttribute('data-card', 'eight01');
  await expect(alice.locator('#spread_est_sel')).toHaveValue('eight01');

  await alice.locator('#nextitem_btn').click();
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Spike: PDF library');
  await expect(alice.locator('.topic-label')).toHaveText('item 1 of 2');
  await expect(alice.locator('#round_status')).not.toHaveText('revealed'); // a new round
  await expect(alice.locator('#nextitem_btn')).toBeHidden();

  await openTopics(alice);
  await expect(openHeadings(alice)).toHaveText(['Spike: PDF library', 'Export orders as CSV']);
  const done = alice.locator('#ti_done > li');
  await expect(done).toHaveCount(1);
  await expect(done.first()).toContainText('Login with SSO');
  await expect(done.first().locator('.ti-res-val')).toHaveText('8');

  // reopen: right after the active item
  await done.first().locator('[data-ti-act="reopen"]').click();
  await expect(openHeadings(alice)).toHaveText(['Spike: PDF library', 'Login with SSO', 'Export orders as CSV']);
  await expect(alice.locator('#ti_done > li')).toHaveCount(0);

  // delete asks once more
  await alice.locator('#ti_open [data-ti-act="delete"]').nth(2).click();
  await alice.locator('#ti_open [data-ti-act="delete-sure"]').click();
  await expect(openHeadings(alice)).toHaveText(['Spike: PDF library', 'Login with SSO']);
});

test('the result: a click on a bar, the dropdown, back to auto (B-52 S1)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI Result');
  await openTopics(alice);
  await alice.locator('#topic_txt').fill('Rate limit');
  await alice.locator('#topic_save').click();
  await reveal(alice, t, ids, ['three01', 'five001', 'five001']);

  // one item: the result is there as well (the most chosen highlight gives way to it), no "Next item"
  const est = alice.locator('#spread_bars .spread-col.est');
  await expect(est).toHaveAttribute('data-card', 'five001');
  await expect(alice.locator('#spread_bars .spread-col.top')).toHaveCount(0);
  await expect(alice.locator('#spread_est label')).toHaveText('Current estimate');
  await expect(alice.locator('#nextitem_btn')).toBeHidden();

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
  expect(dao.topic_items.open[0]).toMatchObject({ result_card_key: 'five001', result_auto: 1 });
});

test('traffic lights: no single value, the sentence instead; done item with the spread (B-52 S1)', async ({ browser }) => {
  const { alice, url, t, ids } = await setup(browser, 'Topic UI Traffic');
  await setTeamDeck(alice, url, 'traffic');
  await openTopics(alice);
  await alice.locator('#topic_add_next').click();
  await fillItem(alice, 'Release plan Q1 realistic?');
  await fillItem(alice, 'Second topic');
  await closeMenu(alice);
  await reveal(alice, t, ids, ['green01', 'green01', 'red0001']);

  await expect(alice.locator('#spread_note')).toHaveText('No single value for this deck – the spread is what you talk about.');
  await expect(alice.locator('#spread_est')).toBeHidden();
  await expect(alice.locator('#spread_bars .spread-col.est')).toHaveCount(0);
  await expect(alice.locator('#spread_bars [role="button"]')).toHaveCount(0);

  await alice.locator('#nextitem_btn').click();
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Second topic');
  await openTopics(alice);
  const done = alice.locator('#ti_done > li').first();
  await expect(done.locator('.ti-res-val')).toHaveCount(0);
  await expect(done.locator('.ti-dist-col')).toHaveCount(2);
  await expect(done.locator('.ti-res-lab')).toHaveText('spread');
});

test('maturity: set in the form, name and text in the column, unfolds after the reveal, removed again (B-52 S1)', async ({ browser }) => {
  const { alice, t, ids } = await setup(browser, 'Topic UI Maturity');
  await openTopics(alice);
  await alice.locator('#topic_add_next').click();
  await fillItem(alice, 'Pay by invoice', 'PAY-142', 'rough');
  // one item with a maturity: the list (not the simple field) when the menu opens again
  await closeMenu(alice);
  await openTopics(alice);
  await expect(alice.locator('#topic_list')).toBeVisible();
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
  await expect(alice.locator('#topic .ti-heading')).toHaveText('Pay by invoice'); // ID still there: item view
});
