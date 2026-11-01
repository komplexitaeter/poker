import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, pickCard, teamWithTwoPlayers, openTimerPanel } from './helpers';

/**
 * B-66/B-67: timer instead of stopwatch (frontend). The header button :timer opens the timer panel:
 * on/off for everyone, mode Stopwatch | Timer, timebox (presets + other, Timer mode only) and
 * "Auto-start on new round". Every change is saved right away, the panel of everyone else follows.
 * The corner (bottom right; phones: the row above the deck) shows T−mm:ss / T+mm:ss above the round
 * button with play/pause and reset; past the timebox T+ in amber. B-79: the stopwatch shows just mm:ss.
 * SHOT_DIR (optional): screenshots desktop 1440 and phone 390.
 */

const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-e', statement],
    { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

const teamId = (url: string) => {
  const id = new URL(url).searchParams.get('t') as string;
  expect(id).toMatch(/^[A-Za-z0-9_-]+$/); // safe to use in the statements below
  return id;
};

const display = (page: Page) => page.locator('#timer_display');
const radio = (page: Page, name: string, value: string) => page.locator(`input[name=${name}][value="${value}"]`);

async function shot(page: Page, name: string): Promise<void> {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` });
}

test('timer on in the panel: everyone sees it, the other panel follows (B-67)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Timer Panel');
  await expect(alice.locator('#stopwatch_btn')).toHaveCount(0); // the old switch is gone
  await openTimerPanel(alice);
  await openTimerPanel(bob);

  // defaults: off, stopwatch, no auto-start; no timebox in stopwatch mode
  await expect(radio(alice, 'tmr_visibility', '0')).toBeChecked();
  await expect(radio(alice, 'tmr_mode', 'STOPWATCH')).toBeChecked();
  await expect(radio(alice, 'tmr_auto_restart', '0')).toBeChecked();
  await expect(alice.locator('#tmr_timebox')).toBeHidden();
  await expect(alice.locator('#timer')).toBeHidden();

  await radio(alice, 'tmr_visibility', '1').check();
  for (const page of [alice, bob]) {
    await expect(page.locator('#timer')).toBeVisible();
    await expect(display(page)).toHaveText('00:00'); // B-79: stopwatch without T+
    await expect(page.locator('#timer')).toHaveAttribute('data-state', 'ready');
  }
  await expect(radio(bob, 'tmr_visibility', '1')).toBeChecked();

  // mode and timebox: Bob's panel follows
  await radio(alice, 'tmr_mode', 'TIMER').check();
  await expect(alice.locator('#tmr_timebox')).toBeVisible();
  await expect(radio(bob, 'tmr_mode', 'TIMER')).toBeChecked();
  await expect(bob.locator('#tmr_timebox')).toBeVisible();
  await expect(radio(bob, 'tmr_timebox', '5')).toBeChecked(); // default 300 s
  await expect(display(bob)).toHaveText('T−05:00');

  await radio(bob, 'tmr_visibility', '0').check();
  await expect(alice.locator('#timer')).toBeHidden();
  await expect(radio(alice, 'tmr_visibility', '0')).toBeChecked();
  await alice.context().close();
  await bob.context().close();
});

test('timebox presets, other minutes and auto-start: the other panel follows (B-67)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Timer Timebox');
  await openTimerPanel(alice);
  await openTimerPanel(bob);
  await radio(alice, 'tmr_visibility', '1').check();
  await radio(alice, 'tmr_mode', 'TIMER').check();
  await expect(display(bob)).toHaveText('T−05:00');

  await radio(alice, 'tmr_timebox', '10').check();
  await expect(radio(bob, 'tmr_timebox', '10')).toBeChecked();
  await expect(display(bob)).toHaveText('T−10:00');

  // other: 90 minutes, shown as h:mm:ss; no preset checked
  await alice.locator('#tmr_other').fill('90');
  await alice.locator('#tmr_other').press('Enter');
  await expect(bob.locator('#tmr_other')).toHaveValue('90');
  await expect(bob.locator('input[name=tmr_timebox]:checked')).toHaveCount(0);
  await expect(display(bob)).toHaveText('T−1:30:00');
  // out of range: not saved
  await alice.locator('#tmr_other').fill('241');
  await alice.locator('#tmr_other').press('Enter');
  await expect(bob.locator('#tmr_other')).toHaveValue('90');
  await alice.keyboard.press('Escape');

  await radio(alice, 'tmr_auto_restart', '1').check();
  await expect(radio(bob, 'tmr_auto_restart', '1')).toBeChecked();
  await alice.context().close();
  await bob.context().close();
});

test('timer mode 5 min: T−05:00, start, pause, reset; time up in amber (B-67)', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'Timer Run');
  await openTimerPanel(alice);
  await radio(alice, 'tmr_visibility', '1').check();
  await radio(alice, 'tmr_mode', 'TIMER').check();
  await radio(alice, 'tmr_timebox', '5').check();
  await alice.locator('#menu_close').click();

  await expect(display(bob)).toHaveText('T−05:00');
  await expect(display(bob)).toHaveAttribute('aria-label', 'Timer: 5 min 0 s left, not started');

  await alice.getByRole('button', { name: 'Start timer' }).click();
  for (const page of [alice, bob]) {
    await expect(page.locator('#timer')).toHaveAttribute('data-state', 'running');
    await expect(display(page)).toHaveText(/^T−04:5\d$/);
    await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start timer' })).toBeHidden();
  }

  await bob.getByRole('button', { name: 'Pause timer' }).click();
  await expect(alice.locator('#timer')).toHaveAttribute('data-state', 'paused');
  const paused = await display(alice).textContent();
  await alice.waitForTimeout(1500);
  await expect(display(alice)).toHaveText(paused!);
  await expect(display(alice)).toHaveAttribute('aria-label', /, paused$/);

  await alice.getByRole('button', { name: 'Reset timer' }).click();
  for (const page of [alice, bob]) {
    await expect(display(page)).toHaveText('T−05:00');
    await expect(page.locator('#timer')).toHaveAttribute('data-state', 'ready');
  }

  // time up: started 5 min 7 s ago -> T+00:07 in amber
  sql(`update pok_teams_tbl set timer_start_time = timestampadd(SECOND, -307, current_timestamp), timer_pause_time = null where id = '${teamId(url)}'`);
  await alice.reload();
  await expect(display(alice)).toHaveText(/^T\+00:0\d$/);
  await expect(alice.locator('#timer')).toHaveAttribute('data-over', 'true');
  await expect(display(alice)).toHaveCSS('color', 'rgb(255, 181, 71)'); // --warn (dark theme)
  await alice.context().close();
  await bob.context().close();
});

test('stopwatch shows just the elapsed time, no T+ and no amber (B-79)', async ({ browser }) => {
  const { alice, bob, url } = await teamWithTwoPlayers(browser, 'Stopwatch Plain');
  await openTimerPanel(alice);
  await radio(alice, 'tmr_visibility', '1').check();
  await expect(radio(alice, 'tmr_mode', 'STOPWATCH')).toBeChecked();
  await alice.locator('#menu_close').click();
  await expect(display(bob)).toHaveText('00:00');
  await expect(display(bob)).toHaveAttribute('aria-label', 'Stopwatch: 0 s elapsed, not started');

  await alice.getByRole('button', { name: 'Start timer' }).click();
  await expect(bob.locator('#timer')).toHaveAttribute('data-state', 'running');
  await expect(display(bob)).toHaveText(/^00:0\d$/);

  // running for 3 min 12 s: 03:12, never amber (no timebox)
  sql(`update pok_teams_tbl set timer_start_time = timestampadd(SECOND, -192, current_timestamp), timer_pause_time = null where id = '${teamId(url)}'`);
  await alice.reload();
  await expect(display(alice)).toHaveText(/^03:1\d$/);
  await expect(alice.locator('#timer')).toHaveAttribute('data-over', 'false');

  // the timer mode keeps its prefix (switching the mode resets the time)
  await openTimerPanel(alice);
  await radio(alice, 'tmr_mode', 'TIMER').check();
  await alice.locator('#menu_close').click();
  await expect(display(bob)).toHaveText('T−05:00');
  await alice.context().close();
  await bob.context().close();
});

test('auto-start: New round and Cancel round restart the timer (B-67)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Timer Auto');
  await openTimerPanel(alice);
  await radio(alice, 'tmr_visibility', '1').check();
  await radio(alice, 'tmr_mode', 'TIMER').check();
  await radio(alice, 'tmr_timebox', '3').check();
  await radio(alice, 'tmr_auto_restart', '1').check();
  await alice.locator('#menu_close').click();
  await expect(display(bob)).toHaveText('T−03:00');
  await expect(bob.locator('#timer')).toHaveAttribute('data-state', 'ready');

  // Cancel round starts it
  await pickCard(alice, 'three01');
  await expect(alice.locator('#newroundbtn')).toHaveValue('Cancel Round');
  await alice.locator('#newroundbtn').click();
  for (const page of [alice, bob]) {
    await expect(page.locator('#timer')).toHaveAttribute('data-state', 'running');
    await expect(display(page)).toHaveText(/^T−02:5\d|T−03:00$/);
  }

  // paused (after a moment: paused at 0 s looks like "not started"), then New round (all voted)
  // starts it again from the timebox
  await alice.waitForTimeout(2000);
  await alice.getByRole('button', { name: 'Pause timer' }).click();
  await expect(bob.locator('#timer')).toHaveAttribute('data-state', 'paused');
  await pickCard(alice, 'three01');
  await pickCard(bob, 'three01');
  await expect(alice.locator('#newroundbtn')).toHaveValue('New Round');
  await alice.locator('#newroundbtn').click();
  await expect(bob.locator('#timer')).toHaveAttribute('data-state', 'running');
  await expect(display(bob)).toHaveText(/^T−02:5\d|T−03:00$/);
  await alice.context().close();
  await bob.context().close();
});

test('screenshots: timer off, running, time up, panel (B-67)', async ({ browser }) => {
  test.skip(!process.env.SHOT_DIR, 'screenshots only');
  test.setTimeout(120_000);
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1440, height: 900 }, false],
    ['phone', { width: 390, height: 844 }, true],
  ] as const) {
    const alice = await newPlayer(browser, { viewport, hasTouch: mobile, isMobile: mobile });
    const url = await createTeam(alice, `Timer Shots ${name}`);
    await joinAsPlayer(alice, url, 'Alice');
    const bob = await newPlayer(browser);
    await joinAsPlayer(bob, url, 'Bob');
    await pickCard(bob, 'five001');
    await expect(alice.locator('#newroundbtn')).toBeEnabled();
    await alice.waitForTimeout(1000);
    await shot(alice, `b67-fred-${name}-timer-off`);

    await openTimerPanel(alice);
    await radio(alice, 'tmr_visibility', '1').check();
    await radio(alice, 'tmr_mode', 'TIMER').check();
    await radio(alice, 'tmr_timebox', '5').check();
    await radio(alice, 'tmr_auto_restart', '1').check();
    await alice.locator('input[name=tmr_visibility]:checked').focus();
    await alice.locator('input[name=tmr_visibility]:checked').blur();
    await alice.waitForTimeout(800);
    await shot(alice, `b67-fred-${name}-panel`);
    await alice.locator('#menu_close').click();

    sql(`update pok_teams_tbl set timer_start_time = timestampadd(SECOND, -108, current_timestamp), timer_pause_time = null where id = '${teamId(url)}'`);
    await alice.reload();
    await expect(alice.locator('#timer')).toHaveAttribute('data-state', 'running');
    await alice.waitForTimeout(1000);
    await shot(alice, `b67-fred-${name}-running`);

    await pickCard(alice, 'three01');
    sql(`update pok_teams_tbl set timer_start_time = timestampadd(SECOND, -348, current_timestamp), timer_pause_time = null where id = '${teamId(url)}'`);
    await alice.reload();
    await expect(alice.locator('#timer')).toHaveAttribute('data-over', 'true');
    await alice.waitForTimeout(1500);
    await shot(alice, `b67-fred-${name}-time-up-revealed`);
    await alice.context().close();
    await bob.context().close();
  }
});

test('other minutes: a plain text field, Enter saves and leaves, Escape drops, marked like a preset (B-67 feedback)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Timer Other');
  await openTimerPanel(alice);
  await openTimerPanel(bob);
  await radio(alice, 'tmr_visibility', '1').check();
  await radio(alice, 'tmr_mode', 'TIMER').check();
  await expect(display(bob)).toHaveText('T−05:00');
  const other = alice.locator('#tmr_other');
  const row = (page: Page) => page.locator('.tmr-other');
  await expect(row(alice)).toHaveAttribute('data-set', 'false');

  // a text field with a number keyboard, no spin buttons (Safari, Chrome and Firefox alike);
  // focus keeps the hint; Enter saves and takes the focus away
  await expect(other).toHaveAttribute('type', 'text');
  await expect(other).toHaveAttribute('inputmode', 'numeric');
  await other.click();
  await expect(other).toHaveValue('');
  await expect(other).toHaveAttribute('placeholder', '1–240');
  await other.pressSequentially('7');
  await other.press('Enter');
  await expect(other).not.toBeFocused();
  await expect(other).toHaveValue('7');
  await expect(alice.locator('#tmr_other_error')).toBeHidden();
  for (const page of [alice, bob]) {
    await expect(row(page)).toHaveAttribute('data-set', 'true'); // marked like a checked preset
    await expect(page.locator('input[name=tmr_timebox]:checked')).toHaveCount(0);
    await expect(display(page)).toHaveText('T−07:00');
  }
  // the mark looks like a checked preset (inverted)
  const presetBg = await radio(alice, 'tmr_mode', 'TIMER').evaluate(
    el => getComputedStyle(el.nextElementSibling as Element).backgroundColor);
  expect(await other.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(presetBg);

  // focus keeps the set value visible (plain field, readable text); invalid: message, nothing saved,
  // the field keeps the focus; typing again hides the message
  await other.click();
  await expect(other).toHaveValue('7');
  const colors = await other.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(colors[0]).not.toBe(colors[1]);
  await other.press('ControlOrMeta+a');
  await other.pressSequentially('300');
  await other.press('Enter');
  await expect(alice.locator('#tmr_other_error')).toBeVisible();
  await expect(other).toBeFocused();
  await other.press('Backspace');
  await expect(alice.locator('#tmr_other_error')).toBeHidden();

  // while Alice types, an update from Bob does not overwrite the field; Escape drops the input
  // and the field then shows the stored value
  await radio(bob, 'tmr_auto_restart', '1').check();
  await expect(radio(alice, 'tmr_auto_restart', '1')).toBeChecked();
  await expect(other).toHaveValue('30');
  await other.press('Escape');
  await expect(other).not.toBeFocused();
  await expect(other).toHaveValue('7');
  await expect(alice.locator('#menu')).toBeVisible(); // Escape in the field does not close the menu
  await expect(display(bob)).toHaveText('T−07:00');

  // a preset clears the field and its mark
  await radio(bob, 'tmr_timebox', '15').check();
  for (const page of [alice, bob]) {
    await expect(radio(page, 'tmr_timebox', '15')).toBeChecked();
    await expect(page.locator('#tmr_other')).toHaveValue('');
    await expect(row(page)).toHaveAttribute('data-set', 'false');
  }
  await alice.context().close();
  await bob.context().close();
});

test('a new timebox resets a running timer for everyone (B-67 feedback)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Timer Timebox Reset');
  await openTimerPanel(alice);
  await radio(alice, 'tmr_visibility', '1').check();
  await radio(alice, 'tmr_mode', 'TIMER').check();
  await expect(display(bob)).toHaveText('T−05:00');
  await bob.getByRole('button', { name: 'Start timer' }).click();
  await expect(alice.locator('#timer')).toHaveAttribute('data-state', 'running');

  await radio(alice, 'tmr_timebox', '10').check();
  for (const page of [alice, bob]) {
    await expect(page.locator('#timer')).toHaveAttribute('data-state', 'ready');
    await expect(display(page)).toHaveText('T−10:00');
  }
  await alice.context().close();
  await bob.context().close();
});

test('an own change is not undone by an older board state (B-73, B-92)', async ({ browser }) => {
  const { alice, bob } = await teamWithTwoPlayers(browser, 'Timer Stale State');
  await openTimerPanel(alice);
  await openTimerPanel(bob);
  await radio(alice, 'tmr_visibility', '1').check();
  await expect(display(alice)).toHaveText('00:00');

  // a board state read before Alice's next change arrives only after it (a busy server or network);
  // it is marked (player name) so the test sees when Alice's board has taken it
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let read!: () => void;
  const stateRead = new Promise<void>(resolve => { read = resolve; });
  let hold = true;
  let delivered!: () => void;
  const stateDelivered = new Promise<void>(resolve => { delivered = resolve; });
  await alice.route('**/api/dao.php*', async route => {
    if (!hold) return route.continue();
    hold = false;
    const response = await route.fetch();
    const json = await response.json();
    expect(json.timer_mode).toBe('STOPWATCH');
    read();
    await released;
    await route.fulfill({ response, json: { ...json, name: 'Alice (older state)' } });
    delivered();
  });
  await radio(bob, 'tmr_auto_restart', '1').check(); // Bob's change makes Alice's board ask for the state
  await stateRead;

  await radio(alice, 'tmr_mode', 'TIMER').check();
  await expect(display(alice)).toHaveText('T−05:00'); // her board loaded the state after her own change
  release();
  await stateDelivered;
  // B-92: the older answer comes last and is dropped as a whole (it would show the marked name)
  await alice.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
  await expect(alice.locator('#prompt_user')).toHaveText('Alice');
  await expect(radio(alice, 'tmr_mode', 'TIMER')).toBeChecked();
  await expect(display(alice)).toHaveText('T−05:00');
  await alice.context().close();
  await bob.context().close();
});
