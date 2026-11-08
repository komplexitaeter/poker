import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, pickCard, openTimerPanel } from './helpers';

/**
 * B-113 (cut 1): on large screens with a mouse the column can be collapsed to a narrow rail (hover opens it as an
 * overlay, the pin keeps it open) and resized with the grip (20-60vw, below ~14vw it collapses; arrow keys ±2).
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

  // the pin lies where «« is: hover opened the overlay and the mouse has not moved since, so a click there was
  // meant for «« – it keeps the overlay open, it does not pin; however long it took (no timing)
  const openBox = (await alice.locator('#side_open').boundingBox())!;
  const at = { x: openBox.x + openBox.width / 2, y: openBox.y + openBox.height / 2 };
  await alice.mouse.move(at.x, at.y);
  await expect(container(alice)).toHaveClass(/side-peek/);
  await alice.waitForTimeout(600); // a slow click (or a slow CI runner)
  expect(await alice.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('#side_pin') !== null, at)).toBe(true);
  await alice.mouse.click(at.x, at.y);
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await alice.mouse.move(200, 300);
  await alice.waitForTimeout(400);
  await expect(container(alice)).toHaveClass(/side-peek/); // open for good, like a click on ««
  await alice.keyboard.press('Escape');
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

test('the grip: drag and arrow keys set the width (kept on reload), below the minimum it collapses (B-113)', async ({ browser }) => {
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

  // dragged below ~14vw: the grip warns, the release collapses; the width before stays for later
  const g3 = (await grip.boundingBox())!;
  await alice.mouse.move(g3.x + g3.width / 2, 400);
  await alice.mouse.down();
  await alice.mouse.move(1250, 400, { steps: 8 });
  await expect(container(alice)).toHaveClass(/side-snap/);
  await alice.mouse.up();
  await expect(container(alice)).toHaveClass(/side-collapsed/);
  await expect(container(alice)).not.toHaveClass(/side-snap/);
  expect(await sideW(alice)).toBe(kept);
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

  // the other board (Bob) has its own browser: unchanged
  await expect(container(bob)).not.toHaveClass(/side-collapsed/);
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
  await expect(container(alice)).not.toHaveAttribute('data-phase', /.*/);
  await expect(container(alice)).not.toHaveClass(/side-/);
  expect(await sideW(alice)).toBe('');
});
