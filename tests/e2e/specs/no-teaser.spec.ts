import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * The first-time teaser below "you" is gone: no element, and opening "You" sends no hide_teaser update.
 */
test('there is no first-time teaser below "you"', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const url = await createTeam(alice, 'No Teaser');
  await joinAsPlayer(alice, url, 'Alice');

  const teaserUpdates: string[] = [];
  alice.on('request', r => {
    if (r.url().includes('hide_teaser')) teaserUpdates.push(r.url());
  });

  await expect(alice.locator('#user_settings_btn')).toBeVisible();
  await expect(alice.locator('#cta_teaser')).toHaveCount(0);

  await alice.locator('#user_settings_btn').hover();
  await alice.locator('#user_settings_btn').click();
  await expect(alice.locator('#cet_usr_name')).toBeVisible();
  await expect(alice.locator('#cta_teaser')).toHaveCount(0);
  expect(teaserUpdates).toEqual([]);
});
