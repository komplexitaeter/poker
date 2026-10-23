import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, expectTableCard, teamWithTwoPlayers } from './helpers';

/**
 * B-51: one menu (dialog#menu) with one section per area.
 * Large screens: the header buttons open their section directly in a side panel (non-modal); a click
 * on the table does not close it, the button of the open section, the close button and Escape do,
 * and the focus goes back to the button. No back button.
 * Phones: the menu button opens the index as a modal bottom sheet; sections have a back button;
 * the backdrop closes it.
 * Pull updates (another player) neither close the panel nor take the focus or overwrite fields.
 */
const PHONE = { width: 375, height: 800 };
const menu = (page: Page) => page.locator('dialog#menu');
const isModal = (page: Page) => menu(page).evaluate(el => el.matches(':modal'));

test('large screen: the side panel opens and closes by click and Escape, the focus goes back (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Menu Desk');
  await joinAsPlayer(alice, url, 'Alice');

  const topicBtn = alice.locator('#topic_btn');
  const csetBtn = alice.locator('#cset_btn');

  await topicBtn.click();
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  expect(await isModal(alice)).toBe(false);
  await expect(alice.locator('#menu_title')).toHaveText('Topic');
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(alice.locator('#cset_box')).toBeHidden();
  await expect(alice.locator('#menu_back')).toBeHidden(); // no way back to an index on large screens
  await expect(topicBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(alice.locator('#topic_txt')).toBeFocused();

  // the panel sits on the right and covers the table, not the deck
  const panel = (await menu(alice).boundingBox())!;
  const deck = (await alice.locator('#ctl').boundingBox())!;
  expect(Math.round(panel.x + panel.width)).toBe(1280);
  expect(panel.y + panel.height).toBeLessThanOrEqual(deck.y + 1);

  // a click on the table and a card from the deck do not close it
  await alice.locator('#table').click({ position: { x: 20, y: 20 } });
  await pickCard(alice, 'three01');
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();

  // another header button switches the section in place
  await csetBtn.click();
  await expect(alice.locator('#menu_title')).toHaveText('Board settings');
  await expect(alice.locator('#cset_box')).toBeVisible();
  await expect(alice.locator('#topic_box')).toBeHidden();
  await expect(csetBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(topicBtn).toHaveAttribute('aria-expanded', 'false');
  expect((await menu(alice).boundingBox())!.x).toBe(panel.x); // the panel does not move

  // the button of the open section closes it
  await csetBtn.click();
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(csetBtn).toHaveAttribute('aria-expanded', 'false');

  // Enter opens, Escape closes, the focus is back on the button
  await alice.locator('#user_settings_btn').press('Enter');
  await expect(alice.locator('#user_settings_box')).toBeVisible();
  await expect(alice.locator('#cet_usr_name')).toBeFocused();
  await expect(alice.locator('#cet_usr_name')).toHaveValue('Alice');
  await alice.keyboard.press('Escape');
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(alice.locator('#user_settings_btn')).toBeFocused();

  // the close button
  await alice.locator('#feedback_btn').click();
  await expect(alice.locator('#feedback_txt')).toBeFocused();
  await alice.locator('#menu_close').click();
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(alice.locator('#feedback_btn')).toBeFocused();
  await expect(alice.locator('#feedback_btn')).toHaveAttribute('aria-expanded', 'false');
});

test('phone: index, section, back, close; the backdrop closes the sheet (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE });
  const url = await createTeam(alice, 'Menu Phone');
  await joinAsPlayer(alice, url, 'Alice');

  const menuBtn = alice.locator('#menu_btn');
  const index = alice.locator('#menu_index');
  const back = alice.locator('#menu_back');

  await menuBtn.click();
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  expect(await isModal(alice)).toBe(true);
  await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(alice.locator('#menu_title')).toHaveText('Menu');
  await expect(index).toBeVisible();
  await expect(back).toBeHidden();

  // into a section
  await index.getByRole('button', { name: /^Board settings/ }).click();
  await expect(alice.locator('#menu_title')).toHaveText('Board settings');
  await expect(alice.locator('#cset_box')).toBeVisible();
  await expect(index).toBeHidden();
  await expect(back).toBeVisible();
  await expect(alice.locator('#cet_pre')).toBeFocused();

  // back to the index, the focus on the entry we came from
  await back.click();
  await expect(index).toBeVisible();
  await expect(alice.locator('#cset_box')).toBeHidden();
  await expect(alice.locator('#menu_title')).toHaveText('Menu');
  await expect(index.getByRole('button', { name: /^Board settings/ })).toBeFocused();

  // close: the focus goes back to the menu button
  await alice.locator('#menu_close').click();
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
  await expect(menuBtn).toBeFocused();

  // a tap on the backdrop (above the sheet) closes it
  await menuBtn.click();
  await expect(index).toBeVisible();
  await alice.mouse.click(180, 20);
  await expect(menu(alice)).not.toHaveAttribute('open');

  // switching to the large layout closes an open sheet
  await menuBtn.click();
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await alice.setViewportSize({ width: 1280, height: 900 });
  await expect(menu(alice)).not.toHaveAttribute('open');
});

test('the panel stays open on a pull update of another player, keeps focus and unsaved input (B-51)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Menu Pull');

  await alice.locator('#topic_btn').click();
  await alice.locator('#topic_txt').pressSequentially('half written');
  await expect(alice.locator('#topic_save')).toBeEnabled();

  // Bob picks a card and renames the team: Alice's board updates (pull)
  await pickCard(bob, 'five001');
  await expectTableCard(alice, 'Bob', 'done001');
  await bob.locator('#cset_btn').click();
  await bob.locator('#cset_box details[data-grp="team"] > summary').click();
  await bob.locator('#cet_team_name').fill('Menu Pull 2');
  await bob.locator('#cet_change_name').click();
  await expect(alice.locator('#team_name')).toHaveText('Menu Pull 2');

  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(alice.locator('#topic_txt')).toBeFocused();
  await expect(alice.locator('#topic_txt')).toHaveValue('half written');

  // the summary of the closed group "Team" follows the update
  await alice.locator('#cset_btn').click();
  await expect(alice.locator('#cset_sum_team')).toHaveText('Menu Pull 2');
});

test('board settings: one group always open, summaries, card switches (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Menu Groups');
  await joinAsPlayer(alice, url, 'Alice');

  await alice.locator('#cset_btn').click();
  const deck = alice.locator('#cset_box details[data-grp="deck"]');
  const results = alice.locator('#cset_box details[data-grp="results"]');
  await expect(deck).toHaveAttribute('open');
  await expect(alice.locator('#cset_sum_results')).toHaveText('names shown · by value · pointer off');
  await expect(alice.locator('#cset_sum_team')).toHaveText('Menu Groups');
  const deckSummary = alice.locator('#cset_sum_deck');
  await expect(deckSummary).toHaveText(/^\d+ of \d+ cards$/);
  const cardsOn = parseInt((await deckSummary.textContent())!, 10);

  // the open group cannot be closed, another one replaces it
  await deck.locator('summary').click();
  await expect(deck).toHaveAttribute('open');
  await results.locator('summary').click();
  await expect(results).toHaveAttribute('open');
  await expect(deck).not.toHaveAttribute('open');
  await results.locator('summary').click();
  await expect(results).toHaveAttribute('open');

  // results: the summary follows the switches
  await alice.locator('input[name=cet_dark_side][value="1"]').check();
  await expect(alice.locator('#cset_sum_results')).toHaveText('names shown · by value · pointer on');

  // deck: the card thumbnails are switches (aria-pressed), the summary counts the cards
  await deck.locator('summary').click();
  const three = alice.locator('#_three01');
  await expect(three).toHaveAttribute('aria-pressed', 'true');
  await three.click();
  await expect(three).toHaveAttribute('aria-pressed', 'false');
  await expect(alice.locator('#ctl img#three01')).toHaveClass(/\boff\b/);
  await expect(deckSummary).toHaveText(new RegExp(`^${cardsOn - 1} of \\d+ cards$`));
});

test('invite: board link, one QR code that shows large and resets with Escape (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Menu Invite');
  await joinAsPlayer(alice, url, 'Alice');

  const measured: string[] = [];
  alice.on('request', r => {
    if (r.url().includes('/api/measure_event.php')) measured.push(new URL(r.url()).searchParams.get('event_code') ?? '');
  });

  // the team name in the header opens "Invite" as well
  await alice.locator('.team-name').click();
  await expect(alice.locator('#invite_box')).toBeVisible();
  await expect(alice.locator('#invite_link')).toHaveValue(url);
  await expect(alice.locator('#copy_link_btn')).toBeFocused();
  await expect.poll(() => measured).toContain('OPEN_INVITE_BOX');

  // exactly one QR code on the page (no duplicate SVG ids)
  const qr = alice.locator('#invite_qr');
  await expect(qr.locator('svg')).toHaveCount(1);
  const duplicateIds = await alice.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  });
  expect(duplicateIds).toEqual([]);

  await qr.click();
  await expect(qr).toHaveAttribute('aria-expanded', 'true');
  // the first Escape makes it small again, the second one closes the panel
  await alice.keyboard.press('Escape');
  await expect(qr).toHaveAttribute('aria-expanded', 'false');
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await qr.click();
  await expect(qr).toHaveAttribute('aria-expanded', 'true');
  await alice.locator('#menu_close').click();
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(qr).toHaveAttribute('aria-expanded', 'false');
});

test('phone: "Board link copied" is visible above the modal sheet (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE, permissions: ['clipboard-read', 'clipboard-write'] });
  const url = await createTeam(alice, 'Menu Toast');
  await joinAsPlayer(alice, url, 'Alice');

  await alice.locator('#menu_btn').click();
  await alice.locator('#menu_index').getByRole('button', { name: /^Invite/ }).click();
  await alice.locator('#copy_link_btn').click();
  const toast = alice.locator('#toast');
  await expect(toast).toHaveClass(/toast-on/);
  await expect(toast).toHaveText('Board link copied');
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toBe(url);

  // the toast lies in the top layer with the sheet (inside the modal dialog), within the screen
  expect(await toast.evaluate(el => el.parentElement!.matches('dialog#menu:modal'))).toBe(true);
  await expect.poll(() => toast.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  })).toBe(true);

  // after closing, the toast is back on the page
  await alice.locator('#menu_close').click();
  expect(await toast.evaluate(el => el.parentElement === document.body)).toBe(true);
});

test('feedback from the start page panel: text sent URL-encoded, panel closes (B-51, B-54)', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  const fbBtn = page.locator('#feedback_btn');

  await fbBtn.click();
  await expect(page.locator('dialog#menu[open]')).toBeVisible();
  await expect(page.locator('#feedback_txt')).toBeFocused();

  const text = 'a & b=c #1 + 100% ?x';
  await page.locator('#feedback_txt').fill(text);
  const [request] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/feedback.php')),
    page.getByRole('button', { name: 'Send feedback' }).click(),
  ]);
  expect(new URL(request.url()).searchParams.get('text')).toBe(text);
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');
  await expect(fbBtn).toBeFocused();
  await expect(page.locator('#feedback_txt')).toHaveValue('');

  // Escape closes it as well
  await fbBtn.click();
  await expect(page.locator('dialog#menu[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');
});
