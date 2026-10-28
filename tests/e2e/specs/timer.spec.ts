import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, joinAsPlayer, pickCard, teamWithTwoPlayers, openTimerPanel } from './helpers';

/**
 * B-66/B-67: timer instead of stopwatch (frontend). The header button :timer opens the timer panel:
 * on/off for everyone, mode Stopwatch | Timer, timebox (presets + other, Timer mode only) and
 * "Auto-start on new round". Every change is saved right away, the panel of everyone else follows.
 * The corner (bottom right; phones: the row above the deck) shows T−mm:ss / T+mm:ss above the round
 * button with play/pause and reset; past the timebox T+ in amber.
 * SHOT_DIR (optional): screenshots desktop 1440 and phone 390.
 */

const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-e', statement],
    { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

const teamId = (url: string) => {
  const id = new URL(url).searchParams.get('t') as string;
  expect(id).toMatch(/^[A-Za-z0-9_]+$/); // safe to use in the statements below
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
    await expect(display(page)).toHaveText('T+00:00');
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

  await radio(alice, 'tmr_auto_restart', '1').check();
  await expect(radio(bob, 'tmr_auto_restart', '1')).toBeChecked();

  await radio(bob, 'tmr_visibility', '0').check();
  await expect(alice.locator('#timer')).toBeHidden();
  await expect(radio(alice, 'tmr_visibility', '0')).toBeChecked();
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
    await expect(alice.locator('#newroundbtn')).toBeVisible();
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
