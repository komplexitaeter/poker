import { test, expect, Page } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * R3 review V1/V2 (Andreas, 2026-11-02): "Invite" is the primary action in the header (accent, share icon, label on
 * every width). With navigator.share a click opens the native share menu; without it (or when sharing fails) the
 * link is copied and the button itself says "Copied" (check icon) for 2 s, screen readers hear "Link copied" (no toast). Cancelling the share menu does
 * nothing. The team name still copies the link, confirmed at the button. The tip in the column names the button.
 * V8: the average pointer switch has no lock and the board no red flash.
 */
const DESKTOP = { width: 1280, height: 800 };
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };

/** navigator.share as the browser offers it: 'none' (missing) or a stub that resolves, is cancelled or refused */
async function stubShare(page: Page, mode: 'none' | 'ok' | 'abort' | 'refused'): Promise<void> {
  await page.addInitScript(m => {
    const w = window as unknown as { shared: unknown[] };
    w.shared = [];
    const share = m === 'none' ? undefined : (data: unknown) => {
      w.shared.push(data);
      if (m === 'ok') return Promise.resolve();
      return Promise.reject(new DOMException('share', m === 'abort' ? 'AbortError' : 'NotAllowedError'));
    };
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  }, mode);
}

async function stubClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { w.copied.push(text); } },
    });
  });
}

const shared = (page: Page) => page.evaluate(() => (window as unknown as { shared: { url: string; title: string }[] }).shared);
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied: string[] }).copied);

test('desktop without share: Invite copies the link and confirms at the button, no toast (V1, V2)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  await stubShare(alice, 'none');
  await stubClipboard(alice);
  const url = await createTeam(alice, 'Invite Copy');
  await joinAsPlayer(alice, url, 'Alice');

  const invite = alice.locator('#invite_btn');
  await expect(invite).toBeVisible();
  await expect(invite).toHaveText('Invite');
  // label in name (WCAG 2.5.3)
  await expect(alice.getByRole('button', { name: 'Invite – share board link' })).toHaveCount(1);
  // accent fill: the primary action of the header
  const colors = await invite.evaluate(el => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, accent: getComputedStyle(document.body).getPropertyValue('--accent').trim() };
  });
  expect(colors.bg).not.toBe('rgba(0, 0, 0, 0)');

  // alone on the board: the tip names the button
  await expect(alice.locator('#round_tip')).toHaveText('Invite your team: click Invite and share the link.');

  const before = (await invite.boundingBox())!.width;
  await invite.click();
  await expect(invite).toHaveText('Copied');
  // same width: the header does not jump (small phones)
  expect(Math.abs((await invite.boundingBox())!.width - before)).toBeLessThanOrEqual(1);
  await expect(invite).toHaveClass(/is-done/);
  await expect(alice.locator('#invite_status')).toHaveText('Link copied');
  expect(await copied(alice)).toEqual([url]);
  await expect(alice.locator('#toast')).not.toHaveClass(/toast-on/);
  // back after 2 s
  await expect(invite).toHaveText('Invite', { timeout: 4000 });
  await expect(invite).not.toHaveClass(/is-done/);

  // the team name still copies, confirmed at the Invite button
  await alice.locator('.team-name').click();
  await expect(invite).toHaveText('Copied');
  expect(await copied(alice)).toEqual([url, url]);
});

test('with navigator.share: Invite opens the share menu, nothing is copied (V2)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  await stubShare(alice, 'ok');
  await stubClipboard(alice);
  const url = await createTeam(alice, 'Invite Share');
  await joinAsPlayer(alice, url, 'Alice');

  await alice.locator('#invite_btn').click();
  await expect.poll(() => shared(alice)).toEqual([{ title: 'Invite Share – Agile Poker', url }]);
  expect(await copied(alice)).toEqual([]);
  await expect(alice.locator('#invite_btn')).toHaveText('Invite');
});

test('share menu cancelled: nothing happens; share refused: the link is copied instead (V2)', async ({ browser }) => {
  for (const mode of ['abort', 'refused'] as const) {
    const alice = await newPlayer(browser, { viewport: DESKTOP });
    await stubShare(alice, mode);
    await stubClipboard(alice);
    const url = await createTeam(alice, 'Invite ' + mode);
    await joinAsPlayer(alice, url, 'Alice');

    await alice.locator('#invite_btn').click();
    await expect.poll(async () => (await shared(alice)).length).toBe(1);
    if (mode === 'abort') {
      await alice.waitForTimeout(300);
      expect(await copied(alice)).toEqual([]);
      await expect(alice.locator('#invite_btn')).toHaveText('Invite');
    } else {
      await expect(alice.locator('#invite_btn')).toHaveText('Copied');
      expect(await copied(alice)).toEqual([url]);
    }
    await alice.context().close();
  }
});

test('phone: a visible Invite button with label in the header, opens the share menu by tap (V2)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: PHONE, hasTouch: true, isMobile: true });
  await stubShare(alice, 'ok');
  const url = await createTeam(alice, 'A rather long team name for phones');
  await joinAsPlayer(alice, url, 'Alice');

  const invite = alice.locator('#invite_btn');
  await expect(invite).toBeVisible();
  await expect(invite).toHaveText('Invite');
  const box = (await invite.boundingBox())!;
  const head = (await alice.locator('header.head').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  expect(box.y + box.height).toBeLessThanOrEqual(head.y + head.height);
  // the menu button stays reachable next to it
  const menu = (await alice.locator('#menu_btn').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(box.x + box.width);
  expect(menu.x + menu.width).toBeLessThanOrEqual(PHONE.width);

  await invite.tap();
  await expect.poll(async () => (await shared(alice)).length).toBe(1);
  expect((await shared(alice))[0].url).toBe(url);
});

test('touch tablet: the tip says "tap Invite" (V2)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: TABLET, hasTouch: true });
  const url = await createTeam(alice, 'Invite Tablet');
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#round_tip')).toHaveText('Invite your team: tap Invite and share the link.');
});

test('average pointer: a plain switch, no lock, no red flash when it is switched on (V8)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Average Plain');
  await joinAsPlayer(alice, url, 'Alice');
  await alice.locator('#cset_btn').click();
  await alice.locator('#cset_tab_results').click();

  const field = alice.locator('#cet_dark_side');
  await expect(field.locator('svg')).toHaveCount(0);
  await expect(field).not.toContainText('dark side');
  await expect(field.locator('label', { hasText: 'Show' })).toHaveText('Show');

  // watch the body for a class change (the former flash-red) while switching on
  await alice.evaluate(() => {
    const w = window as unknown as { bodyClasses: string[] };
    w.bodyClasses = [];
    new MutationObserver(() => w.bodyClasses.push(document.body.className))
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
  await field.locator('input[value="1"]').check();
  await expect(field.locator('input[value="1"]')).toBeChecked();
  await alice.waitForTimeout(800);
  const classes = await alice.evaluate(() => (window as unknown as { bodyClasses: string[] }).bodyClasses);
  expect(classes.join(' ')).not.toContain('flash');
});
