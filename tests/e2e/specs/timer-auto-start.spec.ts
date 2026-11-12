import { test, expect, Page, Browser } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, addPlayersViaApi } from './helpers';

/**
 * B-130: timer auto-start with three values in pok_teams_tbl.timer_auto_restart (timer.php set_auto_restart):
 * 0 = off, 1 = new round (as B-67: New round / Cancel round restart a visible timer), 2 = next item (the timer
 * restarts when an item is left in topic_item_next.php - close, close_empty, later -, not with rounds inside the
 * item; without an active item like 1). API level only.
 */

const DB_ARGS = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e'];
function mysql(statement: string): string {
  return execFileSync('mysql', [...DB_ARGS, '-N', '-B', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function q(params: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

async function setup(browser: Browser, name: string, autoStart: string) {
  const page: Page = await newPlayer(browser);
  const url = await createTeam(page, name);
  const t = new URL(url).searchParams.get('t') as string;
  expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // safe for the SQL below
  const [ann, ben] = await addPlayersViaApi(page, url, ['Ann', 'Ben']);
  const post = async (endpoint: string, params: Record<string, string | number> = {}, form?: Record<string, string>) => {
    const res = await page.request.post(`/api/${endpoint}?${q({ t, ...params })}`, form ? { form } : {});
    expect(res.status(), endpoint).toBe(200);
    return res;
  };
  const dao = async () => {
    const res = await page.request.get(`/api/dao.php?${q({ t, id: ann })}`);
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  await post('timer.php', { action: 'set_visibility', value: '1' });
  await post('timer.php', { action: 'set_auto_restart', value: autoStart });
  expect((await dao()).timer_auto_restart).toBe(Number(autoStart));

  // the timer looks as if it had been started 100 s ago
  const backdate = () => mysql(`update pok_teams_tbl set timer_start_time = timestampadd(SECOND, -100, current_timestamp),
                                  timer_pause_time = null where id = '${t}'`);
  const expectRestarted = async (label: string) => {
    const d = await dao();
    expect(d.timer_status, label).toBe('RUNNING');
    expect(d.timer_time, label).toBeLessThanOrEqual(2);
  };
  const expectKept = async (label: string) => {
    const d = await dao();
    expect(d.timer_status, label).toBe('RUNNING');
    expect(d.timer_time, label).toBeGreaterThanOrEqual(100);
  };
  const play = async () => {
    await post('setc.php', { id: ann, cardkey: 'three01' });
    await post('setc.php', { id: ben, cardkey: 'five001' });
  };
  const addItem = async (heading: string) =>
    (await (await post('topic_item_add.php', { at: 'end' }, { heading })).json()).item_id as number;
  const next = (item: number, mode: string) => post('topic_item_next.php', { item, mode });
  return { t, post, dao, backdate, expectRestarted, expectKept, play, addItem, next };
}

test('set_auto_restart accepts 0, 1, 2 and rejects anything else', async ({ browser }) => {
  const { t, dao, post } = await setup(browser, 'AutoStartValues', '2');
  const page = await newPlayer(browser);
  for (const value of ['3', '-1', 'NEXT_ITEM', '']) {
    const res = await page.request.post(`/api/timer.php?${q({ t, action: 'set_auto_restart', value })}`);
    expect(res.status(), `value=${value}`).toBe(400);
  }
  expect((await dao()).timer_auto_restart).toBe(2);
  await post('timer.php', { action: 'set_auto_restart', value: '0' });
  expect((await dao()).timer_auto_restart).toBe(0);
});

test('next item: rounds inside an item keep the timer, leaving the item restarts it in every mode', async ({ browser }) => {
  const s = await setup(browser, 'AutoStartNextItem', '2');
  const a = await s.addItem('A');
  const b = await s.addItem('B');
  const c = await s.addItem('C');

  // Cancel round and New round inside item A: the timer keeps running
  await s.backdate();
  await s.post('newround.php');
  await s.expectKept('cancel round inside an item');
  await s.play();
  await s.post('newround.php');
  await s.expectKept('new round inside an item');

  // leaving A with cards down (close): one restart, the round went to the item
  await s.backdate();
  await s.play();
  await s.next(a, 'close');
  await s.expectRestarted('close');

  // later: B goes to the end, C is active
  await s.backdate();
  await s.next(b, 'later');
  await s.expectRestarted('later');

  await s.backdate();
  await s.next(c, 'close_empty');
  await s.expectRestarted('close_empty');

  // B is the only open item: "later" keeps it active, but it was left -> restart
  await s.backdate();
  await s.next(b, 'later');
  await s.expectRestarted('later as the only open item');

  // finish the last item -> no items open: a new round restarts the timer as with "New round"
  await s.next(b, 'close');
  await s.backdate();
  await s.post('newround.php');
  await s.expectRestarted('new round without an active item');
});

test('next item without items behaves like new round', async ({ browser }) => {
  const s = await setup(browser, 'AutoStartNoItems', '2');
  await s.backdate();
  await s.post('newround.php');
  await s.expectRestarted('cancel round');
  await s.backdate();
  await s.play();
  await s.post('newround.php');
  await s.expectRestarted('new round');
});

test('new round (old value 1): restarts with every round, also inside an item and when leaving it with cards down', async ({ browser }) => {
  const s = await setup(browser, 'AutoStartNewRound', '1');
  const a = await s.addItem('A');
  const b = await s.addItem('B');
  await s.backdate();
  await s.post('newround.php');
  await s.expectRestarted('cancel round inside an item');
  await s.backdate();
  await s.play();
  await s.next(a, 'close');
  await s.expectRestarted('next item with cards down (new round)');
  // without cards down leaving an item is no round: unchanged as before B-130
  await s.backdate();
  await s.next(b, 'close_empty');
  await s.expectKept('next item without cards down');
});

test('off: neither rounds nor leaving an item restart the timer; a hidden timer is never restarted', async ({ browser }) => {
  const s = await setup(browser, 'AutoStartOff', '0');
  const a = await s.addItem('A');
  const b = await s.addItem('B');
  await s.backdate();
  await s.play();
  await s.post('newround.php');
  await s.expectKept('new round');
  await s.play();
  await s.next(a, 'close');
  await s.expectKept('next item');

  await s.post('timer.php', { action: 'set_auto_restart', value: '2' });
  await s.post('timer.php', { action: 'set_visibility', value: '0' });
  await s.next(b, 'close');
  const d = await s.dao();
  expect(d.timer_time).toBeGreaterThanOrEqual(100);
});
