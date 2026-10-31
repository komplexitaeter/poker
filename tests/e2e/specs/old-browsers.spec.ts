import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-89: browsers without the selectors ':has()' (Firefox < 121, iOS < 15.4) and ':modal' (Safari < 15.6,
 * Firefox < 103) throw a SyntaxError for them in querySelector(All)/matches/closest. The menu must work there
 * all the same: tabs by click and arrow keys, Escape, the phone sheet. Simulated by making these methods
 * throw for such selectors before the app is loaded (CSS in style.css is not affected).
 */
const PHONE = { width: 375, height: 800 };
const LARGE = { width: 1280, height: 900 };
const menu = (page: Page) => page.locator('dialog#menu');
const tab = (page: Page, name: string) => page.locator('#cset_box').getByRole('tab', { name });

async function withoutNewSelectors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const unsupported = /:has\(|:modal/;
    const wrap = (proto: any, name: string) => {
      const orig = proto[name];
      proto[name] = function (this: unknown, selector: string, ...rest: unknown[]) {
        if (typeof selector === 'string' && unsupported.test(selector)) {
          throw new DOMException(`'${selector}' is not a valid selector.`, 'SyntaxError');
        }
        return orig.call(this, selector, ...rest);
      };
    };
    for (const proto of [Element.prototype, Document.prototype, DocumentFragment.prototype]) {
      wrap(proto, 'querySelector');
      wrap(proto, 'querySelectorAll');
    }
    wrap(Element.prototype, 'matches');
    wrap(Element.prototype, 'closest');
  });
  return errors;
}

test('large screen without :has() and :modal: tabs by click and arrow keys, Escape closes (B-89)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: LARGE });
  const errors = await withoutNewSelectors(alice);
  const url = await createTeam(alice, 'Old Browser');
  await joinAsPlayer(alice, url, 'Alice');

  // the simulation is active
  expect(await alice.evaluate(() => {
    try { document.querySelectorAll('section:has(div)'); return false; } catch { return true; }
  })).toBe(true);

  const csetBtn = alice.locator('#cset_btn');
  await csetBtn.click();
  await expect(alice.locator('#cset_box')).toBeVisible();
  await tab(alice, 'Results').click();
  await expect(tab(alice, 'Results')).toHaveAttribute('aria-selected', 'true');
  await expect(alice.locator('#cset_panel_team')).toBeHidden();
  await alice.keyboard.press('ArrowRight');
  await expect(tab(alice, 'Team')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(alice, 'Team')).toBeFocused();
  await expect(alice.locator('#cset_panel_team')).toBeVisible();

  // a click outside the panel closes it (non-modal on large screens)
  await alice.mouse.click(LARGE.width / 3, LARGE.height / 2);
  await expect(menu(alice)).not.toHaveAttribute('open');

  // Escape closes it, the focus goes back to the button
  await csetBtn.press('Enter');
  await expect(alice.locator('#cset_box')).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(menu(alice)).not.toHaveAttribute('open');
  await expect(csetBtn).toBeFocused();

  expect(errors).toEqual([]);
});

test('phone without :modal: the sheet opens, switches to the panel and back, Escape closes (B-89)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE });
  const errors = await withoutNewSelectors(alice);
  const url = await createTeam(alice, 'Old Phone');
  await joinAsPlayer(alice, url, 'Alice');

  const menuBtn = alice.locator('#menu_btn');
  await menuBtn.click();
  await expect(alice.locator('#menu_index')).toBeVisible();
  await alice.locator('#menu_index').getByRole('button', { name: /^Board settings/ }).click();
  await tab(alice, 'Team').click();
  await expect(alice.locator('#cset_panel_team')).toBeVisible();

  // breakpoint switch: the sheet becomes the panel and back, same section and tab
  await alice.setViewportSize(LARGE);
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#menu_title')).toHaveText('Board settings');
  await expect(tab(alice, 'Team')).toHaveAttribute('aria-selected', 'true');
  await alice.setViewportSize(PHONE);
  await expect(alice.locator('dialog#menu[open]')).toBeVisible();
  await expect(alice.locator('#menu_title')).toHaveText('Board settings');

  await alice.keyboard.press('Escape');
  await expect(menu(alice)).not.toHaveAttribute('open');

  expect(errors).toEqual([]);
});
