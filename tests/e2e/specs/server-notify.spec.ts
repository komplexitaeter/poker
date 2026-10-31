import { test, expect, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import * as path from 'node:path';
import { newPlayer, createTeam, joinAsPlayer, expectTableCard, tableCard } from './helpers';

/**
 * B-81: writing endpoints notify poker-msg themselves (UDP "pull:<team_id>" to 127.0.0.1:8444), poker-msg sends
 * "pull" to every board of the team. All writes here go straight to the API (page.request), without the browser
 * sending "push", so an open board only updates if the API notified poker-msg. The board has no polling.
 */

const teamOf = (url: string) => new URL(url).searchParams.get('t') ?? '';
const newSid = (prefix: string) => (prefix + Date.now().toString(36) + Math.random().toString(36).slice(2))
  .replace(/[^A-Za-z0-9]/g, '').slice(0, 16).toUpperCase();

async function post(page: Page, url: string, form?: Record<string, string>): Promise<void> {
  const res = await page.request.post(url, form ? { form } : undefined);
  expect(res.status(), `${url}: ${await res.text()}`).toBe(200);
}

test('API writes without a browser push update an open board (B-81)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url = await createTeam(alice, 'Notify Team');
  await joinAsPlayer(alice, url, 'Alice');
  const t = encodeURIComponent(teamOf(url));
  const bob = newSid('N');

  // name.php: a new player appears
  await post(alice, `/api/name.php?id=${bob}&type=player&name=Bob&t=${t}`);
  await expectTableCard(alice, 'Bob', 'prgrss1');

  // setc.php: Bob's card is down
  await post(alice, `/api/setc.php?id=${bob}&cardkey=three01&t=${t}`);
  await expectTableCard(alice, 'Bob', 'done001');

  // newround.php: back to "not chosen"
  await post(alice, `/api/newround.php?t=${t}`);
  await expectTableCard(alice, 'Bob', 'prgrss1');

  // update_topic.php (topic in the POST body)
  await post(alice, `/api/update_topic.php?t=${t}`, { topic: 'Story from the API' });
  await expect(alice.locator('#topic')).toContainText('Story from the API');

  // update_team.php: team name
  await post(alice, `/api/update_team.php?name=${encodeURIComponent('Renamed by API')}&t=${t}`);
  await expect(alice.locator('#team_name')).toHaveText('Renamed by API');

  // a rejected write (403, unknown team) still answers as before
  const res = await alice.request.post(`/api/setc.php?id=${bob}&cardkey=three01&t=NoSuchTeam`);
  expect(res.status()).toBe(403);
});

test('delete_user.php updates the boards of all teams of the user (B-81)', async ({ browser }) => {
  const alice = await newPlayer(browser);
  const url1 = await createTeam(alice, 'Notify One');
  await joinAsPlayer(alice, url1, 'Alice');
  const carol = await newPlayer(browser);
  const url2 = await createTeam(carol, 'Notify Two');
  await joinAsPlayer(carol, url2, 'Carol');

  // one user (same id) in both teams
  const dave = newSid('D');
  await post(alice, `/api/name.php?id=${dave}&type=player&name=Dave&t=${encodeURIComponent(teamOf(url1))}`);
  await post(carol, `/api/name.php?id=${dave}&type=player&name=Dave&t=${encodeURIComponent(teamOf(url2))}`);
  await expectTableCard(alice, 'Dave', 'prgrss1');
  await expectTableCard(carol, 'Dave', 'prgrss1');

  await post(alice, `/api/delete_user.php?id=${dave}`);
  await expect(tableCard(alice, 'Dave')).toHaveCount(0);
  await expect(tableCard(carol, 'Dave')).toHaveCount(0);
});

/**
 * Without a listener (poker-msg down) notify_team() must neither block nor write a PHP warning, so the API answers as
 * usual. Stopping the shared poker-msg would disturb parallel tests, so this calls notify_team() from api/lib.php in
 * PHP CLI with a free UDP port nobody listens on; every warning/notice fails the call.
 */
test('notify_team() is silent and fast when poker-msg is not listening (B-81)', async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const sock = createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const p = sock.address().port;
      sock.close(() => resolve(p));
    });
  });
  const lib = path.resolve(__dirname, '../../../api/lib.php');
  const code = `
    error_reporting(E_ALL);
    ini_set('display_errors', 'stderr');
    set_error_handler(function ($no, $str) { if (!(error_reporting() & $no)) return false; fwrite(STDERR, "PHP error $no: $str\\n"); exit(3); });
    const _POKER_MSG_NOTIFY_PORT = ${port};
    require $argv[1];
    $start = microtime(true);
    for ($i = 0; $i < 5; $i++) notify_team('Team_' . $i);
    notify_teams(['A', 'B', 'A']);
    notify_team('');
    $ms = (microtime(true) - $start) * 1000;
    echo $ms < 500 ? 'OK' : 'SLOW ' . round($ms);
  `;
  const out = execFileSync('php', ['-r', code, lib], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  expect(out).toBe('OK');
});
