<?php
/*
 * B-52: topics as a list of items per team (pok_topic_items_tbl, db_schema_pok_inc.sql).
 * - The topmost open item (status 'open', lowest position) is the active one. "Next item" finishes it and the next
 *   open one becomes active; the last one is finished the same way ("Finish item"), then there is no active item.
 * - S1b (Andreas, 2026-11-12): pok_teams_tbl.topic is the team's note again (update_topic.php as before S1), independent
 *   of the items; the round snapshot (pok_roundstats_tbl.topic) keeps the note, topic_item_id the active item.
 * - topics_rev (pok_teams_tbl): EVERY write to pok_topic_items_tbl goes through topic_items_write(), which raises it in
 *   the same transaction. No other code writes the table (checked by tests/e2e/specs/topic-items.spec.ts). The board
 *   loads the lists (api/get_topics.php) only when topics_rev in dao.php changed.
 * - Every write locks the team row first (lock_team_topics(), same lock order as newround.php: team row, then the
 *   rest), so parallel writes of one team run one after the other.
 * - A revealed round that ends (start_new_round()) is stored at the active item: distribution (cards per key, no
 *   person data), rounds_cnt + 1, last_round_date, a chosen result is reset (record_round_on_active_item()).
 * - Result rule (Andreas, 2026-11-11): the purpose of the deck (deck_aim(), the ONE place) is 'agree' or 'perspectives'
 *   (catalog "range": false, custom sets: their aim). 'agree': the automatic result is the played card with the highest
 *   numeric_value; control cards and cards without a value (e.g. infinity) are ignored; none with a value -> no automatic
 *   result. The team may choose a card instead (result_auto 0), also one without a value. 'perspectives': only the
 *   distribution.
 */

const TOPIC_ITEMS_OPEN_MAX = 100;    // open items per team (add, reopen)
const TOPIC_ITEMS_TOTAL_MAX = 1000;  // all items per team incl. done ones (add)
const TOPIC_DONE_PAGE = 50;          // done items per get_topics.php answer (default of done_limit)
const TOPIC_DONE_PAGE_MAX = 100;     // highest done_limit
const TOPIC_EXT_ID_MAX = 20;
const TOPIC_HEADING_MAX = 200;
const TOPIC_DESCRIPTION_MAX = 2000;  // like pok_teams_tbl.topic
const TOPIC_DISTRIBUTION_MAX_BYTES = 1000; // pok_topic_items_tbl.distribution varchar(1000) ascii
const TOPIC_MATURITY_MAX = 3;        // 0 new, 1 rough, 2 shaping, 3 ready; optional (null = not set, Andreas 2026-11-11)
const DECK_AIMS = array('agree', 'perspectives');

/* writes an error answer of the topic item endpoints and ends the request (rolls back an open transaction) */
function topic_fail($link, int $status, string $error, array $extra = array()): never
{
    if ($link !== null) {
        try { $link->rollback(); } catch (\Throwable $e) { /* no transaction */ }
    }
    http_response_code($status);
    set_header('json');
    echo json_encode(array_merge(array('error' => $error), $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

/* writes the success answer of a topic item endpoint (after the commit) */
function topic_ok(array $data): void
{
    set_header('json');
    echo json_encode(array_merge(array('ok' => true), $data), JSON_UNESCAPED_UNICODE);
}

/*
 * Free text from the POST body (form encoded: a description is too long for the URL), trimmed and cut like
 * get_text_param(). null if the field is missing (edit: leave it unchanged).
 */
function get_post_text_param(string $name, int $max_length): ?string
{
    $value = filter_input(INPUT_POST, $name);
    if (!is_string($value)) return null;
    return cut_text(trim($value), $max_length);
}

/* an item id from the URL (?item=<id>), 0 if missing or malformed */
function get_item_param(string $name = 'item'): int
{
    $value = get_id_param($name, 10);
    return ctype_digit($value) && (int)$value > 0 ? (int)$value : 0;
}

/* where a new or reopened item goes: 'next' = right after the active item, otherwise at the end */
function get_at_param(): string
{
    return get_id_param('at', 8) === 'next' ? 'next' : 'end';
}

/* Starts a transaction and locks the team row. Unknown team: 403 (like require_team()). */
function lock_team_topics($link, string $t): void
{
    $link->begin_transaction();
    $sql = $link->prepare("select id from pok_teams_tbl where id = ? for update");
    $sql->bind_param('s', $t);
    $sql->execute();
    if (!is_array($sql->get_result()->fetch_assoc())) {
        $link->rollback();
        http_response_code(403);
        exit;
    }
}

/*
 * THE only write path of pok_topic_items_tbl (S1b): runs an insert/update/delete on the table and, if it changed a
 * row, raises pok_teams_tbl.topics_rev of the team in the same transaction (bump_topics_rev()). Returns the statement
 * (affected_rows, insert_id). Every statement must be limited to the team ($t). Any other statement is refused, so
 * nothing can slip past the counter by accident.
 */
function topic_items_write($link, string $t, string $statement, string $types, mixed ...$params): mysqli_stmt
{
    if (!preg_match('/^\s*(insert\s+into|update|delete\s+from)\s+pok_topic_items_tbl\b/i', $statement))
        throw new LogicException('topic_items_write() writes pok_topic_items_tbl only');
    $sql = $link->prepare($statement);
    $sql->bind_param($types, ...$params);
    $sql->execute();
    if ($sql->affected_rows > 0) bump_topics_rev($link, $t);
    return $sql;
}

/* topics_rev + 1 (the caller holds the team row lock or gets it here); only called by topic_items_write() */
function bump_topics_rev($link, string $t): void
{
    $sql = $link->prepare("update pok_teams_tbl set topics_rev = topics_rev + 1 where id = ?");
    $sql->bind_param('s', $t);
    $sql->execute();
}

/* ids of the open items of a team in their order => position */
function open_item_positions($link, string $t): array
{
    $sql = $link->prepare("select id, position from pok_topic_items_tbl
                            where team_id = ? and status = 'open' order by position, id");
    $sql->bind_param('s', $t);
    $sql->execute();
    $result = $sql->get_result();
    $items = array();
    while ($row = $result->fetch_assoc()) $items[(int)$row['id']] = (int)$row['position'];
    return $items;
}

/* stores the order of the open items: position 1..n in the order of $ids (only rows whose position changes) */
function store_open_order($link, string $t, array $ids, array $positions): void
{
    foreach (array_values($ids) as $i => $id) {
        $position = $i + 1;
        if (($positions[$id] ?? -1) === $position) continue;
        topic_items_write($link, $t, "update pok_topic_items_tbl set position = ? where id = ? and team_id = ?",
                          'iis', $position, $id, $t);
    }
}

/* puts item $id into the open order at index $index (0 = active), keeps the others in their order */
function place_open_item($link, string $t, int $id, int $index): void
{
    $positions = open_item_positions($link, $t);
    $ids = array_values(array_filter(array_keys($positions), fn($other) => $other !== $id));
    $index = max(0, min($index, count($ids)));
    array_splice($ids, $index, 0, array($id));
    store_open_order($link, $t, $ids, $positions);
}

/* index for 'next' (right after the active item) or 'end' among the open items (without the item itself) */
function open_index_for(string $at, int $open_count): int
{
    return $at === 'next' ? min(1, $open_count) : $open_count;
}

/* id of the active item (topmost open one), null if there is none */
function active_item_id($link, string $t): ?int
{
    $sql = $link->prepare("select id from pok_topic_items_tbl
                            where team_id = ? and status = 'open' order by position, id limit 1");
    $sql->bind_param('s', $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    return is_array($row) ? (int)$row['id'] : null;
}

/* number of open and of all items of a team */
function topic_item_counts($link, string $t): array
{
    $sql = $link->prepare("select count(1) total, coalesce(sum(status = 'open'), 0) open_cnt
                             from pok_topic_items_tbl where team_id = ?");
    $sql->bind_param('s', $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    return array('open' => (int)$row['open_cnt'], 'total' => (int)$row['total']);
}

/* an item of the team (assoc row) or null */
function load_topic_item($link, string $t, int $id): ?array
{
    $sql = $link->prepare("select * from pok_topic_items_tbl where id = ? and team_id = ?");
    $sql->bind_param('is', $id, $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    return is_array($row) ? $row : null;
}

/* inserts an open item at index $index of the open order; returns its id. The caller checks the limits. */
function insert_topic_item($link, string $t, ?string $ext_id, string $heading, ?string $description, ?int $maturity,
                           int $index): int
{
    $sql = topic_items_write($link, $t, "insert into pok_topic_items_tbl(team_id, position, ext_id, heading, description, maturity)
                                         values(?, 0, ?, ?, ?, ?)",
                             'ssssi', $t, $ext_id, $heading, $description, $maturity);
    $id = (int)$sql->insert_id;
    place_open_item($link, $t, $id, $index);
    return $id;
}

/* changes heading, description, ext_id and maturity of an item (open or done) */
function update_topic_item($link, string $t, int $id, string $heading, ?string $description, ?string $ext_id,
                           ?int $maturity): void
{
    topic_items_write($link, $t, "update pok_topic_items_tbl set heading = ?, description = ?, ext_id = ?, maturity = ?
                                   where id = ? and team_id = ?",
                      'sssiis', $heading, $description, $ext_id, $maturity, $id, $t);
}

/* sets the optional maturity of an item */
function set_topic_item_maturity($link, string $t, int $id, ?int $maturity): void
{
    topic_items_write($link, $t, "update pok_topic_items_tbl set maturity = ? where id = ? and team_id = ?",
                      'iis', $maturity, $id, $t);
}

/* deletes an item for good; false if the team has no such item */
function delete_topic_item($link, string $t, int $id): bool
{
    return topic_items_write($link, $t, "delete from pok_topic_items_tbl where id = ? and team_id = ?",
                             'is', $id, $t)->affected_rows > 0;
}

/* stores the result of an item: a chosen card (auto 0) or the automatic one (auto 1, null = no single value) */
function set_topic_item_result($link, string $t, int $id, ?string $card_key, int $auto): void
{
    topic_items_write($link, $t, "update pok_topic_items_tbl set result_card_key = ?, result_auto = ? where id = ? and team_id = ?",
                      'siis', $card_key, $auto, $id, $t);
}

/* "Next item" / "Finish item": the item is done with its final result (done_date = now, out of the open order) */
function finish_topic_item($link, string $t, int $id, ?string $card_key, int $auto): void
{
    topic_items_write($link, $t, "update pok_topic_items_tbl
                                     set status = 'done', done_date = current_timestamp, position = 0
                                        ,result_card_key = ?, result_auto = ?
                                   where id = ? and team_id = ?",
                      'siis', $card_key, $auto, $id, $t);
}

/* a done item is open again (at index $index of the open order); an automatic result is computed again */
function reopen_topic_item($link, string $t, int $id, int $index): void
{
    topic_items_write($link, $t, "update pok_topic_items_tbl
                                     set status = 'open', done_date = null
                                        ,result_card_key = if(result_auto = 1, null, result_card_key)
                                   where id = ? and team_id = ?",
                      'is', $id, $t);
    place_open_item($link, $t, $id, $index);
}

/*
 * The optional maturity from the URL (?maturity=): false if the parameter is missing (leave unchanged), null for an
 * empty value (not set), 0..TOPIC_MATURITY_MAX, or the string 'invalid'.
 */
function get_maturity_param(): int|null|false|string
{
    if (!filter_has_var(INPUT_GET, 'maturity')) return false;
    $raw = (string)filter_input(INPUT_GET, 'maturity');
    if ($raw === '') return null;
    return preg_match('/^[0-' . TOPIC_MATURITY_MAX . ']$/D', $raw) ? (int)$raw : 'invalid';
}

/* '' -> null for optional text columns */
function null_if_empty(?string $value): ?string
{
    return ($value === null || $value === '') ? null : $value;
}

/*
 * Card data relevant for the result, by card key: numeric (float|null), control (bool). From card_catalog.json and, for custom cards ('c-…'), the team's
 * custom cards (also inactive ones). Unknown keys are left out.
 */
function card_result_infos($link, string $t, array $keys, array $catalog): array
{
    $infos = array();
    foreach ($catalog['groups'] as $group) {
        foreach ($group['cards'] as $card) {
            $infos[$card['card_key']] = array('numeric' => isset($card['numeric_value']) ? (float)$card['numeric_value'] : null,
                                              'control' => false);
        }
    }
    foreach ($catalog['controls'] as $control)
        $infos[$control['card_key']] = array('numeric' => null, 'control' => true);
    $infos[LATE_CARD_KEY] = array('numeric' => null, 'control' => true);

    $custom_keys = array_filter($keys, fn($key) => is_string($key) && str_starts_with($key, CUSTOM_DECK_PREFIX));
    if (count($custom_keys) > 0) {
        foreach (load_custom_cards_by_key($link, $t, $custom_keys, $catalog) as $key => $card)
            $infos[$key] = array('numeric' => $card['numeric_value'], 'control' => false);
    }
    return array_intersect_key($infos, array_flip($keys));
}

/*
 * THE rule for the purpose of a deck (Andreas, 2026-11-11): 'perspectives' = no automatic result, only the
 * distribution side by side; 'agree' = automatic result (highest numeric_value of the played cards) and range. Comes
 * only from the set property: catalog group "range": false (traffic lights, emotions); a custom set has its own aim
 * (pok_custom_sets_tbl.aim, set in the set editor, default 'agree', S1b). Never by set name or id. dao.php delivers it
 * as deck.aim, so the board uses the same rule. A later override by the team (per item or round) goes here.
 * $deck as returned by resolve_deck(), $custom_sets from load_custom_sets(); null (no card catalog) counts as 'agree'.
 */
function deck_aim(?array $deck, array $catalog, array $custom_sets = array()): string
{
    if ($deck === null || ($deck['id'] ?? null) === null) return 'agree';
    if (isset($deck['set_id'])) return ($custom_sets[$deck['set_id']]['aim'] ?? 'agree') === 'perspectives' ? 'perspectives' : 'agree';
    foreach ($catalog['groups'] as $group)
        if ($group['id'] === ($deck['group'] ?? null) && ($group['range'] ?? true) === false) return 'perspectives';
    return 'agree';
}

/* deck_aim() of the team's current deck, read without a lock (get_topics.php) */
function team_deck_aim($link, string $t, array $catalog): string
{
    $sql = $link->prepare("select deck_id, deck_cards, deck_controls, deck_rev from pok_teams_tbl where id = ?");
    $sql->bind_param('s', $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    if (!is_array($row)) return 'agree';
    $custom_sets = load_custom_sets($link, $t, $catalog);
    $deck = resolve_deck($row['deck_id'], $row['deck_cards'], $row['deck_controls'], (int)$row['deck_rev'], $catalog,
                         $custom_sets);
    return deck_aim($deck, $catalog, $custom_sets);
}

/* a card the automatic result may pick: a numeric_value and no control card (cards without a value are ignored) */
function card_has_result_value(?array $info): bool
{
    return $info !== null && !$info['control'] && $info['numeric'] !== null;
}

/* a card the team may choose as result: any known card that is no control card (also one without a value) */
function card_can_be_chosen(?array $info): bool
{
    return $info !== null && !$info['control'];
}

/* the automatic result of a distribution: for an 'agree' deck the played card with the highest numeric_value, null
   for 'perspectives' or if no played card has a value */
function auto_result_key(?array $distribution, array $infos, string $aim): ?string
{
    if ($aim !== 'agree') return null;
    $best = null;
    foreach ((array)$distribution as $key => $count) {
        $info = $infos[$key] ?? null;
        if ((int)$count < 1 || !card_has_result_value($info)) continue;
        if ($best === null || $info['numeric'] > $infos[$best]['numeric']) $best = (string)$key;
    }
    return $best;
}

/* distribution JSON of the DB -> array card_key => count, null for none */
function decode_distribution(?string $json): ?array
{
    if ($json === null || $json === '') return null;
    $value = json_decode($json, true);
    return is_array($value) && count($value) > 0 ? $value : null;
}

/*
 * The cards of the running round as card_key => count if it is revealed (every player has a card down), else null.
 * LATE_CARD_KEY is no vote and left out.
 */
function revealed_distribution($link, string $t): ?array
{
    $sql = $link->prepare("select card_key, count(1) cnt from pok_players_tbl
                            where team_id = ? and player_type = 'PLAYER' group by card_key order by card_key");
    $sql->bind_param('s', $t);
    $sql->execute();
    $result = $sql->get_result();
    $distribution = array();
    $players = 0;
    while ($row = $result->fetch_assoc()) {
        if ($row['card_key'] === null) return null; // not revealed
        $players++;
        if ($row['card_key'] !== LATE_CARD_KEY) $distribution[$row['card_key']] = (int)$row['cnt'];
    }
    return ($players > 0 && count($distribution) > 0) ? $distribution : null;
}

/*
 * start_new_round() (newround.php, "Next item", deck change with cards down): a revealed round is stored at the
 * active item before the cards go up: distribution, rounds_cnt + 1, last_round_date, a chosen result is reset (the
 * next round proposes again). Caller holds the team row lock. Nothing without an active item or a revealed round.
 */
function record_round_on_active_item($link, string $t): void
{
    $distribution = revealed_distribution($link, $t);
    if ($distribution === null) return;
    $active = active_item_id($link, $t);
    if ($active === null) return;
    $json = json_encode($distribution);
    if (!is_string($json) || strlen($json) > TOPIC_DISTRIBUTION_MAX_BYTES) $json = null; // never "Data too long"; rounds still count
    topic_items_write($link, $t, "update pok_topic_items_tbl
                                     set distribution = ?, rounds_cnt = least(rounds_cnt + 1, 65535)
                                        ,last_round_date = current_timestamp
                                        ,result_card_key = null, result_auto = 1
                                   where id = ? and team_id = ?",
                      'sis', $json, $active, $t);
}

/*
 * S1b: the round snapshot (start_new_round(), pok_roundstats_tbl row $roundstat_id) remembers the active item, so
 * rounds can be assigned to items later. null without an active item. Writes pok_roundstats_tbl only.
 */
function link_round_to_active_item($link, string $t, int $roundstat_id): void
{
    $active = active_item_id($link, $t);
    if ($active === null) return;
    $sql = $link->prepare("update pok_roundstats_tbl set topic_item_id = ? where id = ? and team_id = ?");
    $sql->bind_param('iis', $active, $roundstat_id, $t);
    $sql->execute();
}

/* topics_rev of the team (0 for an unknown team) */
function load_topics_rev($link, string $t): int
{
    $sql = $link->prepare("select topics_rev from pok_teams_tbl where id = ?");
    $sql->bind_param('s', $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    return is_array($row) ? (int)$row['topics_rev'] : 0;
}

const TOPIC_ITEM_COLUMNS = "id, ext_id, heading, description, maturity, status, result_card_key, result_auto
                           ,distribution, rounds_cnt, last_round_date, done_date";

/*
 * Open items (rows in their order) as delivered: the first (active) one carries the cards of the running round as
 * distribution while it is revealed ($live_distribution), else those of its last revealed round. result_card_key =
 * the chosen card (result_auto 0) or the automatic proposal (result_auto 1, null = no single value). $aim: deck_aim()
 * of the team's deck, or a callable that returns it (only called if needed).
 */
function open_items_out($link, string $t, array $rows, ?array $live_distribution, array $catalog,
                        string|callable $aim): array
{
    $distributions = array();
    foreach ($rows as $i => $row)
        $distributions[$i] = ($i === 0 && $live_distribution !== null) ? $live_distribution : decode_distribution($row['distribution']);
    $keys = array();
    foreach ($distributions as $distribution) foreach (array_keys((array)$distribution) as $key) $keys[(string)$key] = true;
    $infos = array();
    if (count($keys) > 0) {
        $infos = card_result_infos($link, $t, array_keys($keys), $catalog);
        if (is_callable($aim)) $aim = $aim();
    }
    $out = array();
    foreach ($rows as $i => $row) {
        $chosen = (int)$row['result_auto'] === 0 && $row['result_card_key'] !== null;
        $row['result_card_key'] = $chosen ? $row['result_card_key']
            : (is_string($aim) ? auto_result_key($distributions[$i], $infos, $aim) : null);
        $row['result_auto'] = $chosen ? 0 : 1;
        $out[] = topic_item_out($row, $distributions[$i]);
    }
    return $out;
}

/*
 * topic_items of dao.php (kept small, S1b): {active: the active item or null, open_count, done_count, next_heading
 * (heading of the open item after the active one, null if none), topics_rev}. The lists come from get_topics.php.
 * topics_rev is read FIRST: a write in between gives an older rev with newer data (the board loads the list once
 * more), never a newer rev with older data.
 */
function topic_items_for_dao($link, string $t, ?array $live_distribution, array $catalog, string $aim): array
{
    $rev = load_topics_rev($link, $t);

    $sql = $link->prepare("select " . TOPIC_ITEM_COLUMNS . "
                             from pok_topic_items_tbl
                            where team_id = ? and status = 'open'
                            order by position, id
                            limit 2");
    $sql->bind_param('s', $t);
    $sql->execute();
    $open = $sql->get_result()->fetch_all(MYSQLI_ASSOC);

    $sql = $link->prepare("select coalesce(sum(status = 'open'), 0) open_cnt, coalesce(sum(status = 'done'), 0) done_cnt
                             from pok_topic_items_tbl where team_id = ?");
    $sql->bind_param('s', $t);
    $sql->execute();
    $counts = $sql->get_result()->fetch_assoc();

    $active = count($open) > 0 ? open_items_out($link, $t, array($open[0]), $live_distribution, $catalog, $aim)[0] : null;
    return array(
        'active' => $active,
        'open_count' => (int)$counts['open_cnt'],
        'done_count' => (int)$counts['done_cnt'],
        'next_heading' => isset($open[1]) ? $open[1]['heading'] : null,
        'topics_rev' => $rev,
    );
}

/*
 * get_topics.php: {topics_rev, open: [all open items in order], open_count, done_count, limits, and with $with_done
 * done: [done items, newest first (done_date), $done_limit from $done_offset]}. One consistent snapshot (read only
 * transaction), so topics_rev matches the lists. Open items as in open_items_out() (the active one with the cards of
 * the running round while revealed).
 */
function topic_lists($link, string $t, array $catalog, bool $with_done, int $done_offset, int $done_limit): array
{
    $link->begin_transaction(MYSQLI_TRANS_START_READ_ONLY | MYSQLI_TRANS_START_WITH_CONSISTENT_SNAPSHOT);
    $rev = load_topics_rev($link, $t);

    $sql = $link->prepare("select " . TOPIC_ITEM_COLUMNS . "
                             from pok_topic_items_tbl
                            where team_id = ? and status = 'open'
                            order by position, id");
    $sql->bind_param('s', $t);
    $sql->execute();
    $open_rows = $sql->get_result()->fetch_all(MYSQLI_ASSOC);

    $sql = $link->prepare("select count(1) cnt from pok_topic_items_tbl where team_id = ? and status = 'done'");
    $sql->bind_param('s', $t);
    $sql->execute();
    $done_count = (int)$sql->get_result()->fetch_assoc()['cnt'];

    $done_rows = array();
    if ($with_done && $done_count > $done_offset) {
        $sql = $link->prepare("select " . TOPIC_ITEM_COLUMNS . "
                                 from pok_topic_items_tbl
                                where team_id = ? and status = 'done'
                                order by done_date desc, id desc
                                limit ? offset ?");
        $sql->bind_param('sii', $t, $done_limit, $done_offset);
        $sql->execute();
        $done_rows = $sql->get_result()->fetch_all(MYSQLI_ASSOC);
    }

    $live = count($open_rows) > 0 ? revealed_distribution($link, $t) : null;
    $open = open_items_out($link, $t, $open_rows, $live, $catalog, fn() => team_deck_aim($link, $t, $catalog));
    $link->commit();

    $out = array(
        'topics_rev' => $rev,
        'open' => $open,
        'open_count' => count($open),
        'done_count' => $done_count,
        'limits' => array('open' => TOPIC_ITEMS_OPEN_MAX, 'ext_id' => TOPIC_EXT_ID_MAX,
                          'heading' => TOPIC_HEADING_MAX, 'description' => TOPIC_DESCRIPTION_MAX),
    );
    if ($with_done) {
        $out['done'] = array_map(fn($row) => topic_item_out($row, decode_distribution($row['distribution'])), $done_rows);
        $out['done_offset'] = $done_offset;
    }
    return $out;
}

/* an item as delivered by dao.php and get_topics.php (see script/types.ts TopicItem) */
function topic_item_out(array $row, ?array $distribution): array
{
    return array(
        'id' => (int)$row['id'],
        'ext_id' => $row['ext_id'],
        'heading' => $row['heading'],
        'description' => $row['description'],
        'maturity' => $row['maturity'] === null ? null : (int)$row['maturity'],
        'status' => $row['status'],
        'result_card_key' => $row['result_card_key'],
        'result_auto' => (int)$row['result_auto'],
        'distribution' => $distribution === null ? null : (object)array_map('intval', $distribution),
        'rounds_cnt' => (int)$row['rounds_cnt'],
        'last_round_date' => $row['last_round_date'],
        'done_date' => $row['done_date'],
    );
}
