import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, pickCard, openTimerPanel, setTeamDeck, setLegacyDeck, deckCards } from './helpers';

/**
 * B-113 (cut 1): on large screens with a mouse the column can be collapsed to a narrow rail (hover opens it as an
 * overlay, the pin keeps it open) and resized with the grip (20-60vw, it never collapses: only »» does; arrow keys ±2).
 * The state is kept per phase (voting / revealed) in localStorage for all boards of the browser; a phase change
 * switches to the state of the new phase. The rail shows "1/2" while voting, the range of the cards down after the
 * reveal (one card when all agree) and the round button. Without a stored state nothing changes; phones never.
 */
const DESKTOP = { width: 1280, height: 800 };

const container = (page: Page) => page.locator('.container');
const sideWidth = async (page: Page) => Math.round((await page.locator('#sidebar').boundingBox())!.width);
const sideW = (page: Page) => container(page).evaluate(el => (el as HTMLElement).style.getPropertyValue('--side-w'));

const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];
const sql = (statement: string) => execFileSync('mysql', [...DB_ARGS, '-N', '-e', statement],
  { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

async function twoPlayers(browser: any, name: string) {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, name);
  await joinAsPlayer(alice, url, 'Alice');
  const bob = await newPlayer(browser, { viewport: DESKTOP });
  await joinAsPlayer(bob, url, 'Bob');
  await expect(alice.locator('#round_status')).toHaveText('voting · 0 of 2 voted');
  return { alice, bob, url };
}

test('default unchanged, collapse to the rail, peek by hover and click, pin; kept on reload (B-113)', async ({ browser }) => {
  const { alice } = await twoPlayers(browser, 'Sidebar Rail');

  // default: as before (no state classes, no width, the column 380px), the rail hidden
  await expect(container(alice)).toHaveAttribute('data-phase', 'voting');
  await expect(container(alice)).not.toHaveClass(/side-collapsed|side-peek/);
  expect(await sideW(alice)).toBe('');
  expect(await sideWidth(alice)).toBe(380);
  await expect(alice.locator('#side_rail')).toBeHidden();
  await expect(alice.locator('#side_pin')).toBeHidden();

  // collapse: the rail with "1/2" and the disabled/enabled round button
  await pickCard(alice, 'five001');
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(alice.locator('#side_rail')).toBeVisible();
  await expect(alice.locator('#rail_count')).toHaveText('1/2');
  await expect(alice.locator('#rail_round')).toBeEnabled();
  await expect(alice.locator('#rail_round')).toHaveAttribute('title', 'Restart round');
  await expect(alice.locator('#sidebar')).toBeHidden();
  // the table takes the room
  await expect.poll(async () => Math.round((await alice.locator('#side_rail').boundingBox())!.width)).toBe(60);

  // the rail came under the mouse (the collapse button): no overlay until the mouse left the rail once
  await alice.locator('#rail_count').hover();
  await alice.waitForTimeout(300);
  await expect(container(alice)).not.toHaveClass(/side-peek/);
  await alice.mouse.move(200, 300);

  // hover over the rail opens the overlay, Escape closes it
  await alice.locator('#rail_count').hover();
  await expect(container(alice)).toHaveClass(/side-peek/);
  await expect(alice.locator('#side_open')).toHaveAttribute('aria-expanded', 'true');
  await expect(alice.locator('#sidebar')).toBeVisible();
  await expect(alice.locator('#side_pin')).toBeVisible();
  await alice.keyboard.press('Escape');
  await expect(container(alice)).not.toHaveClass(/side-peek/);
  await expect(alice.locator('#side_open')).toHaveAttribute('aria-expanded', 'false');

  // leaving rail and overlay closes it
  await alice.mouse.move(200, 300);
  await alice.locator('#rail_count').hover();
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.mouse.move(200, 300);
  await expect(container(alice)).not.toHaveClass(/side-peek/);

  // a click on «« opens it for good (stays when the mouse leaves), a click next to it closes it
  await alice.locator('#side_open').click();
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.mouse.move(200, 300);
  await alice.waitForTimeout(400);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.mouse.click(200, 300);
  await expect(container(alice)).not.toHaveClass(/side-peek/);

  // the pin lies where «« is: hover opened the overlay, the mouse has not moved since and the click comes late
  // (or on a slow CI runner) – the pin pins all the same (B-113, Andreas: no guessing whether it was meant for ««)
  const openBox = (await alice.locator('#side_open').boundingBox())!;
  const at = { x: openBox.x + openBox.width / 2, y: openBox.y + openBox.height / 2 };
  await alice.mouse.move(at.x, at.y);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.waitForTimeout(600);
  expect(await alice.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('#side_pin') !== null, at)).toBe(true);
  await alice.mouse.click(at.x, at.y);
  await expect(container(alice)).not.toHaveClass(/side-collapsed|side-peek/);
  await expect.poll(() => sideWidth(alice)).toBe(380);
  // only a look: »» collapses again – and the rail stays shut while the mouse moves in it (Andreas: pleasant);
  // hover opens it again only after the mouse left the rail once
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect.poll(async () => Math.round((await alice.locator('#side_rail').boundingBox())!.width)).toBe(60);
  await alice.waitForTimeout(500); // the rail has slid in
  const countBox = (await alice.locator('#rail_count').boundingBox())!;
  await alice.mouse.move(at.x, at.y + 10, { steps: 3 });
  await alice.mouse.move(countBox.x + countBox.width / 2, countBox.y + countBox.height / 2, { steps: 5 });
  await alice.mouse.move(at.x - 5, at.y, { steps: 5 });
  await alice.waitForTimeout(400);
  await expect(container(alice)).not.toHaveClass(/side-peek/);
  await alice.mouse.move(200, 300);
  await alice.mouse.move(at.x, at.y);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.mouse.move(200, 300);
  await expect(container(alice)).not.toHaveClass(/side-peek/);

  // kept on reload, without animation
  await alice.reload();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(container(alice)).not.toHaveClass(/side-no-anim/);
  await expect(alice.locator('#rail_count')).toHaveText('1/2');

  // the pin opens it for good: on the overlay at the top right (where »» is in the open column), not covered
  await alice.locator('#side_open').click();
  const pin = alice.locator('#side_pin');
  await expect(pin).toBeVisible();
  await expect(alice.locator('#side_collapse')).toBeHidden();
  await expect.poll(() => pin.evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#side_pin') === el;
  })).toBe(true);
  await alice.screenshot({ path: test.info().outputPath('peek.png') });
  await pin.click();
  await expect(container(alice)).not.toHaveClass(/side-collapsed|side-peek/);
  await expect(alice.locator('#side_rail')).toBeHidden();
  await expect.poll(() => sideWidth(alice)).toBe(380);
  await alice.reload();
  await expect(container(alice)).toHaveAttribute('data-phase', 'voting');
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);

  // hover opened the overlay, then the mouse moved (to the pin): the pin pins
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await alice.mouse.move(200, 300);
  await alice.mouse.move(at.x, at.y);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.mouse.move(at.x - 30, at.y + 20, { steps: 3 });
  await alice.locator('#side_pin').click();
  await expect(container(alice)).not.toHaveClass(/side-collapsed|side-peek/);
  await expect.poll(() => sideWidth(alice)).toBe(380);
});

test('the pin pins at once: hover opens the overlay, a quick click without moving the mouse (B-113)', async ({ browser }) => {
  // Andreas (staging): collapsed, the mouse onto ««, the overlay opens and he clicks right away on the pin (which
  // lies there) without moving the mouse – it was not pinned, several times in a row
  const { alice } = await twoPlayers(browser, 'Sidebar Pin Quick');
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect.poll(async () => Math.round((await alice.locator('#side_rail').boundingBox())!.width)).toBe(60);
  await alice.waitForTimeout(500); // the rail has slid in
  await alice.mouse.move(200, 300);

  const openBox = (await alice.locator('#side_open').boundingBox())!;
  const at = { x: openBox.x + openBox.width / 2, y: openBox.y + openBox.height / 2 };
  await alice.mouse.move(at.x, at.y);
  await expect(container(alice)).toHaveClass(/side-peek/);
  // click as soon as the pin is under the mouse, no move in between
  await expect.poll(() => alice.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('#side_pin') !== null, at),
    { intervals: [10] }).toBe(true);
  await alice.mouse.click(at.x, at.y);
  await expect(container(alice)).not.toHaveClass(/side-collapsed|side-peek/);
  await expect(alice.locator('#side_rail')).toBeHidden();
  await expect.poll(() => sideWidth(alice)).toBe(380);
  expect((await stored(alice)).voting.collapsed).toBe(false);
  // stays pinned when the mouse leaves
  await alice.mouse.move(200, 300);
  await alice.waitForTimeout(400);
  await expect(container(alice)).not.toHaveClass(/side-collapsed|side-peek/);
});

/** samples the column's box (and whether it is on top at its middle) in every frame while the action runs */
async function sampleSidebar(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => {
    const samples: { left: number; width: number; onTop: boolean }[] = [];
    (window as any).__sideSamples = samples;
    const start = performance.now();
    const frame = () => {
      const sidebar = document.getElementById('sidebar')!;
      const r = sidebar.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      samples.push({ left: Math.round(r.left), width: Math.round(r.width), onTop: hit !== null && sidebar.contains(hit) });
      if (performance.now() - start < 900) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await action();
  await page.waitForTimeout(1000);
  return page.evaluate(() => (window as any).__sideSamples as { left: number; width: number; onTop: boolean }[]);
}

test('pinning keeps the overlay in place, collapsing slides it out without a jump (B-113)', async ({ browser }) => {
  const { alice } = await twoPlayers(browser, 'Sidebar Pin');
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await alice.mouse.move(200, 300);
  await alice.locator('#side_open').click();
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.waitForTimeout(400); // slid in
  const overlay = (await alice.locator('#sidebar').boundingBox())!;

  // pin: the column stays where the overlay was in every frame (does not start at the rail's width), on top
  const pinned = await sampleSidebar(alice, () => alice.locator('#side_pin').click());
  await expect(container(alice)).not.toHaveClass(/side-collapsed|side-peek|side-pinning/);
  expect(pinned.length).toBeGreaterThan(10);
  for (const s of pinned) {
    expect(Math.abs(s.left - Math.round(overlay.x))).toBeLessThanOrEqual(1);
    expect(Math.abs(s.width - Math.round(overlay.width))).toBeLessThanOrEqual(1);
    expect(s.onTop).toBe(true);
  }

  // »»: it slides out to the right, never back or narrower
  const collapsed = await sampleSidebar(alice, () => alice.locator('#side_collapse').click());
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  for (let i = 1; i < collapsed.length; i++) {
    expect(collapsed[i].left).toBeGreaterThanOrEqual(collapsed[i - 1].left);
    expect(collapsed[i].width).toBe(collapsed[0].width);
  }
  expect(collapsed[collapsed.length - 1].left).toBe(DESKTOP.width);
});

test('the grip: drag and arrow keys set the width (kept on reload), never collapse (B-113)', async ({ browser }) => {
  const { alice } = await twoPlayers(browser, 'Sidebar Grip');
  const grip = alice.locator('#side_grip');

  // drag the grip to the middle of the window: 50vw
  const g = (await grip.boundingBox())!;
  await alice.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await alice.mouse.down();
  await alice.mouse.move(700, 400, { steps: 5 });
  await alice.mouse.move(640, 400, { steps: 5 });
  await expect(container(alice)).toHaveClass(/side-dragging/);
  await alice.mouse.up();
  await expect(container(alice)).not.toHaveClass(/side-dragging/);
  expect(await sideW(alice)).toBe('50vw');
  expect(await sideWidth(alice)).toBe(640);
  await expect(grip).toHaveAttribute('aria-valuenow', '50');

  // arrow keys ±2 (right: narrower)
  await grip.focus();
  await alice.keyboard.press('ArrowRight');
  await expect(grip).toHaveAttribute('aria-valuenow', '48');
  expect(await sideW(alice)).toBe('48vw');
  await alice.keyboard.press('ArrowLeft');
  await alice.keyboard.press('ArrowLeft');
  await expect(grip).toHaveAttribute('aria-valuenow', '52');

  // never wider than 60vw
  const g2 = (await grip.boundingBox())!;
  await alice.mouse.move(g2.x + g2.width / 2, 400);
  await alice.mouse.down();
  await alice.mouse.move(100, 400, { steps: 5 });
  await alice.mouse.up();
  expect(await sideW(alice)).toBe('60vw');
  await grip.focus();
  await alice.keyboard.press('ArrowRight');
  await expect(grip).toHaveAttribute('aria-valuenow', /^5[68]$/);
  const kept = await sideW(alice);

  await alice.reload();
  await expect(container(alice)).toHaveAttribute('data-phase', 'voting');
  expect(await sideW(alice)).toBe(kept);

  // dragged below 14vw (Andreas: the grip sets the width only): stays at 20vw, not collapsed
  const g3 = (await grip.boundingBox())!;
  await alice.mouse.move(g3.x + g3.width / 2, 400);
  await alice.mouse.down();
  await alice.mouse.move(1250, 400, { steps: 8 });
  await alice.mouse.up();
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);
  expect(await sideW(alice)).toBe('20vw');
  expect(await sideWidth(alice)).toBe(256);
  expect((await stored(alice)).voting).toEqual({ collapsed: false, width: 20 });

  // the arrow keys never collapse either
  await grip.focus();
  await alice.keyboard.press('ArrowRight');
  await alice.keyboard.press('ArrowRight');
  await expect(grip).toHaveAttribute('aria-valuenow', '20');
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);
});

test('the grip\'s handle shows only on hover over the column, while focused or with the menu open (B-113)', async ({ browser }) => {
  const { alice } = await twoPlayers(browser, 'Sidebar Handle');
  const handle = () => alice.locator('#side_grip').evaluate(el => Number(getComputedStyle(el, '::after').opacity));

  // pointer over the table: hidden
  await alice.mouse.move(200, 300);
  await expect.poll(handle).toBe(0);

  // pointer over the column (not the grip): shown
  const side = (await alice.locator('#sidebar').boundingBox())!;
  await alice.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await expect.poll(handle).toBeGreaterThan(0);

  // pointer on the grip's part over the table (it reaches past the column's edge): still shown
  const g = (await alice.locator('#side_grip').boundingBox())!;
  await alice.mouse.move(g.x + 2, g.y + g.height / 2);
  await expect.poll(handle).toBeGreaterThan(0);

  await alice.mouse.move(200, 300);
  await expect.poll(handle).toBe(0);

  // menu panel open, pointer elsewhere: shown
  await alice.locator('#cset_btn').click();
  await expect(container(alice)).toHaveClass(/side-menu/);
  await alice.mouse.move(200, 300);
  await expect.poll(handle).toBeGreaterThan(0);
});

/* the grip's handle (the "Böbbel" in the middle of its edge) is on top: elementFromPoint hits the grip */
async function gripOnTop(page: Page) {
  const g = (await page.locator('#side_grip').boundingBox())!;
  const x = g.x + g.width / 2;
  const y = g.y + g.height / 2;
  expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id ?? '', [x, y])).toBe('side_grip');
  return { x, y };
}

async function dragGrip(page: Page, from: { x: number, y: number }, toX: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(toX + 60, from.y, { steps: 5 });
  await page.mouse.move(toX, from.y, { steps: 5 });
  await page.mouse.up();
}

/* the panel slides in (panel-in): measure after it */
const panelSettled = (menu: any) => menu.evaluate((el: Element) => Promise.all(el.getAnimations().map(a => a.finished)));
const menuWidth = async (page: Page) => Math.round((await page.locator('#menu').boundingBox())!.width);
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('SIDEBAR_STATE') || '{}'));

test('menu open: the grip lies above the panel, dragging resizes and keeps the menu open (B-113)', async ({ browser }) => {
  const { alice } = await twoPlayers(browser, 'Sidebar Menu Grip');
  const menu = alice.locator('dialog#menu');

  await alice.locator('#cset_btn').click();
  await expect(menu).toHaveAttribute('open');
  await expect(container(alice)).toHaveClass(/side-menu/);
  await panelSettled(menu);
  const at = await gripOnTop(alice);
  // at the panel's left edge
  expect(Math.abs(at.x - (await menu.boundingBox())!.x)).toBeLessThanOrEqual(2);

  // wider: menu and column 50vw; the release does not close the menu
  await dragGrip(alice, at, 640);
  expect(await sideW(alice)).toBe('50vw');
  expect(await menuWidth(alice)).toBe(640);
  expect(await sideWidth(alice)).toBe(640);
  await alice.waitForTimeout(300);
  await expect(menu).toHaveAttribute('open');

  // far to the right: only the minimum width (20vw), no collapsing while the menu is open; the menu keeps its own
  // minimum (380px) and stays open
  await dragGrip(alice, await gripOnTop(alice), 1250);
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);
  expect(await sideW(alice)).toBe('20vw');
  expect(await sideWidth(alice)).toBe(256);
  expect(await menuWidth(alice)).toBe(380);
  await alice.waitForTimeout(300);
  await expect(menu).toHaveAttribute('open');
  expect((await stored(alice)).voting).toEqual({ collapsed: false, width: 20 });
});

test('collapsed with the menu open: the grip sets the width of the phase, the column stays collapsed (B-113)', async ({ browser }) => {
  const { alice } = await twoPlayers(browser, 'Sidebar Menu Collapsed');
  const menu = alice.locator('dialog#menu');

  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(alice.locator('#side_grip')).toBeHidden();

  await alice.locator('#cset_btn').click();
  await expect(menu).toHaveAttribute('open');
  await panelSettled(menu);
  const at = await gripOnTop(alice);
  expect(Math.abs(at.x - (await menu.boundingBox())!.x)).toBeLessThanOrEqual(2);

  await dragGrip(alice, at, 640);
  expect(await menuWidth(alice)).toBe(640);
  await alice.waitForTimeout(300);
  await expect(menu).toHaveAttribute('open');
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  expect((await stored(alice)).voting).toEqual({ collapsed: true, width: 50 });

  // menu closed: still the rail, no grip
  await alice.locator('#menu_close').click();
  await expect(menu).not.toHaveAttribute('open');
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(alice.locator('#side_rail')).toBeVisible();
  await expect(alice.locator('#side_grip')).toBeHidden();

  // opened later: the new width (the close button lay over the rail: no overlay without a move)
  await alice.mouse.move(200, 300);
  await expect(container(alice)).not.toHaveClass(/side-peek/);
  await alice.locator('#side_open').click();
  await alice.locator('#side_pin').click();
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);
  await expect.poll(() => sideWidth(alice)).toBe(640);
});

test('the overlay: its grip sets the width of the phase, stays collapsed and keeps the overlay open while dragged (B-113)', async ({ browser }) => {
  // Delia's advice (Andreas): the grip sets the width only – also on the overlay, without opening or collapsing
  const { alice } = await twoPlayers(browser, 'Sidebar Peek Grip');
  const grip = alice.locator('#side_grip');
  const handle = () => grip.evaluate(el => Number(getComputedStyle(el, '::after').opacity));
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await alice.waitForTimeout(500); // the rail has slid in
  await alice.mouse.move(200, 300);
  await expect(grip).toBeHidden();

  // hover opens the overlay: the grip lies at its left edge, its handle shows while the mouse is over the overlay
  await alice.locator('#rail_count').hover();
  await expect(container(alice)).toHaveClass(/side-peek/);
  await expect(grip).toBeVisible();
  await alice.waitForTimeout(400); // the overlay has slid in
  const side = (await alice.locator('#sidebar').boundingBox())!;
  expect(Math.round(side.width)).toBe(380);
  await alice.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await expect.poll(handle).toBeGreaterThan(0);
  const at = await gripOnTop(alice);
  expect(Math.abs(at.x - side.x)).toBeLessThanOrEqual(2);

  // drag: far out over the table (60vw at most), the overlay stays open, also after a while
  await alice.mouse.move(at.x, at.y);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.mouse.down();
  await alice.mouse.move(300, at.y, { steps: 5 });
  await alice.mouse.move(100, at.y, { steps: 5 });
  await expect(container(alice)).toHaveClass(/side-dragging/);
  expect(await sideW(alice)).toBe('60vw');
  await alice.waitForTimeout(500);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  // back to the middle and released there (on the overlay's edge): 50vw, still the open overlay over the rail
  await alice.mouse.move(700, at.y, { steps: 5 });
  await alice.mouse.move(640, at.y, { steps: 5 });
  await alice.mouse.up();
  await expect(container(alice)).not.toHaveClass(/side-dragging/);
  expect(await sideW(alice)).toBe('50vw');
  expect(await sideWidth(alice)).toBe(640);
  await alice.waitForTimeout(500);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(alice.locator('#side_rail')).toBeVisible();
  expect((await stored(alice)).voting).toEqual({ collapsed: true, width: 50 });

  // arrow keys on the grip as well: narrower by 2vw, still collapsed
  await grip.focus();
  await alice.keyboard.press('ArrowRight');
  await expect(grip).toHaveAttribute('aria-valuenow', '48');
  await alice.keyboard.press('ArrowLeft');
  expect((await stored(alice)).voting).toEqual({ collapsed: true, width: 50 });
  await expect(container(alice)).toHaveClass(/side-peek/);

  // leaving it: closes as usual
  await alice.mouse.move(200, 300);
  await expect(container(alice)).not.toHaveClass(/side-peek/);
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(grip).toBeHidden();

  // released outside the overlay: it closes after the usual delay
  await alice.locator('#rail_count').hover();
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.waitForTimeout(400);
  const at2 = await gripOnTop(alice);
  await alice.mouse.move(at2.x, at2.y);
  await alice.mouse.down();
  await alice.mouse.move(100, at2.y, { steps: 5 });
  await alice.mouse.up();
  expect(await sideW(alice)).toBe('60vw');
  await expect(container(alice)).not.toHaveClass(/side-peek/);
  expect((await stored(alice)).voting).toEqual({ collapsed: true, width: 60 });

  // pinned later: the new width
  await alice.locator('#side_open').click();
  await alice.locator('#side_pin').click();
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);
  await expect.poll(() => sideWidth(alice)).toBe(768);
  expect((await stored(alice)).voting).toEqual({ collapsed: false, width: 60 });
});

test('menu closed over the rail: no overlay until the mouse moves, then the pin pins at once (B-113)', async ({ browser }) => {
  // Andreas (staging): collapsed, menu opened, closed with X over the rail, the overlay opened by itself and the
  // pin then only kept it open (like ««) instead of pinning
  const { alice } = await twoPlayers(browser, 'Sidebar Menu Close');
  const menu = alice.locator('dialog#menu');
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await alice.mouse.move(200, 300);

  await alice.locator('#cset_btn').click();
  await expect(menu).toHaveAttribute('open');
  await panelSettled(menu);
  const x = (await alice.locator('#menu_close').boundingBox())!;
  const at = { x: x.x + x.width / 2, y: x.y + x.height / 2 };
  await alice.mouse.click(at.x, at.y);
  await expect(menu).not.toHaveAttribute('open');
  // the rail is now under the mouse standing still: no overlay
  expect(await alice.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('#side_rail') !== null, at)).toBe(true);
  await alice.waitForTimeout(500);
  await expect(container(alice)).not.toHaveClass(/side-peek/);

  // a slight move in the rail's upper part opens it
  await alice.mouse.move(at.x - 2, at.y + 2);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.waitForTimeout(300);

  // the pin pins: the column is open, no rail, stored
  await alice.locator('#side_pin').click();
  await expect(container(alice)).not.toHaveClass(/side-collapsed|side-peek/);
  await expect(alice.locator('#side_rail')).toBeHidden();
  await expect.poll(() => sideWidth(alice)).toBe(380);
  expect((await stored(alice)).voting.collapsed).toBe(false);
});

test('the rail\'s foot (timer, round button and the room around them) opens no overlay on hover (B-113)', async ({ browser }) => {
  const { alice } = await twoPlayers(browser, 'Sidebar Rail Foot');
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await alice.mouse.move(200, 300);

  const rail = (await alice.locator('#side_rail').boundingBox())!;
  const round = (await alice.locator('#rail_round').boundingBox())!;
  const spots = [
    { x: round.x - 5, y: round.y + round.height / 2 },              // left of the button
    { x: round.x + round.width + 5, y: round.y + round.height / 2 }, // right of it
    { x: round.x + round.width / 2, y: round.y + round.height + 10 }, // below it
    { x: rail.x + rail.width / 2, y: rail.y + rail.height - 3 },     // at the rail's bottom edge
  ];
  for (const spot of spots) {
    await alice.mouse.move(spot.x, spot.y, { steps: 3 });
    await alice.waitForTimeout(300);
    await expect(container(alice)).not.toHaveClass(/side-peek/);
    await alice.mouse.move(200, 300);
    await alice.waitForTimeout(300);
  }

  // the upper part still opens it
  await alice.locator('#rail_count').hover();
  await expect(container(alice)).toHaveClass(/side-peek/);
});

test('each phase keeps its own state; the rail shows the range and starts a new round (B-113)', async ({ browser }) => {
  const { alice, bob } = await twoPlayers(browser, 'Sidebar Phases');

  // voting: collapsed
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);

  // reveal: the revealed phase has no state yet, so the column opens (as before)
  await pickCard(alice, 'three01');
  await pickCard(bob, 'eight01');
  await expect(container(alice)).toHaveAttribute('data-phase', 'revealed');
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);
  await expect(alice.locator('#spread')).toBeVisible();

  // revealed: collapse; the rail shows the range 3 – 8 and the filled "New round"
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  // the same values as #spread_range in the column (without "range"), one above the other
  await expect(alice.locator('#spread_range')).toHaveText('range 3\u20138');
  await expect(alice.locator('#rail_range > *')).toHaveCount(3);
  await expect(alice.locator('#rail_range .rail-to')).toHaveCount(1);
  await expect(alice.locator('#rail_range')).toHaveText('3\u20138');
  expect(await alice.locator('#rail_range > .sm-text').count()).toBe(2);
  // the mini bars on top, the range below them (B-113, Andreas: to try out)
  const below = async (upper: string, lower: string) => {
    const u = (await alice.locator(upper).boundingBox())!;
    const l = (await alice.locator(lower).boundingBox())!;
    return u.y + u.height <= l.y + 0.5;
  };
  await expect(alice.locator('#rail_bars')).toBeVisible();
  expect(await below('#rail_bars', '#rail_range')).toBe(true);
  // the same type as #spread_range in the column (Andreas: not larger): size, weight, line
  const type = (selector: string) => alice.locator(selector).first().evaluate(el => {
    const style = getComputedStyle(el);
    return [style.fontSize, style.fontWeight, style.lineHeight, style.fontFamily].join(' ');
  });
  expect(await type('#rail_range')).toBe(await type('#spread_range'));
  expect(await type('#rail_range > .sm-text')).toBe(await type('#spread_range > .sm-text'));
  await expect(alice.locator('#rail_count')).toBeHidden();
  const round = alice.locator('#rail_round');
  await expect(round).toHaveClass(/primary/);
  await expect(round).toHaveAttribute('aria-label', 'New round');

  // the rail button starts a new round: back to voting (collapsed, its own state); hovering it opens no overlay
  await alice.mouse.move(200, 300);
  await round.hover();
  await alice.waitForTimeout(300);
  await expect(container(alice)).not.toHaveClass(/side-peek/);
  await round.click();
  await expect(container(alice)).toHaveAttribute('data-phase', 'voting');
  await expect(alice.locator('#round_status')).toHaveText('voting · 0 of 2 voted');
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(round).not.toHaveClass(/primary/);
  await expect(round).toBeDisabled();

  // voting open again, revealed stays collapsed: the phase change switches to it
  await alice.locator('#side_open').click();
  await alice.locator('#side_pin').click();
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);
  await pickCard(alice, 'five001');
  await pickCard(bob, 'five001');
  await expect(container(alice)).toHaveAttribute('data-phase', 'revealed');
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  // all agree: one card; ? and coffee do not count
  await expect(alice.locator('#rail_range > *')).toHaveCount(1);
  await expect(alice.locator('#rail_range')).toHaveText('5');

  // only "?": no range, the rail shows the check alone ("revealed" for screen readers only) and the mini bars
  await round.click();
  await expect(container(alice)).toHaveAttribute('data-phase', 'voting');
  await pickCard(alice, 'qstmrk1');
  await pickCard(bob, 'qstmrk1');
  await expect(container(alice)).toHaveAttribute('data-phase', 'revealed');
  await expect(alice.locator('#rail_range')).toBeEmpty();
  const shown = alice.locator('.rail-shown');
  await expect(shown.locator('.i')).toBeVisible();
  await expect(shown).toHaveText('revealed');
  await expect(shown.locator('.sr-only')).toHaveText('revealed');
  await expect(alice.locator('#rail_bars')).toBeVisible();
  // the check in the range's place: below the bars
  expect(await below('#rail_bars', '.rail-shown')).toBe(true);
  if (process.env.B113_SHOT) { // manual check of the look (not in CI)
    await alice.locator('#side_rail').screenshot({ path: process.env.B113_SHOT + '-dark.png' });
    await alice.evaluate(() => document.body.classList.add('light-theme'));
    await alice.locator('#side_rail').screenshot({ path: process.env.B113_SHOT + '-light.png' });
    await alice.evaluate(() => document.body.classList.remove('light-theme'));
  }

  // the other board (Bob) has its own browser: unchanged
  await expect(container(bob)).not.toHaveClass(/side-collapsed/);
});

test('stars and T-shirt sizes show a range, traffic lights none; the mini bars have a column per card (B-113)', async ({ browser }) => {
  const { alice, bob, url } = await twoPlayers(browser, 'Sidebar Stars');
  const range = alice.locator('#spread_range');
  const railBars = alice.locator('#rail_bars > i');
  const heights = () => railBars.evaluateAll(bars => bars.map(bar => Math.round(bar.getBoundingClientRect().height)));
  const round = async (deck: string, deckLength: number, a: string, b: string) => {
    await setTeamDeck(alice, url, deck, null, ['qstmrk1']);
    await expect(alice.locator('#spread_bars .spread-col')).toHaveCount(deckLength + 1);
    await pickCard(alice, a);
    await pickCard(bob, b);
    await expect(container(alice)).toHaveAttribute('data-phase', 'revealed');
  };

  if (process.env.B113_SHOT) await alice.evaluate(() => document.body.classList.add('light-theme')); // manual look check
  // stars: "range 1★–3★" in the mini looks of the spread, the same in the rail
  await round('stars', 6, '1star01', '3stars1');
  await expect(range).toHaveAttribute('data-shows', '1star01,3stars1');
  await expect(range).toContainText('range');
  await expect(range.locator(':scope > *')).toHaveCount(2);
  if (process.env.B113_SHOT) await alice.locator('#sidebar').screenshot({ path: process.env.B113_SHOT + '-open-light.png' });
  await alice.locator('#side_collapse').click();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(alice.locator('#rail_range')).toHaveAttribute('data-shows', '1star01,3stars1');
  await expect(alice.locator('#rail_range > *')).toHaveCount(3);
  await expect(alice.locator('#rail_range .rail-to')).toHaveCount(1);

  // mini bars, a fingerprint of the big spread: one per column (6 stars and ?), a 1px base line, higher only where
  // votes are
  await expect(railBars).toHaveCount(7);
  const keys = await alice.locator('#spread_bars .spread-col').evaluateAll(cols => cols.map(col => col.getAttribute('data-card')));
  const starHeights = await heights();
  keys.forEach((key, i) => {
    // as in the big spread: one vote of two players is half the full height (22px)
    if (key === '1star01' || key === '3stars1') expect(starHeights[i]).toBe(11);
    else expect(starHeights[i]).toBe(1);
  });
  // all within the tile (measured in one go: the rail may still be sliding in)
  await expect.poll(() => alice.locator('.rail-result').evaluate(tile => {
    const box = tile.getBoundingClientRect();
    return Array.from(tile.querySelectorAll('#rail_bars > i')).every(bar => {
      const r = bar.getBoundingClientRect();
      return r.left >= box.left && r.right <= box.right;
    });
  })).toBe(true);
  if (process.env.B113_SHOT) await alice.locator('#side_rail').screenshot({ path: process.env.B113_SHOT + '-rail-light.png' });

  // T-shirt sizes: a range too
  await alice.locator('#rail_round').click();
  await round('tshirt', 7, 'l000001', 's000001');
  await expect(range).toHaveAttribute('data-shows', 's000001,l000001');
  await expect(alice.locator('#rail_range')).toHaveAttribute('data-shows', 's000001,l000001');

  // traffic lights ("range": false in card_catalog.json): no range, the check; the mini bars still show
  await alice.locator('#rail_round').click();
  await round('traffic', 3, 'green01', 'green01');
  await expect(range).toHaveText('');
  await expect(alice.locator('#rail_range')).toBeEmpty();
  await expect(alice.locator('.rail-shown .i')).toBeVisible();
  await expect(railBars).toHaveCount(4);
  const trafficHeights = await heights();
  expect(trafficHeights[0]).toBe(22); // green: two votes of two players, the full height
  expect(trafficHeights.slice(1)).toEqual([1, 1, 1]);
  await expect(railBars.first()).toHaveClass('top');
});

test('the rail timer shows just the time, past the timebox amber and counting up (B-113)', async ({ browser }) => {
  const { alice, bob, url } = await twoPlayers(browser, 'Sidebar Timer');
  const rail = alice.locator('#rail_timer');
  await openTimerPanel(alice);
  await alice.locator('input[name=tmr_visibility][value="1"]').check();
  await alice.locator('input[name=tmr_mode][value="TIMER"]').check();
  await alice.locator('input[name=tmr_timebox][value="5"]').check();
  await alice.locator('#menu_close').click();
  await expect(alice.locator('#timer_display')).toHaveText('T−05:00');

  // the rail mirrors it (also while hidden): no T−
  await expect(rail).toHaveText('05:00');
  await expect(rail).toHaveAttribute('aria-label', 'Timer: 5 min 0 s left, not started');
  await expect(rail).toHaveAttribute('data-over', 'false');

  // running (start is in the column): the collapsed rail counts down, still without prefix
  await alice.getByRole('button', { name: 'Start timer' }).click();
  await alice.locator('#side_collapse').click();
  await expect(rail).toBeVisible();
  await expect(rail).toHaveText(/^04:5\d$/);
  await expect(rail).toHaveAttribute('aria-label', /^Timer: 4 min \d+ s left$/);

  // past the timebox (started 5 min 7 s ago): the time counts up without T+, in amber like #timer
  const id = new URL(url).searchParams.get('t') as string;
  expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  sql(`update pok_teams_tbl set timer_start_time = timestampadd(SECOND, -307, current_timestamp), timer_pause_time = null where id = '${id}'`);
  await alice.reload();
  await expect(alice.locator('#timer_display')).toHaveText(/^T\+00:\d\d$/);
  await expect(rail).toHaveText(/^00:\d\d$/);
  await expect(rail).toHaveAttribute('data-over', 'true');
  await expect(rail).toHaveAttribute('aria-label', /^Timer: time is up, .* over$/);
  await expect(rail).toHaveCSS('color', await alice.locator('#timer_display').evaluate(el => getComputedStyle(el).color));
  const before = await rail.textContent();
  await expect(rail).not.toHaveText(before!); // counts on (up)
  await alice.context().close();
  await bob.context().close();
});

test('the spread pointer follows the column width (B-113)', async ({ browser }) => {
  const { alice, bob, url } = await twoPlayers(browser, 'Sidebar Spread');
  const t = new URL(url).searchParams.get('t')!;
  expect((await alice.request.post(`/api/update_show_avg.php?t=${encodeURIComponent(t)}&show_avg=1`)).ok()).toBeTruthy();
  await pickCard(alice, 'three01');
  await pickCard(bob, 'eight01');
  await expect(container(alice)).toHaveAttribute('data-phase', 'revealed');
  const pointer = alice.locator('#spread_index');
  await expect(pointer).toHaveClass(/visible/);
  const before = (await pointer.boundingBox())!.x;
  const grip = alice.locator('#side_grip');
  await grip.focus();
  for (let i = 0; i < 5; i++) await alice.keyboard.press('ArrowLeft');
  await expect.poll(async () => Math.round((await pointer.boundingBox())!.x)).toBeLessThan(Math.round(before) - 20);
  // the pointer stays between the columns of 3 and 8
  const p = (await pointer.boundingBox())!;
  const three = (await alice.locator('#spread_bars [data-card="three01"]').boundingBox())!;
  const eight = (await alice.locator('#spread_bars [data-card="eight01"]').boundingBox())!;
  expect(p.x + p.width / 2).toBeGreaterThan(three.x);
  expect(p.x + p.width / 2).toBeLessThan(eight.x + eight.width);
});

test('a quiet hint names the phase after »», the pin and the grip, about 2s, 3 times per case (B-113)', async ({ browser }) => {
  test.setTimeout(120_000); // many hints of ~2s each
  const { alice, bob } = await twoPlayers(browser, 'Sidebar Hint');
  const hint = alice.locator('#side_hint');
  const grip = alice.locator('#side_grip');
  const box = async (selector: string) => (await alice.locator(selector).boundingBox())!;
  const counts = async () => JSON.parse(await alice.evaluate(() => localStorage.getItem('SIDEBAR_HINTS') ?? '{}'));
  await expect(hint).toBeHidden();
  await expect(hint).toHaveAttribute('aria-live', 'polite');

  const collapse = async () => {
    await alice.locator('#side_collapse').click();
    await expect(container(alice)).toHaveClass(/side-collapsed/);
  };
  const pin = async () => {
    await alice.locator('#side_open').click();
    await expect(container(alice)).toHaveClass(/side-peek/);
    await alice.locator('#side_pin').click();
    await expect(container(alice)).not.toHaveClass(/side-collapsed/);
  };
  const shown = async (text: string) => {
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(text);
    await expect(hint).toBeHidden({ timeout: 4000 });
  };
  const none = async () => {
    await alice.waitForTimeout(600);
    await expect(hint).not.toHaveClass(/shown/);
  };

  // »» while voting – next to the rail, at its top; gone after about 2s (still there after 1.2s)
  await collapse();
  await expect(hint).toHaveText('setting saved for voting panel');
  await expect(hint).toHaveAttribute('data-at', 'top');
  await expect.poll(async () => (await box('#side_rail')).x - (await box('#side_hint')).x - (await box('#side_hint')).width)
    .toBeGreaterThanOrEqual(0);
  await alice.waitForTimeout(1200);
  await expect(hint).toHaveClass(/shown/);
  await expect(hint).toBeHidden({ timeout: 2500 });
  expect(await counts()).toEqual({ collapse: 1 });

  // the pin – next to the column's left edge; counted on its own
  await pin();
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('setting saved for voting panel');
  await expect.poll(async () => (await box('#sidebar')).x - (await box('#side_hint')).x - (await box('#side_hint')).width)
    .toBeGreaterThanOrEqual(0);
  await expect(hint).toBeHidden({ timeout: 4000 });
  expect(await counts()).toEqual({ collapse: 1, pin: 1 });

  // »» and the pin twice more each, then neither shows again
  await collapse(); await shown('setting saved for voting panel');
  await pin(); await shown('setting saved for voting panel');
  await collapse(); await shown('setting saved for voting panel');
  await pin(); await shown('setting saved for voting panel');
  expect(await counts()).toEqual({ collapse: 3, pin: 3 });
  await collapse(); await none();
  await pin(); await none();
  expect(await counts()).toEqual({ collapse: 3, pin: 3 });

  // the grip while voting: its own case (keys held on one hint count once)
  await grip.focus();
  await alice.keyboard.press('ArrowLeft');
  await alice.keyboard.press('ArrowRight');
  await expect(hint).toHaveText('setting saved for voting panel');
  await expect(hint).toHaveAttribute('data-at', 'grip');
  await expect(hint).toBeHidden({ timeout: 4000 });
  for (let i = 0; i < 2; i++) {
    await alice.keyboard.press('ArrowLeft');
    await shown('setting saved for voting panel');
  }
  expect(await counts()).toEqual({ collapse: 3, pin: 3, width_voting: 3 });
  await alice.keyboard.press('ArrowRight');
  await none();

  // after the reveal: »» and the pin stay silent (counted for all phases), the grip counts anew for results
  await pickCard(alice, 'three01');
  await pickCard(bob, 'eight01');
  await expect(container(alice)).toHaveAttribute('data-phase', 'revealed');
  await collapse(); await none();
  await pin(); await none();

  // dragging the grip – next to its handle, it stays while dragged and fades about 2s after the release
  await alice.mouse.move(200, 300); // the handle shows on hover only; the grip is there anyway
  const g = await box('#side_grip');
  await alice.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await alice.mouse.down();
  await alice.mouse.move(700, g.y + g.height / 2, { steps: 5 });
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('setting saved for results panel');
  await expect(hint).toHaveAttribute('data-at', 'grip');
  const h = await box('#side_hint');
  const g2 = await box('#side_grip');
  expect(h.x + h.width).toBeLessThanOrEqual(g2.x + g2.width / 2);
  expect(Math.abs(h.y + h.height / 2 - (g2.y + g2.height / 2))).toBeLessThan(10);
  await alice.waitForTimeout(2500);
  await expect(hint).toBeVisible();
  await alice.mouse.move(680, g.y + g.height / 2, { steps: 3 });
  await alice.mouse.up();
  await expect(hint).toBeHidden({ timeout: 4000 });
  expect(await counts()).toEqual({ collapse: 3, pin: 3, width_voting: 3, width_revealed: 1 });
});

test('the hint: an old plain count is ignored, a case at 3 stays silent while the others show (B-113)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Sidebar Hint Old');
  await joinAsPlayer(alice, url, 'Alice');
  await alice.evaluate(() => localStorage.setItem('SIDEBAR_HINTS', '4')); // the count before (all cases together)
  const hint = alice.locator('#side_hint');
  await alice.locator('#side_collapse').click();
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('setting saved for voting panel');
  expect(JSON.parse(await alice.evaluate(() => localStorage.getItem('SIDEBAR_HINTS') ?? ''))).toEqual({ collapse: 1 });

  await alice.evaluate(() => localStorage.setItem('SIDEBAR_HINTS', JSON.stringify({ pin: 3 })));
  await expect(hint).toBeHidden({ timeout: 4000 });
  await alice.locator('#side_open').click();
  await alice.locator('#side_pin').click();
  await expect(container(alice)).not.toHaveClass(/side-collapsed/);
  await alice.waitForTimeout(600);
  await expect(hint).not.toHaveClass(/shown/);
  await alice.locator('#side_collapse').click();
  await expect(hint).toBeVisible();
  expect(JSON.parse(await alice.evaluate(() => localStorage.getItem('SIDEBAR_HINTS') ?? ''))).toEqual({ pin: 3, collapse: 1 });
});

test('phones: no rail, no state, even with a stored one (B-113)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await alice.addInitScript(() => {
    localStorage.setItem('SIDEBAR_STATE', JSON.stringify({ voting: { collapsed: true, width: 40 } }));
  });
  const url = await createTeam(alice, 'Sidebar Phone');
  await joinAsPlayer(alice, url, 'Alice');
  await expect(alice.locator('#round_status')).toBeHidden();
  await expect(alice.locator('#side_rail')).toBeHidden();
  await expect(alice.locator('#side_collapse')).toBeHidden();
  await expect(alice.locator('#side_grip')).toBeHidden();
  await expect(alice.locator('#side_hint')).toBeHidden();
  await expect(container(alice)).not.toHaveAttribute('data-phase', /.*/);
  await expect(container(alice)).not.toHaveClass(/side-/);
  expect(await sideW(alice)).toBe('');
});

test('the deck hint follows the width of the column: hidden when the grip widens it, back when narrower (B-113)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: DESKTOP });
  const url = await createTeam(alice, 'Sidebar Deck Hint');
  await setLegacyDeck(alice, new URL(url).searchParams.get('t')!, [0, 2, 3, 4, 6, 9, 10, 11, 12, 13]); // 10 cards
  await joinAsPlayer(alice, url, 'Alice');
  await expect(deckCards(alice)).toHaveCount(10);
  const down = alice.locator('#down-container');
  const hint = alice.locator('.deck-hint');
  const lastKeyRight = async () => {
    const keys = alice.locator('#ctl .ctl-key');
    return (await keys.nth((await keys.count()) - 1).boundingBox())!;
  };
  const clear = async () => (await lastKeyRight()).x + (await lastKeyRight()).width <= (await hint.boundingBox())!.x;

  // default width: the hint in the row of the keys, clear of the last key
  await expect(down).not.toHaveClass(/hint-off/);
  await expect(hint).toBeVisible();
  expect(await clear()).toBe(true);

  // the grip widens the column to 60vw (no window resize): the hint no longer fits, hidden
  const g = (await alice.locator('#side_grip').boundingBox())!;
  await dragGrip(alice, { x: g.x + g.width / 2, y: 400 }, 100);
  expect(await sideW(alice)).toBe('60vw');
  await expect(down).toHaveClass(/hint-off/);
  await expect(hint).toBeHidden();

  // narrower again: the hint is back, still clear of the last key
  const g2 = (await alice.locator('#side_grip').boundingBox())!;
  await dragGrip(alice, { x: g2.x + g2.width / 2, y: 400 }, 1250);
  expect(await sideW(alice)).toBe('20vw');
  await expect(down).not.toHaveClass(/hint-off/);
  await expect(hint).toBeVisible();
  expect(await clear()).toBe(true);
});
