import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, pickCard, expectTableCard, teamWithTwoPlayers } from './helpers';

/**
 * B-51: one menu (dialog#menu) with one section per area: Topic, Board settings, You, Feedback.
 * Large screens: the header buttons open their section directly in a side panel on the right, from
 * below the header down to the bottom edge (non-modal); a click on the table does not close it, the
 * button of the open section, the close button and Escape do, and the focus goes back to the button.
 * Phones: the menu button opens the index as a modal bottom sheet; sections have a back button;
 * the backdrop closes it.
 * Board settings: tabs Deck | Results | Team, one panel visible at a time.
 * Pull updates (another player) neither close the panel nor take the focus or overwrite fields.
 * Copy Link and the QR overlay stay as they were.
 */
const PHONE = { width: 375, height: 800 };
const LARGE = { width: 1280, height: 900 };
const menu = (page: Page) => page.locator('dialog#menu');
const isModal = (page: Page) => menu(page).evaluate(el => el.matches(':modal'));
const tab = (page: Page, name: string) => page.locator('#cset_box').getByRole('tab', { name });

test('large screen: the side panel opens and closes by click and Escape, the focus goes back (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: LARGE });
  const url = await createTeam(alice, 'Menu Desk');
  await joinAsPlayer(alice, url, 'Alice');

  const measured: string[] = [];
  alice.on('request', r => {
    if (r.url().includes('/api/measure_event.php')) measured.push(new URL(r.url()).searchParams.get('event_code') ?? '');
  });

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
  await expect.poll(() => measured).toContain('OPEN_TOPIC_BOX');

  // the panel sits on the right, from below the header down to the bottom edge
  const head = (await alice.locator('header.head').boundingBox())!;
  await expect.poll(async () => {
    const panel = (await menu(alice).boundingBox())!;
    return [Math.round(panel.x + panel.width), Math.round(panel.y + panel.height)];
  }).toEqual([LARGE.width, LARGE.height]);
  const panel = (await menu(alice).boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(head.y + head.height - 1);

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
  await expect(alice.locator('#cet_pre')).toBeFocused();
  expect((await menu(alice).boundingBox())!.x).toBe(panel.x); // the panel does not move
  await expect.poll(() => measured).toContain('OPEN_SETUP_BOX');

  // the button of the open section closes it
  await csetBtn.click();
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(csetBtn).toHaveAttribute('aria-expanded', 'false');

  // Enter opens, Escape closes, the focus is back on the button
  await alice.locator('#user_settings_btn').press('Enter');
  await expect(alice.locator('#user_settings_box')).toBeVisible();
  await expect(alice.locator('#cet_usr_name')).toBeFocused();
  await expect(alice.locator('#cet_usr_name')).toHaveValue('Alice');
  await expect(alice.locator('#cet_change_user')).toBeDisabled();
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

test('a click on the header button of the open section closes it without a focus ring, the keyboard keeps it (B-57)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: LARGE });
  const url = await createTeam(alice, 'Menu Ring');
  await joinAsPlayer(alice, url, 'Alice');
  const fbBtn = alice.locator('#feedback_btn');
  const ring = () => fbBtn.evaluate(el => el.matches(':focus-visible'));

  // real click (Chromium focuses the button on mousedown)
  await fbBtn.click();
  await expect(alice.locator('#feedback_txt')).toBeFocused();
  await fbBtn.click();
  await expect(menu(alice)).not.toHaveAttribute('open');
  expect(await ring()).toBe(false);

  // like Safari: a click does not move the focus, it is still in the text field of the panel (typed into)
  await fbBtn.click();
  await expect(alice.locator('#feedback_txt')).toBeFocused();
  await alice.keyboard.type('half a thought');
  await fbBtn.dispatchEvent('click', { detail: 1 });
  await expect(menu(alice)).not.toHaveAttribute('open');
  expect(await ring()).toBe(false);

  // keyboard: Enter on the button closes it, the focus goes back with a visible ring
  await fbBtn.click();
  await expect(alice.locator('#feedback_txt')).toBeFocused();
  await alice.keyboard.press('Shift+Tab');
  await expect(alice.locator('#feedback_txt')).not.toBeFocused();
  await fbBtn.focus();
  await alice.keyboard.press('Enter');
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(fbBtn).toBeFocused();
  expect(await ring()).toBe(true);
});

test('a board that needs setup opens "Board settings" on large screens without taking the focus, not on phones (B-51)', async ({ browser }) => {
  // an entry link with preset=custom creates a board without cards (needs_setup)
  const setupLink = (team: string) => `/?tool=e2e&team=${encodeURIComponent(team)}&preset=custom`;
  const alice = await newPlayer(browser, { viewport: LARGE });
  await alice.goto(setupLink('Menu Setup'));
  await alice.waitForURL(/\?t=/);
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#cset_box')).toBeVisible();
  await expect(tab(alice, 'Deck')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#cset_btn')).toHaveAttribute('aria-expanded', 'true');
  await expect(alice.locator('#nameinput')).toBeFocused();

  const bob = await newPlayer(browser, { viewport: PHONE });
  await bob.goto(setupLink('Menu Setup Phone'));
  await bob.waitForURL(/\?t=/);
  await expect(bob.locator('#overlay_name_input')).toHaveClass(/visible/);
  await expect(menu(bob)).not.toHaveAttribute('open');
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
  await expect(index.getByRole('button', { name: /^Topic/ })).toBeFocused();

  // the sheet lies at the bottom edge, full width
  await expect.poll(async () => {
    const box = (await menu(alice).boundingBox())!;
    return [Math.round(box.x), Math.round(box.width), Math.round(box.y + box.height)];
  }).toEqual([0, PHONE.width, PHONE.height]);

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

  // Escape closes it as well
  await menuBtn.click();
  await index.getByRole('button', { name: /^You/ }).click();
  await expect(alice.locator('#cet_usr_name')).toBeFocused();
  await alice.keyboard.press('Escape');
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(menuBtn).toBeFocused();

  // the index exists on phones only: switching to the large layout with the index open closes the sheet
  await menuBtn.click();
  await expect(index).toBeVisible();
  await alice.setViewportSize(LARGE);
  await expect(menu(alice)).not.toHaveAttribute('open');
});

test('a breakpoint switch keeps the menu open: same section, tab, unsaved input and focus (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: LARGE });
  const url = await createTeam(alice, 'Menu Switch');
  await joinAsPlayer(alice, url, 'Alice');

  // large screen: board settings, tab "Team", a half-typed team name
  await alice.locator('#cset_btn').click();
  await tab(alice, 'Team').click();
  const teamName = alice.locator('#cet_team_name');
  await teamName.fill('Half typed');
  await expect(alice.locator('#cet_change_name')).toBeEnabled();
  expect(await isModal(alice)).toBe(false);

  // narrower: the side panel becomes the sheet, directly in the section (not the index)
  await alice.setViewportSize(PHONE);
  await expect.poll(() => isModal(alice)).toBe(true);
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#menu_title')).toHaveText('Board settings');
  await expect(alice.locator('#cset_box')).toBeVisible();
  await expect(alice.locator('#menu_index')).toBeHidden();
  await expect(tab(alice, 'Team')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#cset_panel_team')).toBeVisible();
  await expect(teamName).toHaveValue('Half typed');
  await expect(teamName).toBeFocused();
  await expect(alice.locator('#cet_change_name')).toBeEnabled();
  await expect(alice.locator('#menu_btn')).toHaveAttribute('aria-expanded', 'true');

  // wider again: the sheet becomes the side panel, still the same section, tab and input
  await alice.setViewportSize(LARGE);
  await expect.poll(() => isModal(alice)).toBe(false);
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#menu_title')).toHaveText('Board settings');
  await expect(tab(alice, 'Team')).toHaveAttribute('aria-selected', 'true');
  await expect(teamName).toHaveValue('Half typed');
  await expect(teamName).toBeFocused();
  await expect(alice.locator('#cset_btn')).toHaveAttribute('aria-expanded', 'true');

  // on the phone the back button leads to the index; Escape closes the panel and the focus goes back
  await alice.setViewportSize(PHONE);
  await expect.poll(() => isModal(alice)).toBe(true);
  await alice.locator('#menu_back').click();
  await expect(alice.locator('#menu_index')).toBeVisible();
  await expect(alice.locator('#menu_title')).not.toHaveText('Board settings');
  await alice.locator('#menu_index').getByRole('button', { name: /^Board settings/ }).click();
  await alice.setViewportSize(LARGE);
  await expect.poll(() => isModal(alice)).toBe(false);
  await alice.keyboard.press('Escape');
  await expect(menu(alice)).not.toHaveAttribute('open');
});

test('the panel stays open on a pull update of another player, keeps focus, tab and unsaved input (B-51)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Menu Pull');

  await alice.locator('#topic_btn').click();
  await alice.locator('#topic_txt').pressSequentially('half written');
  await expect(alice.locator('#topic_save')).toBeEnabled();

  // Bob picks a card and renames the team: Alice's board updates (pull)
  await pickCard(bob, 'five001');
  await expectTableCard(alice, 'Bob', 'done001');
  await bob.locator('#cset_btn').click();
  await tab(bob, 'Team').click();
  await bob.locator('#cet_team_name').fill('Menu Pull 2');
  await bob.locator('#cet_change_name').click();
  await expect(alice.locator('#team_name')).toHaveText('Menu Pull 2');

  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(alice.locator('#topic_txt')).toBeFocused();
  await expect(alice.locator('#topic_txt')).toHaveValue('half written');

  // board settings on the tab "Results": a pull update keeps the tab and the focus
  await alice.locator('#cset_btn').click();
  await tab(alice, 'Results').click();
  await expect(tab(alice, 'Results')).toBeFocused();
  await tab(bob, 'Results').click();
  await bob.locator('input[name=cet_dark_side][value="1"]').check();
  await expect(alice.locator('input[name=cet_dark_side][value="1"]')).toBeChecked();
  await expect(tab(alice, 'Results')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#cset_panel_results')).toBeVisible();
  await expect(tab(alice, 'Results')).toBeFocused();
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
});

test('board settings: tabs Deck | Results | Team by click and arrow keys, card switches (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: LARGE });
  const url = await createTeam(alice, 'Menu Tabs');
  await joinAsPlayer(alice, url, 'Alice');

  await alice.locator('#cset_btn').click();

  const panels = { Deck: '#cset_panel_deck', Results: '#cset_panel_results', Team: '#cset_panel_team' };
  const expectTab = async (name: keyof typeof panels) => {
    for (const other of Object.keys(panels) as (keyof typeof panels)[]) {
      await expect(tab(alice, other)).toHaveAttribute('aria-selected', other === name ? 'true' : 'false');
      await expect(tab(alice, other)).toHaveAttribute('tabindex', other === name ? '0' : '-1');
      if (other === name) await expect(alice.locator(panels[other])).toBeVisible();
      else await expect(alice.locator(panels[other])).toBeHidden();
    }
  };

  await expect(alice.locator('#cset_box [role=tablist] [role=tab]')).toHaveText(['Deck', 'Results', 'Team']);
  await expectTab('Deck');

  // click
  await tab(alice, 'Results').click();
  await expectTab('Results');
  await expect(alice.locator('#cet_order_by')).toBeVisible();
  await expect(alice.locator('#cet_pre')).toBeHidden();
  await tab(alice, 'Team').click();
  await expectTab('Team');
  await expect(alice.locator('#cet_team_name')).toHaveValue('Menu Tabs');
  await expect(alice.locator('#cet_change_name')).toBeDisabled();

  // arrow keys, Home, End (focus follows)
  await alice.keyboard.press('ArrowRight'); // wraps around to Deck
  await expectTab('Deck');
  await expect(tab(alice, 'Deck')).toBeFocused();
  await alice.keyboard.press('ArrowLeft');
  await expectTab('Team');
  await expect(tab(alice, 'Team')).toBeFocused();
  await alice.keyboard.press('Home');
  await expectTab('Deck');
  await alice.keyboard.press('End');
  await expectTab('Team');

  // reopening starts on Deck again
  await alice.locator('#cset_btn').click();
  await expect(menu(alice)).not.toHaveAttribute('open');
  await alice.locator('#cset_btn').click();
  await expectTab('Deck');
  await expect(alice.locator('#cet_pre')).toBeFocused();

  // deck: a card thumbnail switches the card off in the deck
  const three = alice.locator('#_three01');
  await expect(three).toHaveClass(/cs_c_on/);
  await three.click();
  await expect(three).not.toHaveClass(/cs_c_on/);
  await expect(alice.locator('#ctl img#three01')).toHaveClass(/\boff\b/);
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
});

test('phone: a toast is visible above the modal sheet and goes back to the page on close (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE });
  const url = await createTeam(alice, 'Menu Toast');
  await joinAsPlayer(alice, url, 'Alice');

  await alice.locator('#menu_btn').click();
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  // the page is inert below the modal sheet; show a toast the way the board does
  await alice.evaluate(() => (window as any).showToast('Hello over the sheet'));
  const toast = alice.locator('#toast');
  await expect(toast).toHaveClass(/toast-on/);
  await expect(toast).toHaveText('Hello over the sheet');

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

test('Copy Link and the QR overlay work as before, also with the panel open (B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: LARGE, permissions: ['clipboard-read', 'clipboard-write'] });
  const url = await createTeam(alice, 'Menu QR');
  await joinAsPlayer(alice, url, 'Alice');

  await alice.locator('#topic_btn').click();
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();

  // Copy Link in the header: the link in the clipboard, a toast
  await alice.locator('#copy_link_btn').click();
  await expect(alice.locator('#toast')).toHaveText('Board link copied');
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toBe(url);

  // the QR icon shows the large QR code over everything, a click closes it
  const overlay = alice.locator('#overlay_qr_code');
  await alice.locator('#show_qr_code').click();
  await expect(overlay).toHaveClass(/visible/);
  await expect(overlay.locator('#canvas_qr_code svg')).toHaveCount(1);
  const box = (await overlay.locator('#canvas_qr_code').boundingBox())!;
  const onTop = await alice.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el !== null && document.getElementById('overlay_qr_code')!.contains(el);
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(onTop).toBe(true);
  await overlay.click();
  await expect(overlay).toHaveClass(/hidden/);
});

test('feedback from the start page panel: text sent URL-encoded, panel closes (B-51, B-54)', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  const fbBtn = page.locator('#feedback_btn');

  await fbBtn.click();
  await expect(page.locator('dialog#menu[open]')).toBeVisible();
  await expect(page.locator('#feedback_txt')).toBeFocused();
  await expect(page.locator('.feedback_star')).toHaveCount(0);

  const text = 'a & b=c #1 + 100% ?x';
  await page.locator('#feedback_txt').fill(text);
  const [request] = await Promise.all([
    page.waitForRequest(r => r.url().includes('/api/feedback.php')),
    page.getByRole('button', { name: 'Send feedback' }).click(),
  ]);
  expect(new URL(request.url()).searchParams.get('text')).toBe(text);
  expect(new URL(request.url()).searchParams.get('stars')).toBe('0');
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');
  await expect(fbBtn).toBeFocused();
  await expect(page.locator('#feedback_txt')).toHaveValue('');

  // Escape closes it as well
  await fbBtn.click();
  await expect(page.locator('dialog#menu[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog#menu')).not.toHaveAttribute('open');
});
