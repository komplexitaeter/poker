<?php
/*
 * B-98: creates test teams on STAGING with real cardset_flags patterns of live (JSON of check_deck_migration.php
 * --json), not migrated yet (deck_id null), so the lazy R3 migration can be watched by hand on their boards.
 * Copies no live team: only the bit pattern travels. Usage: tools/migration/README.md.
 *
 *   php8.4 tools/migration/make_test_teams.php --i-am-on-staging --input=<patterns.json>
 *          [--categories=mixed,subset] [--top=N] [--base-url=https://poker-staging.komplexitaeter.de/]
 *          [--config=<config.php>] [--dry-run]
 *
 * Refuses to run without --i-am-on-staging and against the live database pok_db.
 */
require __DIR__ . '/common.php';

const LIVE_DATABASE = 'pok_db';

$opts = getopt('', array('i-am-on-staging', 'input:', 'categories:', 'top:', 'base-url:', 'config:', 'dry-run', 'help'));
if (isset($opts['help']) || !isset($opts['input'])) {
    echo "usage: make_test_teams.php --i-am-on-staging --input=<patterns.json> [--categories=mixed,subset|all]"
       . " [--top=N] [--base-url=<url>] [--config=<config.php>] [--dry-run]\n";
    exit(isset($opts['help']) ? 0 : 1);
}
if (!isset($opts['i-am-on-staging'])) mig_fail('refused: only for the staging server, confirm with --i-am-on-staging');

$categories = explode(',', (string)($opts['categories'] ?? 'mixed,subset'));
if ($categories === array('all')) $categories = array('preset', 'subset', 'mixed', 'empty');
foreach ($categories as $c)
    if (!in_array($c, array('preset', 'subset', 'mixed', 'empty'), true)) mig_fail("unknown category: $c");
$top = null;
if (isset($opts['top'])) {
    if (!preg_match('/^[1-9][0-9]{0,3}$/D', (string)$opts['top'])) mig_fail('--top must be a positive number');
    $top = (int)$opts['top'];
}
$base_url = (string)($opts['base-url'] ?? 'https://poker-staging.komplexitaeter.de/');
if (!preg_match('~^https?://[A-Za-z0-9.:-]+(/[A-Za-z0-9._/-]*)?$~D', $base_url)) mig_fail('invalid --base-url');
$base_url = rtrim($base_url, '/') . '/';
$dry_run = isset($opts['dry-run']);

$input = json_decode((string)@file_get_contents((string)$opts['input']), true);
if (!is_array($input) || !isset($input['patterns']) || !is_array($input['patterns']))
    mig_fail('input is not the JSON of check_deck_migration.php --json');

mig_load($opts);
if (_MYSQL_DB === LIVE_DATABASE) mig_fail('refused: config.php points to the live database ' . LIVE_DATABASE);
$link = mig_connect($dry_run);
if (mig_database($link) === LIVE_DATABASE)
    mig_fail('refused: connected to the live database ' . LIVE_DATABASE);
if (!mig_has_column($link, 'pok_teams_tbl', 'deck_id')) mig_fail('pok_teams_tbl has no deck_id yet: run the R3 schema changes first');

// patterns with the most teams first
$patterns = array_values(array_filter($input['patterns'], fn($p) => is_array($p)
    && in_array($p['category'] ?? '', $categories, true)));
usort($patterns, fn($a, $b) => (int)($b['teams'] ?? 0) <=> (int)($a['teams'] ?? 0));
if ($top !== null) $patterns = array_slice($patterns, 0, $top);
if (count($patterns) === 0) mig_fail('no pattern of the categories ' . implode(',', $categories) . ' in the input');

echo ($dry_run ? '[dry run] ' : '') . 'database ' . mig_database($link) . ': ' . count($patterns) . " test team(s)\n";
$sql = $dry_run ? null : $link->prepare("update pok_teams_tbl
                                           set cardset_flags = ?, needs_setup = ?, deck_id = null, deck_cards = null,
                                               deck_controls = null, deck_rev = 0
                                         where id = ?");
foreach ($patterns as $p) {
    $on = $p['on_indexes'] ?? null;
    if (!is_array($on) || count($on) > 2000) mig_fail('pattern without valid on_indexes');
    foreach ($on as $i)
        if (!is_int($i) || $i < 0 || $i >= 2000) mig_fail('pattern with an invalid bit position');
    $on = array_values(array_unique($on));
    sort($on);
    $flags = mig_flags_from_indexes($on);
    $no = (int)($p['no'] ?? 0);
    $name = "Migration test $no";
    // a pattern of needs_setup teams only stays a needs_setup team (the board shows the setup first)
    $needs_setup = (int)($p['needs_setup_teams'] ?? 0) > 0 && (int)$p['needs_setup_teams'] === (int)($p['teams'] ?? -1) ? 1 : 0;
    $label = sprintf('%-18s %-6s %5d live teams  %s', $name, $p['category'], (int)($p['teams'] ?? 0),
                     implode(' ', (array)($p['old']['cards'] ?? array())));
    if ($dry_run) {
        echo "$label\n";
        continue;
    }
    // the normal team creation (all column defaults as in addteam.php), then the old deck instead of the new one
    $id = add_team($link, $name);
    if ($id === '') mig_fail("could not create $name");
    $sql->bind_param('sis', $flags, $needs_setup, $id);
    $sql->execute();
    echo "$label\n    {$base_url}?t=" . rawurlencode($id) . "\n";
}
