import { test, expect, Page, APIResponse } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newPlayer, createTeam } from './helpers';

/**
 * B-150 PR 3 (docs/api-v1-concept.md, section 7): the item key (column ext_id, "Key" in the board, "key" in v1) is
 * required, ASCII [A-Za-z0-9][A-Za-z0-9_-]{0,19}, unique per team without case. A missing key (old cached board,
 * scripts) gets the suggestion of the server (next_item_key(), the same table as the board's JS:
 * tests/e2e/fixtures/item-keys.json). tools/migration/b150_item_keys.php fills in the keys of old items once.
 */

const REPO = join(__dirname, '..', '..', '..');
const FIXTURE = join(__dirname, '..', 'fixtures', 'item-keys.json');
const DB_USER = ['-h127.0.0.1', '-upok_e2e', '-ppok_e2e'];

function sql(db: string, statement: string): string {
  return execFileSync('mysql', [...DB_USER, db, '--default-character-set=utf8mb4', '-N', '-B', '-r', '-e', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function team(page: Page, name: string) {
  const url = await createTeam(page, name);
  const t = new URL(url).searchParams.get('t') as string;
  expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // safe for the SQL below
  return t;
}

function write(page: Page, endpoint: string, params: Record<string, string | number>, form: Record<string, string> = {}):
  Promise<APIResponse> {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return page.request.post(`/api/${endpoint}?${q}`, { form });
}

async function add(page: Page, t: string, form: Record<string, string>) {
  const res = await write(page, 'topic_item_add.php', { t }, form);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { ok: boolean; item_id: number; active_id: number; ext_id: string };
}

async function topics(page: Page, t: string) {
  const res = await page.request.get(`/api/get_topics.php?t=${encodeURIComponent(t)}&done=1`);
  expect(res.status()).toBe(200);
  return res.json();
}

const keysOf = (t: string) => sql('pok_e2e', `select ext_id from pok_topic_items_tbl where team_id = '${t}' order by id`)
  .split('\n').filter(k => k !== '');

test('the suggestion follows the shared table in PHP (next_item_key())', () => {
  const php = `require $argv[1] . '/api/lib_topics.php';
    $out = [];
    foreach (json_decode(file_get_contents($argv[2]), true)['cases'] as $c) {
      $taken = array_map('strtolower', $c['taken']);
      $out[] = next_item_key($c['last'], $c['count'], fn($k) => in_array(strtolower($k), $taken, true));
    }
    echo json_encode($out);`;
  const got = JSON.parse(execFileSync('php', ['-r', php, REPO, FIXTURE], { encoding: 'utf8' }));
  const cases = JSON.parse(readFileSync(FIXTURE, 'utf8')).cases as { expected: string }[];
  expect(cases.length).toBeGreaterThan(10);
  expect(got).toEqual(cases.map(c => c.expected));
});

test('every item gets a key: the suggestion for a missing one (old board), next_key in get_topics.php', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = await team(page, 'Item Keys Suggest');
  expect((await topics(page, t)).next_key).toBe('1');

  // old cached board: ext_id empty or not sent at all -> the server's suggestion
  expect((await add(page, t, { heading: 'One', ext_id: '' })).ext_id).toBe('1');
  expect((await add(page, t, { heading: 'Two' })).ext_id).toBe('2');
  expect((await topics(page, t)).next_key).toBe('3');
  // a key with a number at the end: prefix and zeros are kept
  expect((await add(page, t, { heading: 'Login', ext_id: 'DMZ-004' })).ext_id).toBe('DMZ-004');
  expect((await topics(page, t)).next_key).toBe('DMZ-005');
  // taken ones are skipped, also in another case
  expect((await add(page, t, { heading: 'Later', ext_id: 'dmz-006' })).ext_id).toBe('dmz-006');
  expect((await add(page, t, { heading: 'Logout', ext_id: 'DMZ-005' })).ext_id).toBe('DMZ-005');
  expect((await topics(page, t)).next_key).toBe('DMZ-007'); // last DMZ-005 -> 006 is taken (dmz-006)
  expect((await add(page, t, { heading: 'Profile' })).ext_id).toBe('DMZ-007');
  // the key of a done item counts too: finish all, the suggestion goes on
  for (let i = 0; i < 6; i++) {
    const active = (await topics(page, t)).open[0].id;
    expect((await write(page, 'topic_item_next.php', { t, item: active, mode: 'close_empty' })).ok()).toBeTruthy();
  }
  const lists = await topics(page, t);
  expect(lists.open).toHaveLength(0);
  expect(lists.next_key).toBe('DMZ-008');
  expect(keysOf(t)).toEqual(['1', '2', 'DMZ-004', 'dmz-006', 'DMZ-005', 'DMZ-007']);
});

test('invalid keys are refused, nothing is written; lengths are cut like before', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = await team(page, 'Item Keys Invalid');
  const item = (await add(page, t, { heading: 'Valid', ext_id: 'OK-1' })).item_id;
  for (const key of ['A.php', 'A#1', 'A 1', 'Ä-1', 'a/b', 'x:1', '-x', '_x', 'DMZ-4.php', '<b>']) {
    const res = await write(page, 'topic_item_add.php', { t }, { heading: 'Bad', ext_id: key });
    expect(res.status(), key).toBe(400);
    expect(await res.json()).toEqual({ error: 'ext_id' });
    const edit = await write(page, 'topic_item_edit.php', { t, item }, { ext_id: key });
    expect(edit.status(), key).toBe(400);
    expect(await edit.json()).toEqual({ error: 'ext_id' });
  }
  expect(keysOf(t)).toEqual(['OK-1']);
  // trimmed and cut to 20 characters (as before), then checked
  expect((await add(page, t, { heading: 'Long', ext_id: '  ' + 'E'.repeat(40) })).ext_id).toBe('E'.repeat(20));
  // an empty key on edit is refused (the key is required); a missing one stays as it is
  expect((await write(page, 'topic_item_edit.php', { t, item }, { ext_id: '' })).status()).toBe(400);
  expect((await write(page, 'topic_item_edit.php', { t, item }, { heading: 'Renamed' })).ok()).toBeTruthy();
  expect(keysOf(t)).toEqual(['OK-1', 'E'.repeat(20)]);
});

test('keys are unique per team without case; another team may use the same key', async ({ browser }) => {
  const page = await newPlayer(browser);
  const t = await team(page, 'Item Keys Unique');
  const a = (await add(page, t, { heading: 'A', ext_id: 'DMZ-4' })).item_id;
  const b = (await add(page, t, { heading: 'B', ext_id: 'DMZ-5' })).item_id;

  const dup = await write(page, 'topic_item_add.php', { t }, { heading: 'Dup', ext_id: 'dmz-4' });
  expect(dup.status()).toBe(409);
  expect(await dup.json()).toEqual({ error: 'key_taken' });
  const rename = await write(page, 'topic_item_edit.php', { t, item: b }, { ext_id: 'Dmz-4' });
  expect(rename.status()).toBe(409);
  expect(await rename.json()).toEqual({ error: 'key_taken' });
  // the own key in another case, and the own key sent unchanged
  const own = await write(page, 'topic_item_edit.php', { t, item: a }, { ext_id: 'dmz-4', heading: 'A2' });
  expect(own.status()).toBe(200);
  expect((await own.json()).ext_id).toBe('dmz-4');
  expect((await write(page, 'topic_item_edit.php', { t, item: b }, { ext_id: 'DMZ-5', heading: 'B2' })).ok()).toBeTruthy();
  expect(keysOf(t)).toEqual(['dmz-4', 'DMZ-5']);

  // a deleted item frees its key
  expect((await write(page, 'topic_item_delete.php', { t, item: a })).ok()).toBeTruthy();
  expect((await add(page, t, { heading: 'Again', ext_id: 'DMZ-4' })).ext_id).toBe('DMZ-4');

  // another team: same key is fine
  const other = await team(page, 'Item Keys Other');
  expect((await add(page, other, { heading: 'Same key', ext_id: 'DMZ-4' })).ext_id).toBe('DMZ-4');

  // parallel: the same key twice -> exactly one item; no key twice -> two different keys
  const parallel = await Promise.all([1, 2, 3].map(i =>
    write(page, 'topic_item_add.php', { t }, { heading: `P${i}`, ext_id: 'PAR-1' })));
  expect(parallel.map(r => r.status()).sort()).toEqual([200, 409, 409]);
  await Promise.all([1, 2, 3].map(i => add(page, t, { heading: `S${i}` })));
  const keys = keysOf(t);
  expect(new Set(keys.map(k => k.toLowerCase())).size).toBe(keys.length);
  expect(keys).toHaveLength(6);
  // the unique index is the safety net behind the check
  expect(sql('pok_e2e', `select non_unique from information_schema.statistics where table_schema = 'pok_e2e'
    and table_name = 'pok_topic_items_tbl' and index_name = 'ux_topic_items_team_key' and seq_in_index = 2`)).toBe('0');
});

test('migration script: dry run writes nothing, --apply fills empty, invalid and duplicate keys, a second run is 0', () => {
  const db = 'pok_e2e_mig'; // own database (tests/e2e/setup.sh): items from before the key rule, no unique index
  sql(db, `drop table if exists pok_topic_items_tbl, pok_teams_tbl;
    create table pok_teams_tbl like pok_e2e.pok_teams_tbl;
    create table pok_topic_items_tbl like pok_e2e.pok_topic_items_tbl;
    alter table pok_topic_items_tbl drop index ux_topic_items_team_key, modify ext_id varchar(20) null;
    insert into pok_teams_tbl(id, name) values ('mig-a', 'A'), ('mig-b', 'B'), ('mig-c', 'C');
    insert into pok_topic_items_tbl(team_id, ext_id, heading) values
      ('mig-a', null, 'Secret heading'), ('mig-a', '', 'h'), ('mig-a', 'DMZ-004', 'h'), ('mig-a', null, 'h'),
      ('mig-a', 'dmz-005', 'h'), ('mig-a', 'DMZ-005', 'h'), ('mig-a', 'PRJ 1', 'h'), ('mig-a', 'PRJ-1', 'h'),
      ('mig-a', 'Ä-1', 'h'), ('mig-a', 'A.php', 'h'), ('mig-a', '#', 'h'), ('mig-a', 'ABCDEFGHIJKLMNOPQRST', 'h'),
      ('mig-a', 'abcdefghijklmnopqrst', 'h'),
      ('mig-b', 'OK-1', 'h'), ('mig-b', 'OK-2', 'h'),
      ('mig-c', null, 'h'), ('mig-c', null, 'h'), ('mig-c', '-x-', 'h'),
      ('mig-gone', null, 'h')`); // items of a deleted team (no team row) must be valid for the DDL too
  const dir = mkdtempSync(join(tmpdir(), 'b150-'));
  const config = join(dir, 'config.php');
  writeFileSync(config, `<?php
const _MYSQL_HOST = '127.0.0.1';
const _MYSQL_USER = 'pok_e2e';
const _MYSQL_PWD = 'pok_e2e';
const _MYSQL_DB = '${db}';
const _MYSQL_PORT = 3306;
`);
  const run = (...args: string[]) => execFileSync('php', [join(REPO, 'tools/migration/b150_item_keys.php'),
    `--config=${config}`, ...args], { encoding: 'utf8' });
  const keys = (t: string) => sql(db, `select ifnull(ext_id, 'NULL') from pok_topic_items_tbl where team_id = '${t}' order by id`)
    .split('\n');
  const rev = () => sql(db, `select group_concat(topics_rev order by id) from pok_teams_tbl`);
  const before = keys('mig-a');
  try {
    const dry = run();
    expect(dry).toContain('DRY RUN');
    expect(dry).toContain('items changed: 13 (empty: 6, invalid: 5, duplicate: 2)');
    expect(dry).toContain('teams with items: 4 (of them without team row: 1), teams changed: 3');
    // no team ids, no headings in the output
    expect(dry).not.toContain('mig-a');
    expect(dry).not.toContain('Secret');
    expect(keys('mig-a')).toEqual(before);
    expect(rev()).toBe('0,0,0');

    const applied = run('--apply');
    expect(applied).toContain('items changed: 13 (empty: 6, invalid: 5, duplicate: 2)');
    // the same changes as announced by the dry run
    expect(applied.replace(/^.*\n/, '')).toBe(dry.replace(/^.*\n/, '').replace('run again with --apply to write\n', ''));
    expect(keys('mig-a')).toEqual(['1', '2', 'DMZ-004', 'DMZ-006', 'dmz-005', 'DMZ-005-2', 'PRJ-1-2', 'PRJ-1', '1-2',
      'A-php', '11', 'ABCDEFGHIJKLMNOPQRST', 'abcdefghijklmnopqr-2']);
    expect(keys('mig-b')).toEqual(['OK-1', 'OK-2']);
    expect(keys('mig-c')).toEqual(['1', '2', 'x']);
    expect(keys('mig-gone')).toEqual(['1']);
    expect(rev()).toBe('9,0,3'); // topics_rev: open boards reload their lists

    // every key valid and unique: the DDL of db_schema_pok_inc.sql would pass now
    expect(sql(db, `select count(1) from pok_topic_items_tbl
      where ext_id is null or not regexp_like(ext_id, '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}\\\\z', 'c')`)).toBe('0');
    expect(sql(db, `select count(1) from (select 1 from pok_topic_items_tbl group by team_id, ext_id having count(1) > 1) d`))
      .toBe('0');

    expect(run('--apply')).toContain('items changed: 0 (empty: 0, invalid: 0, duplicate: 0)');
    expect(run()).toContain('items changed: 0');
    expect(rev()).toBe('9,0,3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    sql(db, 'drop table if exists pok_topic_items_tbl, pok_teams_tbl');
  }
});
