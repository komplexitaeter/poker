import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { newPlayer, createTeam, asUser } from './helpers';

/**
 * B-21: loading a board fires two parallel dao.php calls for the same fresh SID
 * (loadBoard -> updateDao(true) and the WebSocket onopen -> updateDao(false)).
 * Both see the user missing and insert the same PRIMARY key. Before the fix the
 * second INSERT raised "Duplicate entry ... for key 'pok_user_tbl.PRIMARY'"
 * (PHP Fatal, HTTP 500, empty board). Since then dao.php only reads the user row
 * (defaults when missing) and never inserts it: a dao.php in flight after "Delete my data"
 * must not bring a deleted UID back (B-152). The row comes with the join (name.php).
 */
test('parallel dao.php calls for a fresh SID never 500 (user insert race)', async ({ browser }) => {
  const creator = await newPlayer(browser);
  const url = await createTeam(creator, 'Race Team');
  const teamId = new URL(url).searchParams.get('t')!;

  // a brand-new SID, like a browser that has never contacted the app before
  const sid = ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 16);
  const dao = `/api/dao.php?t=${encodeURIComponent(teamId)}`;

  // fire many requests as simultaneously as possible to provoke the race
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => creator.request.get(dao, asUser(sid))),
  );

  for (const res of responses) {
    expect(res.status(), `dao.php for a fresh SID must not 500: ${await res.text()}`).toBe(200);
    // a real DAO payload, not an error page
    expect((await res.json()).id).toBe(sid);
  }
  // read-only: no user row for a SID that never joined or stored a setting
  expect(sid).toMatch(/^[a-z0-9]{16}$/); // safe to put into the SQL below
  const rows = execFileSync('mysql', ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e', 'pok_e2e', '-N', '-B', '-e',
    `select count(*) from pok_user_tbl where id = '${sid}'`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  expect(rows).toBe('0');
});
