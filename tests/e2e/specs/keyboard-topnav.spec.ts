import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-48: the header is made of real buttons and can be used with the keyboard.
 * Menu boxes open with Enter (aria-expanded), Escape closes them and puts the focus back on the
 * button; the stopwatch is an on/off switch (aria-pressed). On phones the burger menu opens and
 * closes with the keyboard as well.
 */

test('keyboard: topic box opens with Enter, Escape closes it, stopwatch sets aria-pressed (B-48)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'KeyboardDesk');
  await joinAsPlayer(alice, url, 'Alice');

  const topicBtn = alice.locator('#topic_btn');
  const stopwatchBtn = alice.locator('#stopwatch_btn');

  // Tab from the stopwatch reaches the topic button, Enter opens the box
  await stopwatchBtn.focus();
  await alice.keyboard.press('Tab');
  await expect(topicBtn).toBeFocused();
  await alice.keyboard.press('Enter');
  await expect(alice.locator('#topic_box')).toBeVisible();
  await expect(topicBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(alice.locator('#topic_txt')).toBeFocused();

  // Escape closes it and the focus is back on the button
  await alice.keyboard.press('Escape');
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

  // "Delete User" shows its overlay and closes the box under it
  await alice.locator('#user_settings_privacy_link').getByText('Delete User').click();
  await expect(alice.locator('#overlay_delete_user')).not.toHaveClass(/hidden/);
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

test('keyboard on a phone: burger opens with Enter, Escape closes box first, then the menu (B-48)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 375, height: 800 } });
  const url = await createTeam(alice, 'KeyboardPhone');
  await joinAsPlayer(alice, url, 'Alice');

  const menu = alice.locator('#mobile-menu');
  const burger = alice.locator('#mobile-menu .open_menu');

  await burger.focus();
  await alice.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('data-state', 'open');
  await expect(burger).toHaveAttribute('aria-expanded', 'true');
  await expect(alice.locator('#topic_btn')).toBeFocused();

  // a box opened from the menu: the first Escape closes only the box
  await alice.keyboard.press('Enter');
  await expect(alice.locator('#topic_box')).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(alice.locator('#topic_box')).toBeHidden();
  await expect(menu).toHaveAttribute('data-state', 'open');
  await expect(alice.locator('#topic_btn')).toBeFocused();

  // the second Escape closes the menu, the focus goes back to the burger
  await alice.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('data-state', 'closed');
  await expect(burger).toHaveAttribute('aria-expanded', 'false');
  await expect(burger).toBeFocused();
});
