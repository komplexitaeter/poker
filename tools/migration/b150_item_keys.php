<?php
/*
 * B-150 (docs/api-v1-concept.md, 7.2 step 2): gives every topic item a valid key that is unique in its team, once,
 * before the schema is tightened (block "B-150 item keys" in db_schema_pok_inc.sql: ext_id not null + unique index).
 *
 *   php tools/migration/b150_item_keys.php [--config=<path to config.php>]           dry run (default, writes nothing)
 *   php tools/migration/b150_item_keys.php [--config=<path to config.php>] --apply   writes
 *
 * Order on a server: deploy the code (the board and the API set keys from then on) -> dry run -> --apply -> DDL.
 * Per team ONE transaction under the team row lock (lock_team_topics_or_throw(), B-155), items in id order:
 *   - empty (null or '')         -> the suggestion of the board (item_key_suggest(), as if the later items did not exist)
 *   - invalid (other characters) -> those characters replaced by '-', '-'/'_' at both ends removed, cut to 20 characters;
 *                                   nothing usable left -> the suggestion
 *   - duplicate (same key as an earlier item of the team, in the collation of the column, e.g. 'dmz-4' = 'DMZ-4')
 *                                -> '-2', '-3', ... appended (shortened in front of it if needed)
 * Every final value is checked against ITEM_KEY_PATTERN and must be free in the team (SQL, collation), else the next
 * number is tried (at most 1000 times, then the suggestion); a value that still fails stops the script (exit 1, that
 * team rolled back). Writes through set_topic_item_key() (topics_rev + 1, open boards reload the lists) and notifies
 * the changed teams after their commit. The dry run makes the same changes in a transaction and rolls it back (so it
 * shows exactly what --apply would do; it holds the team row lock for milliseconds, like a normal write).
 * --apply first backs up all keys once into pok_topic_items_b150_bak (b150_backup()).
 * Output: counts and pairs old -> new only, no team ids or headings. Idempotent: a second run reports 0.
 * Exit codes: 0 ok, 1 error.
 */
require __DIR__ . '/common.php';

const B150_SUFFIX_TRIES = 1000;

$opts = getopt('', array('config:', 'apply', 'help'));
if (isset($opts['help'])) {
    echo "usage: php tools/migration/b150_item_keys.php [--config=<path>] [--apply]\n";
    exit(0);
}
$apply = isset($opts['apply']);
mig_load($opts);
$link = mig_connect(false);

/* the key with characters outside [A-Za-z0-9_-] replaced by '-', leading and trailing '-'/'_' removed, at most 20
   characters */
function b150_cleaned_key(string $key): string
{
    $cleaned = preg_replace('/[^A-Za-z0-9_-]/u', '-', $key);
    if (!is_string($cleaned)) $cleaned = preg_replace('/[^A-Za-z0-9_-]/', '-', $key) ?? ''; // not UTF-8: per byte
    return rtrim(substr(ltrim($cleaned, '-_'), 0, TOPIC_EXT_ID_MAX), '-_');
}

/* $base if it is valid and free in the team (apart from item $id), else $base-2, $base-3, ... else the suggestion */
function b150_free_key(mysqli $link, string $t, int $id, string $base, bool $base_allowed): string
{
    if ($base !== '' && $base_allowed && valid_item_key($base) && !item_key_taken($link, $t, $base, $id)) return $base;
    if ($base !== '') {
        for ($n = 2; $n < B150_SUFFIX_TRIES + 2; $n++) {
            $suffix = '-' . $n;
            $candidate = substr($base, 0, TOPIC_EXT_ID_MAX - strlen($suffix)) . $suffix;
            if (!valid_item_key($candidate)) break;
            if (!item_key_taken($link, $t, $candidate, $id)) return $candidate;
        }
    }
    return item_key_suggest($link, $t, $id);
}

/* is there an item with a lower id in the team with the same key (SQL, collation of the column) */
function b150_has_earlier(mysqli $link, string $t, int $id, string $key): bool
{
    $sql = $link->prepare("select 1 from pok_topic_items_tbl where team_id = ? and ext_id = ? and id < ? limit 1");
    $sql->bind_param('ssi', $t, $key, $id);
    $sql->execute();
    $found = is_array($sql->get_result()->fetch_row());
    $sql->close();
    return $found;
}

/*
 * Fixes the keys of team $t inside the caller's transaction (team row locked first; $orphan: the team row is missing).
 * Returns the changes as list of [case, old, new].
 */
function b150_fix_team(mysqli $link, string $t, bool &$orphan): array
{
    try {
        lock_team_topics_or_throw($link, $t);
        $orphan = false;
    } catch (ApiError $e) {
        // items of a team that no longer exists (deleting a team leaves its items): no board, nobody writes them,
        // so they are fixed without a lock - the DDL needs them valid too
        $orphan = true;
    }
    $sql = $link->prepare("select id, ext_id from pok_topic_items_tbl where team_id = ? order by id");
    $sql->bind_param('s', $t);
    $sql->execute();
    $rows = $sql->get_result()->fetch_all(MYSQLI_ASSOC);
    $sql->close();

    $changes = array();
    foreach ($rows as $row) {
        $id = (int)$row['id'];
        $old = $row['ext_id'] === null ? null : (string)$row['ext_id'];
        if ($old === null || $old === '') {
            $case = 'empty';
            $new = item_key_suggest($link, $t, $id);
        } elseif (!valid_item_key($old)) {
            $case = 'invalid';
            $new = b150_free_key($link, $t, $id, b150_cleaned_key($old), true);
        } elseif (b150_has_earlier($link, $t, $id, $old)) {
            $case = 'duplicate';
            $new = b150_free_key($link, $t, $id, $old, false);
        } else {
            continue;
        }
        if (!valid_item_key($new) || item_key_taken($link, $t, $new, $id))
            throw new RuntimeException('B-150: no valid free key found (' . json_encode($old) . ')');
        set_topic_item_key($link, $t, $id, $new);
        $changes[] = array($case, $old, $new);
    }
    return $changes;
}

/*
 * Backup before --apply (review Sina): table pok_topic_items_b150_bak keeps the key of every item as it was before the
 * first --apply (id, team_id, ext_id). Created once, only if it is missing (MySQL checks the CREATE privilege even for
 * "create table if not exists", so an admin-created table plus "grant select, insert" is enough); rows already backed
 * up stay as they are (insert ignore on the primary key id), so a second run never overwrites the original value.
 * Read without locks (plain select, then inserts in batches; no insert ... select on the items table, B-155). Restore
 * of a single team: see tools/migration/README.md. Drop the table once B-150 is live and checked.
 */
function b150_backup(mysqli $link): int
{
    $exists = $link->query("select 1 from information_schema.tables
                             where table_schema = database() and table_name = 'pok_topic_items_b150_bak'")->fetch_row();
    if (!is_array($exists)) $link->query("create table if not exists pok_topic_items_b150_bak (
                    id int unsigned not null primary key comment 'pok_topic_items_tbl.id',
                    team_id varchar(80) not null,
                    ext_id varchar(20) null comment 'key before tools/migration/b150_item_keys.php --apply',
                    backup_date timestamp not null default current_timestamp
                  ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci
                    comment 'B-150: item keys before the migration (drop after the rollout)'");
    $rows = $link->query("select id, team_id, ext_id from pok_topic_items_tbl order by id")->fetch_all(MYSQLI_NUM);
    $added = 0;
    foreach (array_chunk($rows, 200) as $chunk) {
        $sql = $link->prepare("insert ignore into pok_topic_items_b150_bak(id, team_id, ext_id) values "
                              . implode(',', array_fill(0, count($chunk), '(?, ?, ?)')));
        $params = array_merge(...array_map(fn($row) => array((int)$row[0], (string)$row[1], $row[2]), $chunk));
        $sql->bind_param(str_repeat('iss', count($chunk)), ...$params);
        $sql->execute();
        $added += (int)$sql->affected_rows;
        $sql->close();
    }
    return $added;
}

$teams = array_map(fn($row) => (string)$row[0],
                   $link->query("select distinct team_id from pok_topic_items_tbl order by team_id")->fetch_all());

echo ($apply ? 'APPLY' : 'DRY RUN (nothing is written, --apply writes)') . ' on database ' . mig_database($link) . "\n";
if ($apply) {
    try {
        $backed_up = b150_backup($link);
    } catch (mysqli_sql_exception $e) {
        mig_fail('backup failed, nothing changed (' . $e->getCode() . '): ' . $e->getMessage()
                 . ' - create the table as admin, see tools/migration/README.md');
    }
    echo "backup: $backed_up items added to pok_topic_items_b150_bak (items backed up before keep their first value)\n";
}
$counts = array('empty' => 0, 'invalid' => 0, 'duplicate' => 0);
$changed_teams = 0;
$orphan_teams = 0;
try {
    foreach ($teams as $t) {
        $orphan = false;
        if ($apply) {
            $changes = db_transaction($link, function () use ($link, $t, &$orphan): array {
                return b150_fix_team($link, $t, $orphan);
            });
            if (count($changes) > 0 && !$orphan) notify_team($t); // B-81: open boards reload the list
        } else {
            $link->begin_transaction();
            try {
                $changes = b150_fix_team($link, $t, $orphan);
            } finally {
                $link->rollback();
            }
        }
        if (count($changes) > 0) $changed_teams++;
        if ($orphan) $orphan_teams++;
        foreach ($changes as [$case, $old, $new]) {
            $counts[$case]++;
            echo "  $case: " . ($old === null ? 'NULL' : json_encode($old, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))
                . " -> $new\n";
        }
    }
} catch (Throwable $e) {
    mig_fail('error, this team was rolled back: ' . $e->getMessage());
}

$total = array_sum($counts);
echo "teams with items: " . count($teams) . " (of them without team row: $orphan_teams), teams changed: $changed_teams\n";
echo "items changed: $total (empty: {$counts['empty']}, invalid: {$counts['invalid']}, duplicate: {$counts['duplicate']})\n";
if (!$apply && $total > 0) echo "run again with --apply to write\n";
