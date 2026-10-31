import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer, selectedDeckCards } from './helpers';

/**
 * B-48: the header is made of real buttons and can be used with the keyboard.
 * B-51: the menu sections open with Enter in the menu panel (aria-expanded), Escape closes it and
 * puts the focus back on the button. B-67: the timer panel works the same way, its radio groups with the
 * arrow keys. On phones the
 * menu button opens the menu (bottom sheet) and it closes with the keyboard as well.
 */

test('keyboard: topic box opens with Enter, Escape closes it, timer panel by keyboard (B-48, B-67)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'KeyboardDesk');
  await joinAsPlayer(alice, url, 'Alice');

  const topicBtn = alice.locator('#topic_btn');
  const timerBtn = alice.locator('#timer_btn');

  // Tab from the QR code button reaches the topic button, Enter opens the panel
  await alice.locator('#show_qr_code').focus();
  await alice.keyboard.press('Tab');
  await expect(topicBtn).toBeFocused();
  await alice.keyboard.press('Enter');
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(topicBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(alice.locator('#topic_txt')).toBeFocused();

  // Escape closes it and the focus is back on the button
  await alice.keyboard.press('Escape');
  await expect(alice.locator('dialog#menu')).not.toHaveAttribute('open');
  await expect(alice.locator('#topic_box')).toBeHidden();
  await expect(topicBtn).toHaveAttribute('aria-expanded', 'false');
  await expect(topicBtn).toBeFocused();

  // setup and "you" focus their first field when opened by the user
  await alice.locator('#cset_btn').press('Enter');
  await expect(alice.locator('#cet_pre')).toBeFocused();
  await alice.keyboard.press('Escape');
  await expect(alice.locator('#cset_btn')).toBeFocused();
  await alice.locator('#user_settings_btn').press('Enter');
  await expect(alice.locator('#cet_usr_name')).toBeFocused();

  // "Delete my data" shows its overlay and closes the menu under it
  await alice.locator('#delete_user_btn').click();
  await expect(alice.locator('#overlay_delete_user')).not.toHaveClass(/hidden/);
  // a key does not pick a card behind the overlay (B-68)
  const pickedBefore = await selectedDeckCards(alice).count();
  await alice.keyboard.press('1');
  await expect(selectedDeckCards(alice)).toHaveCount(pickedBefore);
  await expect(alice.locator('dialog#menu')).not.toHaveAttribute('open');
  await expect(alice.locator('#user_settings_box')).toBeHidden();
  await alice.locator('#overlay_delete_user').getByRole('button', { name: 'Cancel' }).click();
  await expect(alice.locator('#overlay_delete_user')).toHaveClass(/hidden/);

  // B-67: :timer follows :topic (before :board); Enter opens the timer panel on the checked radio
  // ("Off"), the arrow key switches the timer on for the whole board, Escape goes back to the button
  await topicBtn.focus();
  await alice.keyboard.press('Tab');
  await expect(timerBtn).toBeFocused();
  await alice.keyboard.press('Tab');
  await expect(alice.locator('#cset_btn')).toBeFocused();
  await timerBtn.focus();
  await alice.keyboard.press('Enter');
  await expect(alice.locator('#timer_box')).toBeVisible();
  await expect(timerBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(alice.locator('input[name=tmr_visibility][value="0"]')).toBeFocused();
  await alice.keyboard.press('ArrowRight');
  await expect(alice.locator('input[name=tmr_visibility][value="1"]')).toBeChecked();
  await expect(alice.locator('#timer')).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(timerBtn).toBeFocused();
  // play and reset are buttons with names
  await expect(alice.getByRole('button', { name: 'Start timer' })).toBeVisible();
  await expect(alice.getByRole('button', { name: 'Reset timer' })).toBeVisible();
});

test('keyboard on a phone: the menu button opens the index with Enter, Escape closes the menu (B-48, B-51)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 375, height: 800 } });
  const url = await createTeam(alice, 'KeyboardPhone');
  await joinAsPlayer(alice, url, 'Alice');

  const menu = alice.locator('dialog#menu');
  const menuBtn = alice.locator('#menu_btn');
  const index = alice.locator('#menu_index');

  await menuBtn.focus();
  await alice.keyboard.press('Enter');
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(index).toBeVisible();
  await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
  // the first entry, "Topic", has the focus; Enter opens the section with its field focused
  await expect(index.getByRole('button', { name: /Topic/ })).toBeFocused();
  await alice.keyboard.press('Enter');
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(index).toBeHidden();
  await expect(alice.locator('#topic_txt')).toBeFocused();

  // Escape closes the menu, the focus goes back to the menu button
  await alice.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open');
  await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
  await expect(menuBtn).toBeFocused();
});

test('start page: Tab goes from the team name field to its button, then to the header (B-51)', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  await expect(page.locator('#teaminput')).toBeVisible();

  // explicit tabindex 1/2 (like the name page): Safari without "Press Tab to highlight each item"
  // only stops at buttons that have a tabindex
  await expect(page.locator('#teaminput')).toHaveAttribute('tabindex', '1');
  await expect(page.locator('#teambtn')).toHaveAttribute('tabindex', '2');

  // from the team name field Tab goes straight to the create button, Shift+Tab back
  await page.locator('#teaminput').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#teambtn')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#teaminput')).toBeFocused();

  // after the button the header follows: logo, feedback, color mode
  await page.locator('#teambtn').focus();
  const order: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.className || ''));
  }
  expect(order).toEqual(['brand', 'feedback_btn', 'cmode_btn']);
});
