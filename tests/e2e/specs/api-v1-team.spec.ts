import { test, expect } from '@playwright/test';
import { bearer, expectTableCard, joinAsPlayer, newPlayer, v1Join } from './helpers';

/**
 * B-150 PR 2: team_create, team_join and team_note_set of /api/v1 (docs/api-v1-concept.md, sections 4.1-4.3, 5.4).
 * Without a key only creating and joining a team work; both make a new person (server-made UID, never delivered)
 * and return its key. Joining and the note update open boards at once (notify_team()).
 */

const TEAM_ID = /^[a-z0-9]+(-[a-z0-9]+)*-[a-z2-7]{16}$/; // B-156

test('team_create: mandatory fields, new team id format, the key works at once', async ({ request }) => {
  const post = (data: Record<string, unknown>) => request.post('/api/v1/teams', { data });
  for (const [data, error, param] of [
    [{ name: 'X', member_name: 'Anna' }, 'missing_param', 'member_role'],
    [{ name: 'X', member_role: 'player' }, 'missing_param', 'member_name'],
    [{ member_name: 'Anna', member_role: 'player' }, 'missing_param', 'name'],
    [{ name: ' ', member_name: 'Anna', member_role: 'player' }, 'invalid_param', 'name'],
    [{ name: 'X', member_name: 'Anna', member_role: 'moderator' }, 'invalid_param', 'member_role'],
    [{ name: 'X', member_name: 'A'.repeat(16), member_role: 'player' }, 'invalid_param', 'member_name'],
  ] as const) {
    const res = await post(data);
    expect(res.status(), JSON.stringify(data)).toBe(400);
    expect(await res.json()).toMatchObject({ error, param });
  }

  const res = await post({ name: 'Dolphins Ä', member_name: 'Anna', member_role: 'observer' });
  expect(res.status()).toBe(201);
  const created = await res.json();
  expect(created.api_key).toMatch(/^pok_[A-Z2-7]{32}$/);
  expect(created.team.id).toMatch(TEAM_ID);
  expect(created.team.id.startsWith('dolphins-ae-')).toBeTruthy();
  expect(created.team).toEqual({ id: created.team.id, name: 'Dolphins Ä', url: `/?t=${created.team.id}`, note: '' });
  expect(created.member).toEqual({ name: 'Anna', role: 'observer' });

  const info = await request.get('/api/v1/team', { headers: bearer(created.api_key) });
  expect(info.status()).toBe(200);
  expect(await info.json()).toMatchObject({ team: { id: created.team.id }, member: { name: 'Anna', role: 'observer' } });
  // default key name
  const keys = (await (await request.get('/api/v1/keys', { headers: bearer(created.api_key) })).json()).keys;
  expect(keys).toEqual([expect.objectContaining({ name: 'API', current: true })]);
});

test('team_join: mandatory name and role, unknown team 404, every call is a new person', async ({ request }) => {
  const created = await (await request.post('/api/v1/teams',
    { data: { name: 'Join Team', member_name: 'Anna', member_role: 'player' } })).json();
  const t = created.team.id as string;
  const join = (team: string, data: Record<string, unknown>) =>
    request.post(`/api/v1/teams/${encodeURIComponent(team)}/members`, { data });

  for (const [data, error, param] of [
    [{ name: 'Jira' }, 'missing_param', 'role'],
    [{ role: 'observer' }, 'missing_param', 'name'],
    [{ name: '', role: 'observer' }, 'invalid_param', 'name'],
    [{ name: 'Jira', role: 'PLAYER' }, 'invalid_param', 'role'],
  ] as const) {
    const res = await join(t, data);
    expect(res.status(), JSON.stringify(data)).toBe(400);
    expect(await res.json()).toMatchObject({ error, param });
  }
  const unknown = await join(`${t}x`, { name: 'Jira', role: 'observer' });
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toMatchObject({ error: 'team_not_found' });
  // auth headers are ignored without a key requirement: a key of another team does not matter
  const res = await request.post(`/api/v1/teams/${t}/members`,
    { headers: bearer(created.api_key), data: { name: 'Jira', role: 'observer' } });
  expect(res.status()).toBe(201);
  const joined = await res.json();
  expect(joined.team).toEqual({ id: t, name: 'Join Team', url: `/?t=${t}`, note: '' });
  expect(joined.member).toEqual({ name: 'Jira', role: 'observer' });
  expect(joined.api_key).not.toBe(created.api_key);

  // a second join with the same name is another person with another key
  const twice = await v1Join(request, t, 'Jira', 'observer');
  expect(twice.key).not.toBe(joined.api_key);
  for (const key of [created.api_key, joined.api_key, twice.key]) {
    expect((await request.get('/api/v1/team', { headers: bearer(key) })).status()).toBe(200);
  }
  // the creator's key list does not show the joined persons' keys
  expect((await (await request.get('/api/v1/keys', { headers: bearer(created.api_key) })).json()).keys).toHaveLength(1);
});

test('an open board shows a person joining through the API and the note set through the API (notify)', async ({ browser, request }) => {
  const created = await (await request.post('/api/v1/teams',
    { data: { name: 'Board Notify', member_name: 'Script', member_role: 'observer' } })).json();
  const alice = await newPlayer(browser);
  await alice.goto(created.team.url);
  await joinAsPlayer(alice, alice.url(), 'Alice');

  // join as player: appears on Alice's board without a reload (B-81 pull)
  await v1Join(request, created.team.id, 'Jira', 'player');
  await expectTableCard(alice, 'Jira', 'prgrss1');

  // note through the API: trimmed, shown on the board
  const res = await request.put('/api/v1/team/note',
    { headers: bearer(created.api_key), data: { note: '  Sprint 42 – **refinement** 🚀 ' } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ note: 'Sprint 42 – **refinement** 🚀' });
  await expect(alice.locator('#board_note_text')).toContainText('Sprint 42');
  expect((await (await request.get('/api/v1/team', { headers: bearer(created.api_key) })).json()).team.note)
    .toBe('Sprint 42 – **refinement** 🚀');

  // too long is refused (not cut), "" empties it
  const long = await request.put('/api/v1/team/note', { headers: bearer(created.api_key), data: { note: 'x'.repeat(2001) } });
  expect(long.status()).toBe(400);
  expect(await long.json()).toMatchObject({ error: 'invalid_param', param: 'note' });
  expect((await request.put('/api/v1/team/note', { headers: bearer(created.api_key), data: { note: '' } })).status()).toBe(200);
  await expect(alice.locator('#board_note_text')).not.toContainText('Sprint 42');
});
