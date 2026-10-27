import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-48: the header is made of real buttons and can be used with the keyboard.
 * B-51: the menu sections open with Enter in the menu panel (aria-expanded), Escape closes it and
 * puts the focus back on the button; the stopwatch is an on/off switch (aria-pressed). On phones the
 * menu button opens the menu (bottom sheet) and it closes with the keyboard as well.
 */

test('keyboard: topic box opens with Enter, Escape closes it, stopwatch sets aria-pressed (B-48)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'KeyboardDesk');
  await joinAsPlayer(alice, url, 'Alice');

  const topicBtn = alice.locator('#topic_btn');
  const stopwatchBtn = alice.locator('#stopwatch_btn');

  // Tab from the stopwatch reaches the topic button, Enter opens the panel
  await stopwatchBtn.focus();
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
  await expect(alice.locator('dialog#menu')).not.toHaveAttribute('open');
  await expect(alice.locator('#user_settings_box')).toBeHidden();
  await alice.locator('#overlay_delete_user').getByRole('button', { name: 'Cancel' }).click();
  await expect(alice.locator('#overlay_delete_user')).toHaveClass(/hidden/);

  // the stopwatch is a toggle for the whole board
  await expect(stopwatchBtn).toHaveAttribute('aria-pressed', 'false');
  await stopwatchBtn.press('Enter');
  await expect(stopwatchBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(alice.locator('#stopwatch')).toBeVisible();
  await stopwatchBtn.press('Space');
  await expect(stopwatchBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(alice.locator('#stopwatch')).toBeHidden();
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

test('start page: Tab goes through the header, the team name field and then its button (B-51)', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto('/');
  await expect(page.locator('#teaminput')).toBeVisible();

  // from the team name field Tab goes straight to the create button, Shift+Tab back
  await page.locator('#teaminput').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#teambtn')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#teaminput')).toBeFocused();

  // the whole order follows the page: logo, feedback, color mode, team name, button
  await page.locator('#teambtn').focus();
  const order: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab');
    order.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.className || ''));
  }
  expect(order).toEqual(['teaminput', 'cmode_btn', 'feedback_btn', 'brand']);
});
