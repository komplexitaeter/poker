import { test, expect } from '@playwright/test';
import { newPlayer, createTeam } from './helpers';

/**
 * B-21: loading a board fires two parallel dao.php calls for the same fresh SID
 * (loadBoard -> updateDao(true) and the WebSocket onopen -> updateDao(false)).
 * Both see the user missing and insert the same PRIMARY key. Before the fix the
 * second INSERT raised "Duplicate entry ... for key 'pok_user_tbl.PRIMARY'"
 * (PHP Fatal, HTTP 500, empty board). The idempotent INSERT ... ON DUPLICATE KEY
 * UPDATE makes every concurrent request succeed and leaves exactly one row.
 */
test('parallel dao.php calls for a fresh SID never 500 (user insert race)', async ({ browser }) => {
  const creator = await newPlayer(browser);
  const url = await createTeam(creator, 'Race Team');
  const teamId = new URL(url).searchParams.get('t')!;

  // a brand-new SID, like a browser that has never contacted the app before
  const sid = ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 16);
  const dao = `/api/dao.php?t=${encodeURIComponent(teamId)}&id=${encodeURIComponent(sid)}`;

  // fire many requests as simultaneously as possible to provoke the race
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => creator.request.get(dao)),
  );

  for (const res of responses) {
    expect(res.status(), `dao.php for a fresh SID must not 500: ${await res.text()}`).toBe(200);
    // a real DAO payload, not an error page
    expect((await res.json()).id).toBe(sid);
  }
});
