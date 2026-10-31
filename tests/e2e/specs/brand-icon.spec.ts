import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * Phones show only the mark of the logo. It is its own file (src/brand_icon_dark.svg /
 * brand_icon_light.svg) instead of a crop of the full logo, which let the first letter shine through.
 */
const PHONE = { width: 390, height: 844 };
const LARGE = { width: 1280, height: 900 };

test('phones show the logo mark file, large screens the full logo; the theme switch swaps both', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE });
  const url = await createTeam(alice, 'BrandIcon');
  await joinAsPlayer(alice, url, 'Alice');

  const logo = alice.locator('#brand');
  const icon = alice.locator('#brand_icon');

  await expect(icon).toBeVisible();
  await expect(logo).toBeHidden();
  await expect(icon).toHaveAttribute('src', /brand_icon_dark\.svg/);
  await expect(logo).toHaveAttribute('src', /brand_dark\.svg/);
  const box = (await icon.boundingBox())!;
  expect(Math.round(box.width)).toBe(20);
  expect(Math.round(box.height)).toBe(20);
  // the file really loaded (no broken image)
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  // one name for the link: the hidden image is not in the accessibility tree
  await expect(alice.locator('.brand')).toHaveAccessibleName('Komplexitäter tools');

  await alice.setViewportSize(LARGE);
  await expect(logo).toBeVisible();
  await expect(icon).toBeHidden();

  await alice.locator('#cmode_btn').click();
  await expect(logo).toHaveAttribute('src', /brand_light\.svg/);
  await expect(icon).toHaveAttribute('src', /brand_icon_light\.svg/);

  await alice.setViewportSize(PHONE);
  await expect(icon).toBeVisible();
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
});
