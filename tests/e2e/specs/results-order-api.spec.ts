import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam } from './helpers';

/**
 * B-42: the sort option "Define the sort order in-game" (CHOOSE) is removed.
 * update_results_order.php only accepts NAME and SEQUENCE; a legacy CHOOSE:* value still stored
 * in pok_teams_tbl is delivered by dao.php as SEQUENCE until the data update has run.
 */

// same credentials as the test config written by tests/e2e/setup.sh
const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];

function setStoredResultsOrder(teamId: string, value: string): void {
  // team ids and values are plain [A-Z0-9:] here, so building the statement is safe
  expect(teamId).toMatch(/^[A-Za-z0-9]+$/);
  expect(value).toMatch(/^[A-Z:]+$/);
  execFileSync('mysql', [...DB_ARGS, '-e',
    `update pok_teams_tbl set results_order = '${value}' where id = '${teamId}'`],
    { stdio: ['ignore', 'ignore', 'pipe'] });
}

async function newTeam(page: Page, name: string) {
  const boardUrl = await createTeam(page, name);
  const teamId = new URL(boardUrl).searchParams.get('t') as string;
  const sid = (await page.evaluate(() => localStorage.getItem('SID'))) as string;
  const dao = async () => {
    const res = await page.request.get(
      `./api/dao.php?id=${encodeURIComponent(sid)}&t=${encodeURIComponent(teamId)}`);
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const update = (value: string) => page.request.post(
    `./api/update_results_order.php?t=${encodeURIComponent(teamId)}&results_order=${encodeURIComponent(value)}`);
  return { teamId, dao, update };
}

test('update_results_order accepts only NAME and SEQUENCE', async ({ browser }) => {
  const page = await newPlayer(browser);
  const { dao, update } = await newTeam(page, 'OrderApiTeam');

  // default for new teams
  expect((await dao()).results_order).toBe('SEQUENCE');

  expect((await update('NAME')).status()).toBe(200);
  expect((await dao()).results_order).toBe('NAME');

  for (const invalid of ['CHOOSE', 'CHOOSE:NAME', 'CHOOSE:SEQUENCE', 'name', 'NONSENSE', '']) {
    expect((await update(invalid)).status(), `results_order=${invalid}`).toBe(400);
  }
  // rejected values leave the stored setting unchanged
  expect((await dao()).results_order).toBe('NAME');

  expect((await update('SEQUENCE')).status()).toBe(200);
  expect((await dao()).results_order).toBe('SEQUENCE');
});

test('a stored legacy CHOOSE value is delivered as SEQUENCE', async ({ browser }) => {
  const page = await newPlayer(browser);
  const { teamId, dao } = await newTeam(page, 'OrderLegacyTeam');

  setStoredResultsOrder(teamId, 'CHOOSE:SEQUENCE');
  expect((await dao()).results_order).toBe('SEQUENCE');

  setStoredResultsOrder(teamId, 'CHOOSE:NAME');
  expect((await dao()).results_order).toBe('SEQUENCE');
});
