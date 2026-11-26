import { test, expect, APIResponse } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { newV1Member, UID_HEADER } from './helpers';

/**
 * B-150: error model of /api/v1 (docs/api-v1-concept.md, sections 5, 6 and 9): HTTP status plus a flat JSON body
 * {error, message[, param]}, the same private cache headers as every API answer.
 */

async function expectError(res: APIResponse, status: number, error: string, param?: string) {
  const text = await res.text();
  expect(res.status(), text).toBe(status);
  expect(res.headers()['content-type']).toBe('application/json; charset=utf-8');
  expect(res.headers()['cache-control']).toBe('no-store, private');
  const body = JSON.parse(text);
  expect(Object.keys(body).sort()).toEqual(param === undefined ? ['error', 'message'] : ['error', 'message', 'param']);
  expect(body.error).toBe(error);
  expect(typeof body.message).toBe('string');
  if (param !== undefined) expect(body.param).toBe(param);
  return body;
}

test('authentication: 401 without user or team, 403 not_a_member for an unknown team and a non-member alike', async ({ request }) => {
  const member = await newV1Member(request, 'V1 Errors Auth');
  const other = await newV1Member(request, 'V1 Errors Other');

  await expectError(await request.get('/api/v1/team'), 401, 'unauthorized');
  await expectError(await request.get('/api/v1/team', { headers: { [UID_HEADER]: member.uid } }), 401, 'unauthorized');
  await expectError(await request.get('/api/v1/team', { headers: { 'X-Poker-Team': member.t } }), 401, 'unauthorized');
  // the UID only from the header: the transitional sources of get_uid() (URL parameter id, body field uid) do not count
  await expectError(await request.get(`/api/v1/team?id=${member.uid}`, { headers: { 'X-Poker-Team': member.t } }),
    401, 'unauthorized');
  await expectError(await request.fetch('/api/v1/team', { method: 'GET', headers: { 'X-Poker-Team': member.t },
    form: { uid: member.uid } }), 401, 'unauthorized');
  await expectError(await request.get(`/api/v1/team?id=${member.uid}`, { headers: member.headers }),
    400, 'unknown_param', 'id');

  // a person of another team, an unknown team and an impossible team id: one and the same answer
  const notMember = await expectError(await request.get('/api/v1/team',
    { headers: { [UID_HEADER]: other.uid, 'X-Poker-Team': member.t } }), 403, 'not_a_member');
  const unknownTeam = await expectError(await request.get('/api/v1/team',
    { headers: { [UID_HEADER]: member.uid, 'X-Poker-Team': `${member.t}x` } }), 403, 'not_a_member');
  const badTeam = await expectError(await request.get('/api/v1/team',
    { headers: { [UID_HEADER]: member.uid, 'X-Poker-Team': 'a b<' } }), 403, 'not_a_member');
  expect(unknownTeam).toEqual(notMember);
  expect(badTeam).toEqual(notMember);

  // the own team works
  expect((await request.get('/api/v1/team', { headers: member.headers })).status()).toBe(200);
  expect((await request.get('/api/v1/team', { headers: other.headers })).status()).toBe(200);
});

test('routing and input: 404, 405, 415, 413, invalid_json, unknown_param, invalid_param', async ({ request }) => {
  const { headers } = await newV1Member(request, 'V1 Errors Input');
  const team = (options: Parameters<typeof request.fetch>[1]) => request.fetch('/api/v1/team', { headers, ...options });

  await expectError(await request.get('/api/v1/nothing', { headers }), 404, 'not_found');
  const put = await team({ method: 'PUT', data: {} });
  await expectError(put, 405, 'method_not_allowed');
  expect(put.headers()['allow']).toBe('GET');

  // a body must be JSON (415 before reading it), at most 64 KB, a JSON object, with known fields only
  await expectError(await team({ method: 'GET', headers: { ...headers, 'Content-Type': 'text/plain' }, data: 'x' }),
    415, 'unsupported_media_type');
  await expectError(await team({ method: 'GET', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    data: 'a=1' }), 415, 'unsupported_media_type');
  await expectError(await team({ method: 'GET', headers: { ...headers, 'Content-Type': 'application/json' },
    data: JSON.stringify({ note: 'x'.repeat(70_000) }) }), 413, 'too_large');
  await expectError(await team({ method: 'GET', headers: { ...headers, 'Content-Type': 'application/json' },
    data: '{"note": ' }), 400, 'invalid_json');
  await expectError(await team({ method: 'GET', headers: { ...headers, 'Content-Type': 'application/json' },
    data: '["note"]' }), 400, 'invalid_json');
  await expectError(await team({ method: 'GET', headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    data: '{"note": "x"}' }), 400, 'unknown_param', 'note');
  // an empty JSON object is no field at all
  expect((await team({ method: 'GET', headers: { ...headers, 'Content-Type': 'application/json' }, data: '{}' })).status()).toBe(200);

  // query: unknown names (also the team id: it never goes into the URL), lists
  await expectError(await request.get('/api/v1/team?t=abc', { headers }), 400, 'unknown_param', 't');
  await expectError(await request.get('/api/v1/team?a[]=1', { headers }), 400, 'invalid_param', 'a');

  // the order: no route before authentication, authentication before the body
  await expectError(await request.get('/api/v1/nothing'), 404, 'not_found');
  await expectError(await request.fetch('/api/v1/team', { method: 'GET', headers: { 'Content-Type': 'text/plain' }, data: 'x' }),
    401, 'unauthorized');
});

test('parameter rules of the table (v1_validate, run with php)', () => {
  // routes with parameters come with B-150 PR 2; the rules are checked here directly against a table entry
  const root = join(__dirname, '..', '..', '..');
  const script = `
    require 'api/lib.php'; require 'api/v1/lib_v1.php';
    $route = ['params' => [
      'key' => ['in' => 'path', 'type' => 'string', 'max_length' => 20, 'pattern' => '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$'],
      'limit' => ['in' => 'query', 'type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 100],
      'all' => ['in' => 'query', 'type' => 'boolean'],
      'heading' => ['in' => 'body', 'type' => 'string', 'required' => true, 'text' => true, 'min_length' => 1, 'max_length' => 5],
      'description' => ['in' => 'body', 'type' => 'string', 'nullable' => true, 'text' => true, 'max_length' => 10],
      'at' => ['in' => 'body', 'type' => 'string', 'enum' => ['end', 'next'], 'default' => 'end'],
      'count' => ['in' => 'body', 'type' => 'integer', 'minimum' => 0],
    ]];
    $cases = json_decode($argv[1], true);
    $out = [];
    foreach ($cases as $case) {
      try {
        $out[] = ['ok' => v1_validate($route, $case[0], $case[1], $case[2])];
      } catch (ApiError $e) {
        $out[] = ['error' => $e->error, 'param' => $e->param];
      }
    }
    echo json_encode($out);`;
  const ok = { heading: 'Hi' };
  const cases: [Record<string, string>, Record<string, unknown>, Record<string, unknown>][] = [
    [{ key: 'DMZ-4' }, {}, ok],                                         // 0 defaults filled in, optional missing stays missing
    [{ key: 'DMZ-4' }, { limit: '7', all: 'true' }, { heading: '  Ä€😀  ', description: null, at: 'next', count: 3 }], // 1
    [{ key: 'A.php' }, {}, ok],                                         // 2 pattern
    [{ key: 'Ä-1' }, {}, ok],                                           // 3 pattern (ASCII only)
    [{ key: 'A1' }, { limit: '0' }, ok],                                // 4 minimum
    [{ key: 'A1' }, { limit: '5x' }, ok],                               // 5 integer format in the query
    [{ key: 'A1' }, { limit: '1234567' }, ok],                          // 6 at most 6 digits
    [{ key: 'A1' }, { all: '1' }, ok],                                  // 7 boolean only true/false
    [{ key: 'A1' }, {}, {}],                                            // 8 required body field
    [{ key: 'A1' }, {}, { heading: '   ' }],                            // 9 free text trimmed -> empty
    [{ key: 'A1' }, {}, { heading: 'abcdef' }],                         // 10 max_length
    [{ key: 'A1' }, {}, { heading: 5 }],                                // 11 strict type in the body
    [{ key: 'A1' }, {}, { heading: ['a'] }],                            // 12 list
    [{ key: 'A1' }, {}, { heading: 'Hi', count: '5' }],                 // 13 "5" is no integer
    [{ key: 'A1' }, {}, { heading: 'Hi', at: 'top' }],                  // 14 enum
    [{ key: 'A1' }, {}, { heading: null }],                             // 15 null where not nullable
    [{ key: 'A1' }, {}, { heading: 'Hi', key: 'B1' }],                  // 16 path parameter in the body
    [{ key: 'A1' }, { heading: 'x' }, ok],                              // 17 body parameter in the query
  ];
  const result = JSON.parse(execFileSync('php', ['-r', script, JSON.stringify(cases)], { cwd: root, encoding: 'utf8' }));
  expect(result).toEqual([
    { ok: { key: 'DMZ-4', limit: 100, heading: 'Hi', at: 'end' } },
    { ok: { key: 'DMZ-4', limit: 7, all: true, heading: 'Ä€😀', description: null, at: 'next', count: 3 } },
    { error: 'invalid_param', param: 'key' },
    { error: 'invalid_param', param: 'key' },
    { error: 'invalid_param', param: 'limit' },
    { error: 'invalid_param', param: 'limit' },
    { error: 'invalid_param', param: 'limit' },
    { error: 'invalid_param', param: 'all' },
    { error: 'missing_param', param: 'heading' },
    { error: 'invalid_param', param: 'heading' },
    { error: 'invalid_param', param: 'heading' },
    { error: 'invalid_param', param: 'heading' },
    { error: 'invalid_param', param: 'heading' },
    { error: 'invalid_param', param: 'count' },
    { error: 'invalid_param', param: 'at' },
    { error: 'invalid_param', param: 'heading' },
    { error: 'unknown_param', param: 'key' },
    { error: 'unknown_param', param: 'heading' },
  ]);
});
