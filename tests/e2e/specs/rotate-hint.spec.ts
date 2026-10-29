import { test, expect } from '@playwright/test';
import { newPlayer, createTeam } from './helpers';

/**
 * B-78: phones held sideways see a hint to turn the phone upright (pure CSS: touch without hover,
 * landscape, at most 500px high). "Continue anyway" hides it for the session. Desktops, tablets
 * and phones in portrait never see it.
 */

test('phone in landscape: the rotate hint covers the board, "Continue anyway" hides it for the session (B-78)', async ({ browser }) => {
  const page = await newPlayer(browser, { viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });
  await page.goto('/');
  const hint = page.locator('#rotate_hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Turn your phone upright');
  await hint.getByRole('button', { name: 'Continue anyway' }).click();
  await expect(hint).toBeHidden();
  // stays hidden for the session, on the board too
  const url = await createTeam(page, 'Rotate Hint');
  await expect(page.locator('#overlay_name_input')).toHaveClass(/visible/);
  await expect(hint).toBeHidden();
  await page.reload();
  await expect(page.locator('#overlay_name_input')).toHaveClass(/visible/);
  await expect(hint).toBeHidden();
  expect(url).toContain('?t=');
});

test('phone in landscape: the hint on the start page; turned upright it vanishes (B-78)', async ({ browser }) => {
  const page = await newPlayer(browser, { viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true });
  await page.goto('/');
  const hint = page.locator('#rotate_hint');
  await expect(hint).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(hint).toBeHidden();
  await page.setViewportSize({ width: 812, height: 375 });
  await expect(hint).toBeVisible();
});

for (const [name, options] of [
  ['phone portrait 375x812', { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }],
  ['tablet landscape 1180x820', { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true }],
  ['desktop 1280x500 (mouse)', { viewport: { width: 1280, height: 500 } }],
] as const) {
  test(`${name}: no rotate hint (B-78)`, async ({ browser }) => {
    const page = await newPlayer(browser, options);
    const url = await createTeam(page, `No Rotate Hint ${name}`);
    await expect(page.locator('#overlay_name_input')).toHaveClass(/visible/);
    await expect(page.locator('#rotate_hint')).toBeHidden();
    await page.goto('/');
    await expect(page.locator('#teaminput')).toBeVisible();
    await expect(page.locator('#rotate_hint')).toBeHidden();
    expect(url).toContain('?t=');
  });
}
