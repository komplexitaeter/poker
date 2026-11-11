<?php
/*
 * B-52 S1: topics as a list of items per team (pok_topic_items_tbl, db_schema_pok_inc.sql).
 * - The topmost open item (status 'open', lowest position) is the active one. pok_teams_tbl.topic always holds its
 *   text (item_topic_text(), sync_team_topic()), so the round snapshot (pok_roundstats_tbl.topic), stats.php and
 *   Grafana work as before. No open item: topic ''.
 * - Every write locks the team row first (lock_team_topics(), same lock order as newround.php: team row, then the
 *   rest), so parallel writes of one team run one after the other.
 * - A revealed round that ends (start_new_round()) is stored at the active item: distribution (cards per key, no
 *   person data), rounds_cnt + 1, a chosen result is reset (record_round_on_active_item()).
 * - Result rule (Andreas, 2026-11-11): the purpose of the deck (deck_aim(), the ONE place) is 'agree' or 'perspectives'
 *   (catalog "range": false). 'agree': the automatic result is the played card with the highest numeric_value; control
 *   cards and cards without a value (e.g. infinity) are ignored; none with a value -> no automatic result. The team may
 *   choose a card instead (result_auto 0), also one without a value. 'perspectives': only the distribution.
 */

const TOPIC_ITEMS_OPEN_MAX = 100;    // open items per team (add, reopen)
const TOPIC_ITEMS_TOTAL_MAX = 1000;  // all items per team incl. done ones (add)
const TOPIC_ITEMS_DONE_DELIVERED = 50; // done items in dao.php, newest first
const TOPIC_EXT_ID_MAX = 20;
const TOPIC_HEADING_MAX = 200;
const TOPIC_DESCRIPTION_MAX = 2000;  // like pok_teams_tbl.topic
const TOPIC_TEXT_MAX = 2000;         // pok_teams_tbl.topic
const TOPIC_MATURITY_MAX = 3;        // 0 new, 1 rough, 2 shaping, 3 ready

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
 * Free text from the POST body (form encoded, like update_topic.php: a description is too long for the URL),
 * trimmed and cut like get_text_param(). null if the field is missing (edit: leave it unchanged).
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

/*
 * Starts a transaction and locks the team row. Unknown team: 403 (like require_team()). Returns the topic of the team.
 */
function lock_team_topics($link, string $t): string
{
    $link->begin_transaction();
    $sql = $link->prepare("select topic from pok_teams_tbl where id = ? for update");
    $sql->bind_param('s', $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    if (!is_array($row)) {
        $link->rollback();
        http_response_code(403);
        exit;
    }
    return (string)$row['topic'];
}

/* text for pok_teams_tbl.topic: heading, and the description on the next lines */
function item_topic_text(string $heading, ?string $description): string
{
    $text = ($description === null || $description === '') ? $heading : $heading . "\n" . $description;
    return cut_text($text, TOPIC_TEXT_MAX);
}

/*
 * Splits a topic text (update_topic.php, the old topic) into heading and description: the first line is the
 * heading, the following lines the description, so item_topic_text() gives the text back unchanged. A first line
 * longer than TOPIC_HEADING_MAX is cut ('…') and the description keeps the whole text (nothing is lost).
 * $text is trimmed and not empty.
 */
function split_topic_text(string $text): array
{
    $text = cut_text($text, TOPIC_TEXT_MAX);
    $parts = preg_split('/\r?\n/', $text, 2);
    $first = trim((string)$parts[0]);
    $rest = isset($parts[1]) ? trim($parts[1], "\r\n") : '';
    if ($first === '') $first = '…'; // cannot happen for a trimmed text, but heading is required
    if (preg_match('/^.{' . (TOPIC_HEADING_MAX + 1) . '}/us', $first)) {
        return array('heading' => cut_text($first, TOPIC_HEADING_MAX - 1) . '…',
                     'description' => cut_text($text, TOPIC_DESCRIPTION_MAX));
    }
    return array('heading' => $first, 'description' => $rest === '' ? null : cut_text($rest, TOPIC_DESCRIPTION_MAX));
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
    $sql = $link->prepare("update pok_topic_items_tbl set position = ? where id = ? and team_id = ?");
    foreach (array_values($ids) as $i => $id) {
        $position = $i + 1;
        if (($positions[$id] ?? -1) === $position) continue;
        $sql->bind_param('iis', $position, $id, $t);
        $sql->execute();
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

/* pok_teams_tbl.topic := text of the active item ('' without one). The caller holds the team row lock. */
function sync_team_topic($link, string $t): void
{
    $sql = $link->prepare("select heading, description from pok_topic_items_tbl
                            where team_id = ? and status = 'open' order by position, id limit 1");
    $sql->bind_param('s', $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    $topic = is_array($row) ? item_topic_text($row['heading'], $row['description']) : '';
    $sql = $link->prepare("update pok_teams_tbl set topic = ? where id = ?");
    $sql->bind_param('ss', $topic, $t);
    $sql->execute();
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
function insert_topic_item($link, string $t, ?string $ext_id, string $heading, ?string $description, int $maturity,
                           int $index): int
{
    $sql = $link->prepare("insert into pok_topic_items_tbl(team_id, position, ext_id, heading, description, maturity)
                           values(?, 0, ?, ?, ?, ?)");
    $sql->bind_param('ssssi', $t, $ext_id, $heading, $description, $maturity);
    $sql->execute();
    $id = (int)$link->insert_id;
    place_open_item($link, $t, $id, $index);
    return $id;
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
 * only from the set property: catalog group "range": false (traffic lights, emotions). Custom sets and sets with
 * cards without values are 'agree' (cards without a value are just ignored by the automatic result). Never by set name
 * or id. dao.php delivers it as deck.aim, so the board uses the same rule. A later override by the team (per set,
 * item or round) goes here. $deck as returned by resolve_deck(); null (no card catalog) counts as 'agree'.
 */
function deck_aim(?array $deck, array $catalog, array $custom_sets = array()): string
{
    if ($deck === null || ($deck['id'] ?? null) === null || isset($deck['set_id'])) return 'agree';
    foreach ($catalog['groups'] as $group)
        if ($group['id'] === ($deck['group'] ?? null) && ($group['range'] ?? true) === false) return 'perspectives';
    return 'agree';
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
 * active item before the cards go up: distribution, rounds_cnt + 1, a chosen result is reset (the next round proposes
 * again). Caller holds the team row lock. Nothing without an active item or without a revealed round.
 */
function record_round_on_active_item($link, string $t): void
{
    $distribution = revealed_distribution($link, $t);
    if ($distribution === null) return;
    $active = active_item_id($link, $t);
    if ($active === null) return;
    $json = json_encode($distribution);
    $sql = $link->prepare("update pok_topic_items_tbl
                              set distribution = ?, rounds_cnt = least(rounds_cnt + 1, 65535)
                                 ,result_card_key = null, result_auto = 1
                            where id = ? and team_id = ?");
    $sql->bind_param('sis', $json, $active, $t);
    $sql->execute();
}

/*
 * Lazy migration (getDao()): the old topic of a team (pok_teams_tbl.topic) without an open item becomes the first
 * open item (split_topic_text(): first line = heading, the rest = description). In its own transaction under the
 * team row lock, so parallel loads create one item only. The topic text itself stays as it is. Does not notify.
 */
function migrate_topic_to_item($link, string $t): void
{
    $topic = lock_team_topics_or_null($link, $t);
    if ($topic !== null && trim($topic) !== '' && active_item_id($link, $t) === null) {
        $split = split_topic_text(trim($topic));
        insert_topic_item($link, $t, null, $split['heading'], $split['description'], 0, 0);
    }
    $link->commit();
}

/* like lock_team_topics(), but null for an unknown team instead of the 403 exit (getDao()) */
function lock_team_topics_or_null($link, string $t): ?string
{
    $link->begin_transaction();
    $sql = $link->prepare("select topic from pok_teams_tbl where id = ? for update");
    $sql->bind_param('s', $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    return is_array($row) ? (string)$row['topic'] : null;
}

/*
 * topic_items of dao.php: {active_id, open: [...in order], done: [...newest first, at most TOPIC_ITEMS_DONE_DELIVERED],
 * done_count, limits}. The active item carries the cards of the running round as distribution while it is revealed
 * ($live_distribution), else those of its last revealed round. $aim = deck_aim() of the team's deck. Open items: result_card_key = the chosen card
 * (result_auto 0) or the automatic proposal (result_auto 1, null = no single value). Done items: the stored result.
 * Lazy migration of the old topic first (migrate_topic_to_item()).
 */
function topic_items_for_dao($link, string $t, ?string $topic, ?array $live_distribution, array $catalog,
                             string $aim): array
{
    $sql = $link->prepare("select id, ext_id, heading, description, maturity, status, result_card_key, result_auto
                                , distribution, rounds_cnt, done_date
                             from pok_topic_items_tbl
                            where team_id = ? and status = 'open'
                            order by position, id");
    $sql->bind_param('s', $t);
    $sql->execute();
    $open = $sql->get_result()->fetch_all(MYSQLI_ASSOC);

    if (count($open) === 0 && $topic !== null && trim($topic) !== '') {
        /* A lock wait timeout or deadlock must not break the board: roll back, the next load migrates */
        try {
            migrate_topic_to_item($link, $t);
        } catch (mysqli_sql_exception $e) {
            $link->rollback();
            error_log('poker dao: topic migration of a team skipped, retried on the next load: ' . $e->getMessage());
        }
        $sql->execute();
        $open = $sql->get_result()->fetch_all(MYSQLI_ASSOC);
    }

    $sql = $link->prepare("select id, ext_id, heading, description, maturity, status, result_card_key, result_auto
                                , distribution, rounds_cnt, done_date
                             from pok_topic_items_tbl
                            where team_id = ? and status = 'done'
                            order by done_date desc, id desc
                            limit " . TOPIC_ITEMS_DONE_DELIVERED);
    $sql->bind_param('s', $t);
    $sql->execute();
    $done = $sql->get_result()->fetch_all(MYSQLI_ASSOC);

    $done_count = count($done);
    if ($done_count === TOPIC_ITEMS_DONE_DELIVERED) {
        $sql = $link->prepare("select count(1) cnt from pok_topic_items_tbl where team_id = ? and status = 'done'");
        $sql->bind_param('s', $t);
        $sql->execute();
        $done_count = (int)$sql->get_result()->fetch_assoc()['cnt'];
    }

    $active_id = count($open) > 0 ? (int)$open[0]['id'] : null;
    $distributions = array();
    foreach ($open as $i => $row)
        $distributions['o' . $i] = ($i === 0 && $live_distribution !== null) ? $live_distribution : decode_distribution($row['distribution']);
    $keys = array();
    foreach ($distributions as $distribution) foreach (array_keys((array)$distribution) as $key) $keys[(string)$key] = true;
    $infos = count($keys) > 0 ? card_result_infos($link, $t, array_keys($keys), $catalog) : array();

    $out_open = array();
    foreach ($open as $i => $row) {
        $distribution = $distributions['o' . $i];
        $chosen = (int)$row['result_auto'] === 0 && $row['result_card_key'] !== null;
        $row['result_card_key'] = $chosen ? $row['result_card_key'] : auto_result_key($distribution, $infos, $aim);
        $row['result_auto'] = $chosen ? 0 : 1;
        $out_open[] = topic_item_out($row, $distribution);
    }
    $out_done = array();
    foreach ($done as $row) $out_done[] = topic_item_out($row, decode_distribution($row['distribution']));

    return array(
        'active_id' => $active_id,
        'open' => $out_open,
        'done' => $out_done,
        'done_count' => $done_count,
        'limits' => array('open' => TOPIC_ITEMS_OPEN_MAX, 'ext_id' => TOPIC_EXT_ID_MAX,
                          'heading' => TOPIC_HEADING_MAX, 'description' => TOPIC_DESCRIPTION_MAX),
    );
}

/* an item as delivered by dao.php (see script/types.ts TopicItem) */
function topic_item_out(array $row, ?array $distribution): array
{
    return array(
        'id' => (int)$row['id'],
        'ext_id' => $row['ext_id'],
        'heading' => $row['heading'],
        'description' => $row['description'],
        'maturity' => (int)$row['maturity'],
        'status' => $row['status'],
        'result_card_key' => $row['result_card_key'],
        'result_auto' => (int)$row['result_auto'],
        'distribution' => $distribution === null ? null : (object)array_map('intval', $distribution),
        'rounds_cnt' => (int)$row['rounds_cnt'],
        'done_date' => $row['done_date'],
    );
}
