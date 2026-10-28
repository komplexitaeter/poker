import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-57: a red dot on the feedback menu until the user has opened the feedback panel once. Stored on the
 * server (pok_user_tbl.hide_teaser = 1), so it stays away after a reload and on pull updates.
 */
test('the red dot on the feedback button goes away for good once the panel was opened', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const url = await createTeam(alice, 'Dot Team');
  await joinAsPlayer(alice, url, 'Alice');

  const updates: string[] = [];
  alice.on('request', r => {
    if (r.url().includes('hide_teaser')) updates.push(`${r.method()} ${r.url()}`);
  });

  const btn = alice.locator('#feedback_btn');
  await expect(alice.locator('body')).toHaveClass(/\bfb-new\b/);
  await expect(btn).toHaveAttribute('aria-label', 'Feedback – new');
  const dot = await btn.evaluate(el => getComputedStyle(el, '::after').content);
  expect(dot).not.toBe('none');
  await alice.screenshot({ path: test.info().outputPath('feedback-dot-header.png'), clip: { x: 0, y: 0, width: 1280, height: 80 } });

  const sent = alice.waitForResponse(r => r.url().includes('hide_teaser=1'));
  await btn.click();
  await expect(alice.locator('#fb_panel_backlog')).toBeVisible();
  await expect(alice.locator('body')).not.toHaveClass(/\bfb-new\b/);
  await expect(btn).toHaveAttribute('aria-label', 'Feedback');
  expect((await sent).ok()).toBeTruthy();
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatch(/^POST .*update_user\.php\?id=.+&hide_teaser=1$/);

  // opening it again sends nothing
  await alice.keyboard.press('Escape');
  await btn.click();
  await expect(alice.locator('#fb_panel_backlog')).toBeVisible();
  expect(updates).toHaveLength(1);

  await alice.reload();
  await expect(alice.locator('#team_name')).toHaveText('Dot Team');
  await expect(btn).toHaveAttribute('aria-label', 'Feedback');
  await expect(alice.locator('body')).not.toHaveClass(/\bfb-new\b/);
});

test('phones: the dot sits on the menu button and on the feedback entry of the index', async ({ browser }) => {
  const bob = await newPlayer(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
  const url = await createTeam(bob, 'Dot Phone');
  await joinAsPlayer(bob, url, 'Bob');

  const menuBtn = bob.locator('#menu_btn');
  await expect(menuBtn).toBeVisible();
  await expect(menuBtn).toHaveAttribute('aria-label', 'Menu – new');
  expect(await menuBtn.evaluate(el => getComputedStyle(el, '::after').content)).not.toBe('none');

  await menuBtn.click();
  const entry = bob.locator('#menu_index [data-open="feedback"]');
  await expect(entry).toBeVisible();
  expect(await entry.locator('b').evaluate(el => getComputedStyle(el, '::after').content)).not.toBe('none');
  // the index alone does not count as seen
  await expect(menuBtn).toHaveAttribute('aria-label', 'Menu – new');

  const sent = bob.waitForResponse(r => r.url().includes('hide_teaser=1'));
  await entry.click();
  await expect(bob.locator('#fb_panel_backlog')).toBeVisible();
  expect((await sent).ok()).toBeTruthy();
  await expect(menuBtn).toHaveAttribute('aria-label', 'Menu');
  expect(await entry.locator('b').evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
});
