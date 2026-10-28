import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam } from './helpers';

/**
 * B-67: timer instead of stopwatch (backend). timer.php gets the explicit settings set_visibility, set_mode,
 * set_timebox (minutes 1..240, stored in seconds) and set_auto_restart; invalid values are rejected with 400.
 * With auto-restart on and the timer visible, New round and Cancel round restart the timer at 0 and let it run.
 */

// same credentials as the test config written by tests/e2e/setup.sh
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function sql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-e', statement],
    { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

async function newTeam(page: Page, name: string) {
  const boardUrl = await createTeam(page, name);
  const teamId = new URL(boardUrl).searchParams.get('t') as string;
  // team ids are plain [A-Za-z0-9] here, so building the test statements below is safe
  expect(teamId).toMatch(/^[A-Za-z0-9]+$/);
  const sid = (await page.evaluate(() => localStorage.getItem('SID'))) as string;
  const t = encodeURIComponent(teamId);
  const dao = async () => {
    const res = await page.request.get(`./api/dao.php?id=${encodeURIComponent(sid)}&t=${t}`);
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const timer = (action: string, value?: string) => page.request.post(
    `./api/timer.php?t=${t}&action=${action}` + (value === undefined ? '' : `&value=${encodeURIComponent(value)}`));
  const post = async (url: string) => expect((await page.request.post(url)).ok()).toBeTruthy();
  // join as the only player (the creator is not a player yet)
  await post(`./api/name.php?id=${encodeURIComponent(sid)}&type=player&name=Alice&t=${t}`);
  const pickCard = () => post(`./api/setc.php?id=${encodeURIComponent(sid)}&cardkey=three01&t=${t}`);
  const newRound = () => post(`./api/newround.php?t=${t}`);
  // let the timer look as if it had been started 100 s ago
  const backdateTimer = () => sql(
    `update pok_teams_tbl set timer_start_time = timestampadd(SECOND, -100, current_timestamp), timer_pause_time = null where id = '${teamId}'`);
  const lastRoundType = () => sql(
    `select type_code from pok_roundstats_tbl where team_id = '${teamId}' order by id desc limit 1`);
  return { dao, timer, pickCard, newRound, backdateTimer, lastRoundType };
}

test('new teams get the old stopwatch behaviour as defaults', async ({ browser }) => {
  const page = await newPlayer(browser);
  const { dao } = await newTeam(page, 'TimerDefaultTeam');
  const d = await dao();
  expect(d.timer_visibility).toBe(0);
  expect(d.timer_mode).toBe('STOPWATCH');
  expect(d.timer_timebox).toBe(300);
  expect(d.timer_auto_restart).toBe(0);
});

test('timer settings are stored, invalid values are rejected with 400', async ({ browser }) => {
  const page = await newPlayer(browser);
  const { dao, timer } = await newTeam(page, 'TimerSettingsTeam');

  expect((await timer('set_visibility', '1')).status()).toBe(200);
  expect((await timer('set_mode', 'TIMER')).status()).toBe(200);
  expect((await timer('set_timebox', '15')).status()).toBe(200);
  expect((await timer('set_auto_restart', '1')).status()).toBe(200);
  let d = await dao();
  expect([d.timer_visibility, d.timer_mode, d.timer_timebox, d.timer_auto_restart]).toEqual([1, 'TIMER', 900, 1]);

  // set_visibility is explicit: setting the same value twice keeps it
  expect((await timer('set_visibility', '1')).status()).toBe(200);
  expect((await dao()).timer_visibility).toBe(1);

  const invalid: [string, (string | undefined)[]][] = [
    ['set_visibility', ['2', '-1', 'true', '', undefined]],
    ['set_mode', ['stopwatch', 'COUNTDOWN', '', undefined]],
    ['set_timebox', ['0', '241', '-5', '2.5', '1e2', 'abc', '', undefined]],
    ['set_auto_restart', ['2', 'yes', '', undefined]],
  ];
  for (const [action, values] of invalid) {
    for (const value of values) {
      expect((await timer(action, value)).status(), `${action} value=${value}`).toBe(400);
    }
  }
  // rejected values leave the stored settings unchanged
  d = await dao();
  expect([d.timer_visibility, d.timer_mode, d.timer_timebox, d.timer_auto_restart]).toEqual([1, 'TIMER', 900, 1]);

  // limits of the timebox
  expect((await timer('set_timebox', '1')).status()).toBe(200);
  expect((await dao()).timer_timebox).toBe(60);
  expect((await timer('set_timebox', '240')).status()).toBe(200);
  expect((await dao()).timer_timebox).toBe(14400);

  expect((await timer('set_visibility', '0')).status()).toBe(200);
  expect((await timer('set_mode', 'STOPWATCH')).status()).toBe(200);
  expect((await timer('set_auto_restart', '0')).status()).toBe(200);
  d = await dao();
  expect([d.timer_visibility, d.timer_mode, d.timer_auto_restart]).toEqual([0, 'STOPWATCH', 0]);

  // toggle_visibility still works for old clients during the deploy
  expect((await timer('toggle_visibility')).status()).toBe(200);
  expect((await dao()).timer_visibility).toBe(1);
});

test('auto-restart restarts the timer with New round and Cancel round', async ({ browser }) => {
  const page = await newPlayer(browser);
  const { dao, timer, pickCard, newRound, backdateTimer, lastRoundType } = await newTeam(page, 'TimerRestartTeam');
  await timer('set_visibility', '1');
  await timer('set_auto_restart', '1');

  // Cancel round (nobody has picked a card), timer was paused before
  await backdateTimer();
  expect((await timer('pause')).status()).toBe(200);
  expect((await dao()).timer_status).toBe('PAUSED');
  await newRound();
  expect(lastRoundType()).toBe('CANCEL_ROUND');
  let d = await dao();
  expect(d.timer_status).toBe('RUNNING');
  expect(d.timer_time).toBeLessThanOrEqual(2);

  // New round (all players have picked a card)
  await backdateTimer();
  await pickCard();
  await newRound();
  expect(lastRoundType()).toBe('NEW_ROUND');
  d = await dao();
  expect(d.timer_status).toBe('RUNNING');
  expect(d.timer_time).toBeLessThanOrEqual(2);
});

test('without auto-restart or with a hidden timer a new round leaves the timer as it is', async ({ browser }) => {
  const page = await newPlayer(browser);
  const { dao, timer, newRound, backdateTimer, lastRoundType } = await newTeam(page, 'TimerKeepTeam');

  // visible, auto-restart off: keeps running from where it was
  await timer('set_visibility', '1');
  await backdateTimer();
  await newRound();
  expect(lastRoundType()).toBe('CANCEL_ROUND');
  let d = await dao();
  expect(d.timer_status).toBe('RUNNING');
  expect(d.timer_time).toBeGreaterThanOrEqual(100);

  // auto-restart on but timer hidden: unchanged as well
  await timer('set_auto_restart', '1');
  await timer('set_visibility', '0');
  await newRound();
  d = await dao();
  expect(d.timer_time).toBeGreaterThanOrEqual(100);

  // a reset timer stays reset without auto-restart
  await timer('set_auto_restart', '0');
  await timer('set_visibility', '1');
  await timer('reset');
  await newRound();
  d = await dao();
  expect(d.timer_status).toBe('PAUSED');
  expect(d.timer_time).toBe(0);
});
