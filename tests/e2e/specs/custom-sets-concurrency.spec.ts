import { test, expect, APIRequestContext } from '@playwright/test';
import { asUser } from './helpers';

/**
 * Parallel first loads and set creations of many new teams. The example set (give_example_set() on the first
 * dao.php) and custom_set_create.php insert sets of different teams at the same time; "insert ... select max()" took a
 * shared gap lock on ix_custom_sets_team, so two new teams next to each other in that index deadlocked (release CI,
 * 2026-11-26: a 500 and a "PHP Fatal error" in the log). Remaining deadlocks or lock wait timeouts are retried
 * (db_transaction() in api/lib.php), the last one answers 503 instead of an uncaught exception.
 */

const TEAMS = 30;
const UID = 'E2ECONCURRENCY01'; // any valid UID: dao.php and custom_set_create.php need no membership here

async function addTeam(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.post(`/api/addteam.php?t=${encodeURIComponent(name)}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id as string;
}

async function setNames(request: APIRequestContext, t: string): Promise<string[]> {
  const res = await request.get(`/api/dao.php?t=${encodeURIComponent(t)}`, asUser(UID));
  expect(res.status()).toBe(200);
  return ((await res.json()).custom_sets as { name: string }[]).map(set => set.name).sort();
}

test('parallel first loads and new sets of many new teams do not deadlock', async ({ request }) => {
  const teams = await Promise.all(Array.from({ length: TEAMS }, (_, i) => addTeam(request, `Parallel ${i}`)));
  const results = await Promise.all(teams.flatMap(t => [
    // first load: gives the example set
    request.get(`/api/dao.php?t=${encodeURIComponent(t)}`, asUser(UID)).then(res => res.status()),
    request.post(`/api/custom_set_create.php?t=${encodeURIComponent(t)}`, asUser(UID, {
      data: JSON.stringify({ name: 'Own', style: 'plain', cards: [
        { text: 'S', numeric_value: 1, color: 'green' }, { text: 'M', numeric_value: 2, color: 'amber' },
        { text: 'L', numeric_value: 3, color: 'red' }] }),
      headers: { 'Content-Type': 'application/json' },
    })).then(res => res.status()),
  ]));
  expect(results.filter(status => status !== 200)).toEqual([]);
  // every team has its own set and the example set exactly once
  for (const t of teams) expect(await setNames(request, t)).toEqual(['Animals (Example)', 'Own']);
});
