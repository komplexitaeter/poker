<?php
/*
 * B-98: shared bootstrap of the R3 deck migration tools (check_deck_migration.php, make_test_teams.php).
 * CLI only: the web root of the servers is the whole repository, so these files are reachable by URL - they must do
 * nothing there.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const MIG_REPO_DIR = __DIR__ . '/../..';

/* prints to stderr and exits */
function mig_fail(string $message, int $code = 1): never
{
    fwrite(STDERR, $message . "\n");
    exit($code);
}

/* Loads config.php (--config=<path>, default: config.php of this checkout) and the app functions (api/lib.php) of
   THIS checkout. */
function mig_load(array $opts): void
{
    $config = isset($opts['config']) && is_string($opts['config']) ? $opts['config'] : MIG_REPO_DIR . '/config.php';
    if (!is_file($config)) mig_fail("config.php not found: $config (use --config=<path>)");
    require $config;
    require_once MIG_REPO_DIR . '/api/lib.php';
}

/* connects (after mig_load()); $read_only: the session refuses every write (set session transaction read only) */
function mig_connect(bool $read_only): mysqli
{
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $link = db_init();
    if ($read_only) $link->query("set session transaction read only");
    return $link;
}

/* name of the connected database */
function mig_database(mysqli $link): string
{
    $row = $link->query("select database() db")->fetch_assoc();
    return (string)($row['db'] ?? '');
}

/* true if pok_teams_tbl has the R3 column $column already (before the R3 schema change it does not) */
function mig_has_column(mysqli $link, string $table, string $column): bool
{
    $sql = $link->prepare("select count(1) cnt from information_schema.columns
                            where table_schema = database() and table_name = ? and column_name = ?");
    $sql->bind_param('ss', $table, $column);
    $sql->execute();
    return (int)$sql->get_result()->fetch_assoc()['cnt'] > 0;
}

/* sorted positions of the '1' bits of an old cardset_flags string */
function mig_on_indexes(?string $flags): array
{
    $on = array();
    $flags = (string)$flags;
    for ($i = 0; $i < strlen($flags); $i++)
        if ($flags[$i] === '1') $on[] = $i;
    return $on;
}

/* canonical cardset_flags for a list of bit positions (at least the 46 positions of cards.json v1) */
function mig_flags_from_indexes(array $on): string
{
    $length = count($on) > 0 ? max(46, max($on) + 1) : 46;
    $flags = str_repeat('0', $length);
    foreach ($on as $i) $flags[$i] = '1';
    return $flags;
}
