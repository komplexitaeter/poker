<?php
/*
 * B-98: read-only dry run of the R3 deck migration (old cardset_flags -> deck_id/deck_cards/deck_controls, mixed decks
 * -> custom set "Our deck"). Writes nothing: the session is read only. Prints no team ids or names, only flag patterns
 * and counts. Usage and order of the steps: tools/migration/README.md.
 *
 *   php8.4 tools/migration/check_deck_migration.php [--config=<config.php>] [--days=N] [--json]
 *   php8.4 tools/migration/check_deck_migration.php [--config=<config.php>] --verify [--json]
 *
 * Dry run: every distinct cardset_flags pattern of the teams without deck_id (optionally only teams active in the
 * last N days) runs through deck_from_cardset_flags()/resolve_deck() of THIS checkout and is checked: the cards of the
 * result must be exactly the old cards (cards.json v1, by legacy_index and numeric value), the control cards must be
 * the old ones (except ✋ in J.U.D.G.E. with "6 veto"). Exit code 2 if a pattern FAILs.
 * --verify (after the deploy): compares the migrated teams with the backup table pok_teams_deck_backup_r3.
 */
require __DIR__ . '/common.php';

const MIG_BACKUP_TABLE = 'pok_teams_deck_backup_r3';

$opts = getopt('', array('config:', 'days:', 'json', 'verify', 'help'));
if (isset($opts['help'])) {
    echo "usage: check_deck_migration.php [--config=<config.php>] [--days=N] [--json] | --verify [--json]\n";
    exit(0);
}
$days = null;
if (isset($opts['days'])) {
    if (!preg_match('/^[1-9][0-9]{0,4}$/D', (string)$opts['days'])) mig_fail('--days must be a positive number');
    $days = (int)$opts['days'];
}
$as_json = isset($opts['json']);

mig_load($opts);
$link = mig_connect(true);
$catalog = card_catalog();
if ($catalog['default_deck'] === null) mig_fail('card_catalog.json missing or broken (no default deck) - nothing to check');
$v1 = json_decode((string)file_get_contents(MIG_REPO_DIR . '/cards.json'), true);
if (!is_array($v1) || !isset($v1['cards'])) mig_fail('cards.json missing or broken');
$v1_cards = array();
foreach ($v1['cards'] as $card) $v1_cards[(int)$card['index']] = $card;

if (isset($opts['verify'])) {
    $result = verify_migration($link, $catalog, $v1_cards);
    if ($as_json) echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), "\n";
    else print_verify($result);
    exit($result['summary']['mismatch'] > 0 ? 2 : 0);
}

$rows = read_patterns($link, $days);
$patterns = array();
foreach ($rows as $flags => $row) {
    $check = check_pattern((string)$flags, $catalog, $v1_cards);
    $patterns[] = array_merge(array('teams' => $row['teams'], 'needs_setup_teams' => $row['needs_setup_teams'],
                                    'last_active' => $row['last_active']), $check);
}
usort($patterns, fn($a, $b) => [$b['teams'], $a['flags']] <=> [$a['teams'], $b['flags']]);
foreach ($patterns as $i => &$pattern) $pattern = array_merge(array('no' => $i + 1), $pattern);
unset($pattern);

$summary = summarize($patterns);
$out = array('generated' => date('Y-m-d H:i'), 'database' => mig_database($link), 'days' => $days,
             'catalog_version' => $catalog['version'] ?? null, 'default_deck' => $catalog['default_deck'],
             'summary' => $summary, 'patterns' => $patterns);
if ($as_json) echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), "\n";
else print_report($out);
exit($summary['status']['FAIL']['patterns'] > 0 ? 2 : 0);

/*
 * Teams without deck_id grouped by their pattern (canonical flags, so '0011' and '00110000' count as one pattern):
 * flags => {teams, needs_setup_teams, last_active (date)}. Last activity: last board load of a player
 * (pok_players_tbl.last_callback_time, indexed, B-64), else the creation of the team. --days: only teams with a board
 * load or created in the last N days. Before the R3 schema change (no column deck_id) every team counts.
 */
function read_patterns(mysqli $link, ?int $days): array
{
    $not_migrated = mig_has_column($link, 'pok_teams_tbl', 'deck_id') ? 't.deck_id is null' : '1 = 1';
    $window = $days ?? 36500;
    $active = $days === null ? '' : 'and (a.team_id is not null or t.creation_date >= now() - interval ? day)';
    $sql = $link->prepare("select /*+ MAX_EXECUTION_TIME(120000) */
                                  t.cardset_flags, count(*) teams, sum(t.needs_setup <> 0) needs_setup_teams,
                                  max(greatest(t.creation_date, coalesce(a.last_active, t.creation_date))) last_active
                             from pok_teams_tbl t
                             left join (select team_id, max(last_callback_time) last_active
                                          from pok_players_tbl
                                         where last_callback_time >= now() - interval ? day
                                         group by team_id) a on a.team_id = t.id
                            where $not_migrated $active
                            group by t.cardset_flags");
    if ($days === null) $sql->bind_param('i', $window);
    else $sql->bind_param('ii', $window, $days);
    $sql->execute();
    $result = $sql->get_result();
    $patterns = array();
    while ($row = $result->fetch_assoc()) {
        $flags = mig_flags_from_indexes(mig_on_indexes($row['cardset_flags']));
        $p = $patterns[$flags] ?? array('teams' => 0, 'needs_setup_teams' => 0, 'last_active' => '');
        $p['teams'] += (int)$row['teams'];
        $p['needs_setup_teams'] += (int)$row['needs_setup_teams'];
        $p['last_active'] = max($p['last_active'], substr((string)$row['last_active'], 0, 10));
        $patterns[$flags] = $p;
    }
    return $patterns;
}

/* label of an old card (cards.json v1 description) */
function v1_label(array $v1_cards, int $index): string
{
    return isset($v1_cards[$index]) ? (string)$v1_cards[$index]['description'] : "#$index";
}

/* old control cards: flow control cards of cards.json v1 plus the veto card (a control card from R3 on) */
function v1_is_control(array $card): bool
{
    return !empty($card['flow_control']) || $card['card_key'] === 'veto';
}

/* numeric values as comparable strings (null stays null) */
function num_key($value): ?string
{
    return $value === null ? null : sprintf('%.2f', (float)$value);
}

/*
 * Runs one pattern through the migration of this checkout and checks the result against the old cards.
 * Category: preset (equals a variant), subset (part of a variant group), mixed (custom set "Our deck"),
 * empty (no old card, only control cards or nothing -> default deck by design, e.g. needs_setup).
 * Status: FAIL (cards or control cards differ, unknown deck, value too long for its column), WARN (worth a look:
 * empty -> default deck, a single card, ignored bits), OK.
 */
function check_pattern(string $flags, array $catalog, array $v1_cards): array
{
    $on = mig_on_indexes($flags);
    $fails = array();
    $warns = array();
    $notes = array();

    $old_cards = array();
    $old_controls = array();
    $ignored = array();
    foreach ($on as $i) {
        if (!isset($v1_cards[$i])) $ignored[] = $i;
        else if (v1_is_control($v1_cards[$i])) $old_controls[] = $i;
        else $old_cards[] = $i;
    }
    if (count($ignored) > 0) $warns[] = 'bits without a card in cards.json v1 ignored: ' . implode(',', $ignored);

    $m = deck_from_cardset_flags($flags, $catalog);
    $mixed = isset($m['mixed']);
    if (count($old_cards) === 0) $category = 'empty';
    else if ($mixed) $category = 'mixed';
    else if ($m['deck_cards'] === null) $category = 'preset';
    else $category = 'subset';

    // the new cards: [legacy_index (or null), numeric value (catalog), shown value]
    $new_cards = array();
    $controls_new = array();
    $deck_out = array('deck_id' => $m['deck_id'], 'deck_cards' => $m['deck_cards'], 'deck_controls' => $m['deck_controls']);
    $known_controls = array_column($catalog['controls'], 'card_key');
    if ($mixed) {
        $symbols = custom_symbols($catalog);
        $symbol_values = catalog_symbol_values($catalog);
        $deck_out = array('deck_id' => 'c-<new set "' . CUSTOM_MIGRATED_SET_NAME . '">', 'deck_cards' => null,
                          'deck_controls' => $m['deck_controls']);
        foreach ($m['mixed'] as $entry) {
            $symbol = $entry['symbol'] ?? null;
            // as migrate_mixed_deck() stores it: symbol card (value from the symbol) or text card (cut to 6 graphemes)
            $shown = $symbol !== null ? ($symbol_values[$symbol] ?? '') : cut_text((string)($entry['value'] ?? ''), CUSTOM_VALUE_MAX);
            if ($symbol !== null && !in_array($symbol, $symbols, true))
                $warns[] = "symbol $symbol not in custom_symbols (editor)";
            if ($shown !== (string)($entry['value'] ?? ''))
                $fails[] = "custom card {$entry['card_key']} would show '" . $shown . "' instead of '" . ($entry['value'] ?? '') . "'";
            $new_cards[] = array(isset($entry['legacy_index']) ? (int)$entry['legacy_index'] : null,
                                 $entry['numeric_value'] ?? null, $shown, $entry['card_key']);
        }
        if (count($m['mixed']) < CUSTOM_DECK_MIN_CARDS) $fails[] = 'custom set with fewer than ' . CUSTOM_DECK_MIN_CARDS . ' cards';
        $notes[] = 'custom set "' . CUSTOM_MIGRATED_SET_NAME . '" created on first load (team below ' . custom_sets_max() . ' sets)';
        foreach (explode(',', (string)$m['deck_controls']) as $key)
            if ($key !== '' && in_array($key, $known_controls, true)) $controls_new[] = $key;
    } else {
        $deck = resolve_deck($m['deck_id'], $m['deck_cards'], $m['deck_controls'], 0, $catalog);
        if ($deck['id'] !== $m['deck_id']) $fails[] = "deck id '{$m['deck_id']}' unknown, falls back to '{$deck['id']}'";
        $group_cards = array();
        foreach ($catalog['groups'] as $group)
            if ($group['id'] === $deck['group'])
                foreach ($group['cards'] as $card) $group_cards[$card['card_key']] = $card;
        foreach ($deck['cards'] as $key) {
            $card = $group_cards[$key] ?? array();
            $new_cards[] = array(isset($card['legacy_index']) ? (int)$card['legacy_index'] : null,
                                 $card['numeric_value'] ?? null, (string)($card['value'] ?? $key), $key);
        }
        if ($m['deck_cards'] !== null) {
            $wanted = explode(',', $m['deck_cards']);
            if ($deck['cards'] !== array_values(array_intersect($deck['cards'], $wanted)) || count($deck['cards']) !== count($wanted))
                $fails[] = 'deck_cards not taken over completely by resolve_deck()';
        }
        $controls_new = $deck['controls'];
        $deck_out['group'] = $deck['group'];
    }

    // cards: exactly the old ones (by legacy_index), no extra, none missing, same numeric value
    $new_indexes = array();
    foreach ($new_cards as [$index, $numeric, $shown, $key]) {
        if ($index === null) { $fails[] = "extra card $key ($shown) not in the old deck"; continue; }
        if (isset($new_indexes[$index])) $fails[] = "card for old position $index twice";
        $new_indexes[$index] = true;
        if (!in_array($index, $old_cards, true)) {
            if (count($old_cards) > 0) $fails[] = "extra card $key ($shown, old position $index)";
            continue;
        }
        if (num_key($numeric) !== num_key($v1_cards[$index]['numeric_value'] ?? null))
            $fails[] = "card $key ($shown): numeric value " . var_export($numeric, true) . ' instead of '
                     . var_export($v1_cards[$index]['numeric_value'] ?? null, true);
    }
    $missing = array_diff($old_cards, array_keys($new_indexes));
    if (count($missing) > 0)
        $fails[] = 'missing cards: ' . implode(', ', array_map(fn($i) => v1_label($v1_cards, $i), $missing));
    if (count($new_cards) === 0) $fails[] = 'empty deck';
    if ($category === 'empty') $warns[] = 'no old card -> default deck ' . $m['deck_id'] . ' with all its cards (by design)';
    else if (count($new_cards) === 1) $warns[] = 'deck with a single card';

    // control cards: the old ones; ✋ may go if J.U.D.G.E. "6 veto" (jdg6) covers it
    $expected = array_map(fn($i) => (string)$v1_cards[$i]['card_key'], $old_controls);
    $missing_c = array_values(array_diff($expected, $controls_new));
    $extra_c = array_values(array_diff($controls_new, $expected));
    if ($missing_c === array('veto') && ($deck_out['group'] ?? null) === 'judge'
        && in_array('jdg6', array_column($new_cards, 3), true)) {
        $notes[] = '✋ dropped, covered by J.U.D.G.E. card 6 veto';
        $missing_c = array();
    }
    if (count($missing_c) > 0) $fails[] = 'missing control cards: ' . implode(',', $missing_c);
    if (count($extra_c) > 0) $fails[] = 'extra control cards: ' . implode(',', $extra_c);

    // column sizes (strict mode would refuse the update, otherwise MySQL cuts the value)
    if (!$mixed && strlen((string)$m['deck_cards']) > 200) $fails[] = 'deck_cards longer than 200 characters';
    if (strlen((string)$m['deck_controls']) > 40) $fails[] = 'deck_controls longer than 40 characters';

    $status = count($fails) > 0 ? 'FAIL' : (count($warns) > 0 ? 'WARN' : 'OK');
    return array(
        'flags' => $flags,
        'on_indexes' => $on,
        'category' => $category,
        'status' => $status,
        'old' => array('cards' => array_map(fn($i) => v1_label($v1_cards, $i), $old_cards),
                       'controls' => array_map(fn($i) => v1_label($v1_cards, $i), $old_controls)),
        'new' => array_merge($deck_out, array('cards' => array_column($new_cards, 2), 'controls' => $controls_new)),
        'fails' => array_values(array_unique($fails)),
        'warnings' => $warns,
        'notes' => $notes,
    );
}

function summarize(array $patterns): array
{
    $summary = array('patterns' => count($patterns), 'teams' => 0, 'category' => array(), 'status' => array());
    foreach (array('preset', 'subset', 'mixed', 'empty') as $c) $summary['category'][$c] = array('patterns' => 0, 'teams' => 0);
    foreach (array('OK', 'WARN', 'FAIL') as $s) $summary['status'][$s] = array('patterns' => 0, 'teams' => 0);
    foreach ($patterns as $p) {
        $summary['teams'] += $p['teams'];
        $summary['category'][$p['category']]['patterns']++;
        $summary['category'][$p['category']]['teams'] += $p['teams'];
        $summary['status'][$p['status']]['patterns']++;
        $summary['status'][$p['status']]['teams'] += $p['teams'];
    }
    return $summary;
}

function print_report(array $out): void
{
    $s = $out['summary'];
    echo "R3 deck migration dry run (read only)\n";
    echo "database {$out['database']}, catalog version {$out['catalog_version']}, default deck {$out['default_deck']}, ",
         $out['days'] === null ? 'all teams without deck' : "teams active in the last {$out['days']} days", ", {$out['generated']}\n\n";
    printf("%-8s %9s %9s\n", '', 'patterns', 'teams');
    foreach ($s['category'] as $c => $n) printf("%-8s %9d %9d\n", $c, $n['patterns'], $n['teams']);
    printf("%-8s %9d %9d\n\n", 'total', $s['patterns'], $s['teams']);
    foreach ($s['status'] as $st => $n) printf("%-8s %9d %9d\n", $st, $n['patterns'], $n['teams']);
    echo "\n";
    printf("%4s  %-4s  %-6s  %6s  %-10s  %s\n", 'no', 'stat', 'cat', 'teams', 'last activ', 'old -> new');
    foreach ($out['patterns'] as $p) {
        $new = $p['category'] === 'mixed' ? 'custom set' : $p['new']['deck_id'] . ($p['new']['deck_cards'] !== null ? ' (part)' : '');
        printf("%4d  %-4s  %-6s  %6d  %-10s  %s -> %s\n", $p['no'], $p['status'], $p['category'], $p['teams'],
               $p['last_active'], implode(' ', $p['old']['cards']) ?: '-', $new);
        echo '      new cards: ', implode(' ', $p['new']['cards']) ?: '-',
             ' | controls old: ', implode(', ', $p['old']['controls']) ?: '-',
             ' new: ', implode(',', $p['new']['controls']) ?: '-',
             $p['needs_setup_teams'] > 0 ? " | needs_setup: {$p['needs_setup_teams']}" : '', "\n";
        foreach ($p['fails'] as $f) echo "      FAIL: $f\n";
        foreach ($p['warnings'] as $w) echo "      WARN: $w\n";
        foreach ($p['notes'] as $n) echo "      note: $n\n";
    }
    if ($s['status']['FAIL']['patterns'] > 0)
        echo "\n*** {$s['status']['FAIL']['patterns']} pattern(s) FAIL ({$s['status']['FAIL']['teams']} teams) - do not deploy before they are understood ***\n";
}

/*
 * After the deploy: every team that was not migrated at backup time (backup deck_id null) and has a deck now is
 * compared with the expected deck of its backed up flags. Teams that changed their deck since (deck_rev > 0 or other
 * cardset_flags) are only counted. A mixed deck must be a custom set of the team with the expected cards.
 * Result by pattern, no team ids.
 */
function verify_migration(mysqli $link, array $catalog, array $v1_cards): array
{
    if (!mig_has_column($link, MIG_BACKUP_TABLE, 'id')) mig_fail('backup table ' . MIG_BACKUP_TABLE . ' not found');
    $sql = $link->prepare("select /*+ MAX_EXECUTION_TIME(120000) */
                                  t.id, b.cardset_flags old_flags, t.cardset_flags, t.deck_id, t.deck_cards,
                                  t.deck_controls, t.deck_rev
                             from " . MIG_BACKUP_TABLE . " b
                             join pok_teams_tbl t on t.id = b.id
                            where b.deck_id is null");
    $sql->execute();
    $rows = $sql->get_result()->fetch_all(MYSQLI_ASSOC);

    $expected_of = array();
    $by_pattern = array();
    $summary = array('backup_teams_without_deck' => count($rows), 'not_loaded_yet' => 0, 'changed_by_team' => 0,
                     'ok' => 0, 'mismatch' => 0);
    foreach ($rows as $row) {
        $flags = mig_flags_from_indexes(mig_on_indexes($row['old_flags']));
        $p = $by_pattern[$flags] ?? array('flags' => $flags, 'not_loaded_yet' => 0, 'changed_by_team' => 0, 'ok' => 0,
                                          'mismatch' => 0, 'expected' => null, 'mismatches' => array());
        if (!isset($expected_of[$flags])) $expected_of[$flags] = deck_from_cardset_flags($flags, $catalog);
        $exp = $expected_of[$flags];
        $p['expected'] = isset($exp['mixed'])
            ? 'custom set: ' . implode(' ', array_column($exp['mixed'], 'value')) . ' | controls ' . $exp['deck_controls']
            : "{$exp['deck_id']} " . ($exp['deck_cards'] ?? '(all)') . " | controls {$exp['deck_controls']}";

        if ($row['deck_id'] === null) $state = 'not_loaded_yet';
        else if ((int)$row['deck_rev'] > 0 || mig_on_indexes($row['cardset_flags']) !== mig_on_indexes($row['old_flags']))
            $state = 'changed_by_team';
        else {
            $actual = null;
            if (isset($exp['mixed'])) {
                $set_id = custom_set_id_of($row['deck_id']);
                $sets = $set_id !== null ? load_custom_sets($link, (string)$row['id'], $catalog) : array();
                $got = $set_id !== null && isset($sets[$set_id]) ? array_map(fn($c) => [$c['symbol'], $c['value']], $sets[$set_id]['cards']) : null;
                $want = array_map(fn($e) => [$e['symbol'] ?? null, (string)($e['value'] ?? '')], $exp['mixed']);
                $ok = $got === $want && (string)$row['deck_controls'] === (string)$exp['deck_controls'];
                if (!$ok) $actual = $set_id === null ? "deck {$row['deck_id']} (no custom set)"
                    : ($got === null ? 'custom set missing or deleted'
                       : 'custom set: ' . implode(' ', array_column($got, 1)) . " | controls {$row['deck_controls']}");
            } else {
                $ok = $row['deck_id'] === $exp['deck_id'] && $row['deck_cards'] === $exp['deck_cards']
                   && (string)$row['deck_controls'] === (string)$exp['deck_controls'];
                if (!$ok) $actual = "{$row['deck_id']} " . ($row['deck_cards'] ?? '(all)') . " | controls {$row['deck_controls']}";
            }
            $state = $ok ? 'ok' : 'mismatch';
            if (!$ok && count($p['mismatches']) < 5) $p['mismatches'][] = $actual;
        }
        $p[$state]++;
        $summary[$state]++;
        $by_pattern[$flags] = $p;
    }
    uasort($by_pattern, fn($a, $b) => [$b['mismatch'], $b['ok']] <=> [$a['mismatch'], $a['ok']]);
    foreach ($by_pattern as &$p) {
        $p['old_cards'] = array_map(fn($i) => v1_label($v1_cards, $i), mig_on_indexes($p['flags']));
        $p['mismatches'] = array_values(array_unique($p['mismatches']));
    }
    unset($p);
    return array('generated' => date('Y-m-d H:i'), 'database' => mig_database($link), 'summary' => $summary,
                 'patterns' => array_values($by_pattern));
}

function print_verify(array $r): void
{
    $s = $r['summary'];
    echo "R3 deck migration check against " . MIG_BACKUP_TABLE . " (read only), database {$r['database']}, {$r['generated']}\n\n";
    foreach ($s as $k => $n) printf("%-26s %8d\n", $k, $n);
    echo "\n";
    foreach ($r['patterns'] as $p) {
        if ($p['mismatch'] === 0 && $p['ok'] === 0) continue;
        printf("%-8s ok %5d  mismatch %5d  changed %5d  pending %5d  %s\n", $p['mismatch'] > 0 ? 'MISMATCH' : 'OK',
               $p['ok'], $p['mismatch'], $p['changed_by_team'], $p['not_loaded_yet'], implode(' ', $p['old_cards']) ?: '-');
        if ($p['mismatch'] > 0) {
            echo "         expected: {$p['expected']}\n";
            foreach ($p['mismatches'] as $m) echo "         actual:   $m\n";
        }
    }
    if ($s['mismatch'] > 0) echo "\n*** {$s['mismatch']} team(s) differ from the expected migration ***\n";
}
