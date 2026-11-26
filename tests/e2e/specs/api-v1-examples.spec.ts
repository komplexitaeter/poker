import { test, expect, APIRequestContext } from '@playwright/test';
import { newV1Member } from './helpers';

/**
 * B-150: runs the routing table (api/v1/routes.php) through its OpenAPI description: every public operation in table
 * order with its example (x-example), placeholders {{as.path}} taken from earlier answers. The status must be the first
 * 2xx of the table and the answer must fit the schema exactly (required fields, types, no unknown fields). So the doc
 * page, openapi.json and the code cannot drift apart (docs/api-v1-concept.md, section 14).
 * Operations with authentication use a real API key: the api_key of the remembered answer named in x-example.key, by
 * default the first one (team_create). No board member, no UID: the examples work exactly as documented.
 */

type Schema = Record<string, unknown>;
type Spec = { openapi: string; servers: { url: string }[]; paths: Record<string, Record<string, Operation>>;
              components: { schemas: Record<string, Schema> } };
type Operation = { operationId: string; security: unknown[]; parameters?: { name: string; in: string }[];
                   requestBody?: unknown; responses: Record<string, { content?: { 'application/json': { schema: Schema } } }>;
                   'x-example': { order: number; params: Record<string, unknown>; status: number; as?: string; key?: string } };

/** small schema checker (the subset of OpenAPI 3.0 lib_v1.php writes); returns the problems found */
function check(spec: Spec, schema: Schema, value: unknown, at: string): string[] {
  if (typeof schema.$ref === 'string') {
    return check(spec, spec.components.schemas[schema.$ref.replace('#/components/schemas/', '')], value, at);
  }
  if (Array.isArray(schema.allOf)) return (schema.allOf as Schema[]).flatMap(part => check(spec, part, value, at));
  if (value === null) return schema.nullable === true ? [] : [`${at}: null`];
  const problems: string[] = [];
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return [`${at}: not an object`];
      const props = (schema.properties ?? {}) as Record<string, Schema>;
      for (const name of (schema.required ?? []) as string[]) {
        if (!(name in (value as object))) problems.push(`${at}.${name}: missing`);
      }
      for (const [name, item] of Object.entries(value as object)) {
        if (props[name]) problems.push(...check(spec, props[name], item, `${at}.${name}`));
        else if (schema.additionalProperties === false) problems.push(`${at}.${name}: unknown field`);
      }
      break;
    }
    case 'array':
      if (!Array.isArray(value)) return [`${at}: not an array`];
      value.forEach((item, i) => problems.push(...check(spec, schema.items as Schema, item, `${at}[${i}]`)));
      break;
    case 'integer':
      if (!Number.isInteger(value)) problems.push(`${at}: not an integer`);
      break;
    case 'string':
    case 'boolean':
      if (typeof value !== schema.type) problems.push(`${at}: not a ${schema.type}`);
      break;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) problems.push(`${at}: not in enum`);
  return problems;
}

/** '{{team.team.id}}' -> the value at team.team.id of the remembered answers */
function fill(value: unknown, memory: Record<string, unknown>): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{([a-z0-9_.]+)\}\}/g, (_, path: string) => {
    const found = path.split('.').reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], memory);
    expect(found, `placeholder {{${path}}}`).toBeDefined();
    return String(found);
  });
}

async function loadSpec(request: APIRequestContext): Promise<Spec> {
  const res = await request.get('/api/v1/openapi.json');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/json; charset=utf-8');
  expect(res.headers()['cache-control']).toBe('public, max-age=300');
  return res.json();
}

test('openapi.json: OpenAPI 3.0.3, relative server URL, every public operation has an example', async ({ request }) => {
  const spec = await loadSpec(request);
  expect(spec.openapi).toBe('3.0.3');
  expect(spec.servers).toEqual([{ url: '/api/v1' }]);
  const ops = Object.values(spec.paths).flatMap(methods => Object.values(methods));
  expect(ops.map(op => op.operationId)).toEqual(expect.arrayContaining(
    ['team_create', 'team_join', 'team_get', 'team_note_set', 'item_upsert', 'item_list', 'item_get', 'item_reopen',
     'item_delete', 'key_list', 'key_delete', 'key_delete_current']));
  expect(ops.map(op => op.operationId)).not.toContain('key_create'); // board only (public: false)
  for (const op of ops) {
    expect(op['x-example'], op.operationId).toBeDefined();
    expect(op.responses['4XX'], op.operationId).toBeDefined();
  }
  expect(JSON.stringify(spec)).not.toContain('127.0.0.1'); // nothing from the Host header
});

test('every example of the routing table runs and answers as described', async ({ request }) => {
  const spec = await loadSpec(request);
  const ops = Object.entries(spec.paths)
    .flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method, op })))
    .sort((a, b) => a.op['x-example'].order - b.op['x-example'].order);

  const memory: Record<string, unknown> = {};
  let firstKey: string | undefined; // the api_key of the first answer that has one (team_create)
  const ran: string[] = [];

  for (const { path, method, op } of ops) {
    const example = op['x-example'];
    const params = Object.fromEntries(Object.entries(example.params).map(([k, v]) => [k, fill(v, memory)]));
    const where = Object.fromEntries((op.parameters ?? []).map(p => [p.name, p.in]));
    let url = spec.servers[0].url + path;
    const query = new URLSearchParams();
    const body: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(params)) {
      if (where[name] === 'path') url = url.replace(`{${name}}`, encodeURIComponent(String(value)));
      else if (where[name] === 'query') query.set(name, String(value));
      else body[name] = value;
    }
    if (query.size) url += `?${query}`;
    let headers: Record<string, string> = {};
    if (op.security.length) {
      const key = example.key ? (memory[example.key] as { api_key?: string } | undefined)?.api_key : firstKey;
      expect(key, `${op.operationId}: API key`).toMatch(/^pok_[A-Z2-7]{32}$/);
      headers = { Authorization: `Bearer ${key}` };
    }
    const res = await request.fetch(url, {
      method: method.toUpperCase(),
      headers,
      ...(Object.keys(body).length ? { data: body } : {}),
    });
    expect(res.status(), `${op.operationId}: ${await res.text()}`).toBe(example.status);
    const schema = op.responses[String(example.status)].content?.['application/json'].schema;
    if (schema) {
      const answer = await res.json();
      expect(check(spec, schema, answer, op.operationId), op.operationId).toEqual([]);
      if (example.as) memory[example.as] = answer;
      if (firstKey === undefined && typeof answer.api_key === 'string') firstKey = answer.api_key;
    }
    ran.push(op.operationId);
  }
  expect(ran.slice(0, 2)).toEqual(['team_create', 'team_join']);

  // both keys used by the examples are deleted now (key_delete_current, key_delete)
  for (const answer of [memory.team, memory.join] as { api_key: string }[]) {
    const res = await request.get('/api/v1/team', { headers: { Authorization: `Bearer ${answer.api_key}` } });
    expect(res.status()).toBe(401);
  }
});

test('team_get: the team, the own person and the item counts of the board member', async ({ request }) => {
  const member = await newV1Member(request, 'V1 Team Get', 'Anna', 'player');
  const get = async () => {
    const res = await request.get('/api/v1/team', { headers: member.headers });
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store, private');
    expect(res.headers()['vary']).toBe('X-Poker-User, X-Poker-Team, Authorization');
    return res.json();
  };
  expect(await get()).toEqual({
    team: { id: member.t, name: 'V1 Team Get', url: `/?t=${member.t}`, note: '' },
    member: { name: 'Anna', role: 'player' },
    items: { open_count: 0, done_count: 0, active_key: null },
  });

  const write = (endpoint: string, form: Record<string, string>) =>
    request.post(`/api/${endpoint}?t=${encodeURIComponent(member.t)}`, { headers: member.headers, form });
  expect((await write('update_topic.php', { topic: 'Sprint 42 – "refinement" 🚀' })).ok()).toBeTruthy();
  expect((await write('topic_item_add.php', { heading: 'Login', ext_id: 'TIX-004' })).ok()).toBeTruthy();
  expect((await write('topic_item_add.php', { heading: 'Logout' })).ok()).toBeTruthy();
  const data = await get();
  expect(data.team.note).toBe('Sprint 42 – "refinement" 🚀');
  expect(data.items).toEqual({ open_count: 2, done_count: 0, active_key: 'TIX-004' });
  expect(JSON.stringify(data)).not.toContain(member.uid); // the UID is never part of an answer

  // removed from the board (name.php with an empty name): still registered, may use the API (B-152)
  expect((await request.post(`/api/name.php?${new URLSearchParams({ t: member.t, name: '', type: 'player' })}`,
    { headers: member.headers })).ok()).toBeTruthy();
  expect((await get()).member).toEqual({ name: 'Anna', role: 'removed' });
});
