<?php
/*
 * B-98 S4: custom sets of a team (pok_custom_sets_tbl, pok_custom_cards_tbl). Included by lib.php.
 *
 * - A custom set is a deck like a catalog variant: deck_id 'c-<set id>' (pok_teams_tbl.deck_id), group 'custom',
 *   its cards are the active cards of the set in position order (pok_teams_tbl.deck_cards keeps their keys for the
 *   round snapshot). Control cards stay team-wide (deck_controls).
 * - Cards are immutable: a changed card is a new row with a new card_key ('c-' + base36(id)), the old row gets
 *   active = 0. Rows are never deleted, so historic rounds and cards still on the table keep their data.
 *   Only position (the order in the set) is updated in place, it is no card content.
 * - A card has either a symbol of the symbol library (card_catalog.json "custom_symbols") or a text value (at most 6
 *   characters, no emoji), optional heading/description, an optional numeric value (spread, sorting, average) and a
 *   colour of the palette (card_catalog.json "custom_colors"). Cards migrated from an old mixed deck may keep their
 *   catalog symbol/colour; an edited copy of such a card may keep them as well.
 */

const CUSTOM_DECK_PREFIX = 'c-';
const CUSTOM_DECK_GROUP = 'custom';
const CUSTOM_CARDS_MAX = 16;          // cards per set when cards are added (B-98); migrated sets may have more
const CUSTOM_SET_NAME_MAX = 24;
const CUSTOM_VALUE_MAX = 6;
const CUSTOM_HEADING_MAX = 16;
const CUSTOM_DESCRIPTION_MAX = 160;
const CUSTOM_NUMERIC_MAX = 99999999;  // decimal(10,2)
const CUSTOM_MIGRATED_SET_NAME = 'Our deck'; // Andreas 2026-11-02 (sets migrated before keep "Previous deck")
const CUSTOM_BODY_MAX_BYTES = 65536;

/* B-98/B-100: sets per team; _CUSTOM_SETS_MAX in config.php overrides the default of 5 (later maybe a paid feature) */
function custom_sets_max(): int
{
    return defined('_CUSTOM_SETS_MAX') ? max(0, (int)constant('_CUSTOM_SETS_MAX')) : 5;
}

/*
 * pok_teams_tbl.deck_cards / pok_roundstats_tbl.deck_cards of a custom deck: its keys for the round snapshot, null if
 * they do not fit into varchar(200) (only a huge migrated set; resolve_deck() never needs them for a custom deck).
 */
function custom_deck_cards(array $keys): ?string
{
    $value = implode(',', $keys);
    return strlen($value) <= 200 ? $value : null;
}

function custom_deck_id(int $set_id): string
{
    return CUSTOM_DECK_PREFIX . $set_id;
}

/* the set id of a custom deck id 'c-<id>', null for anything else (catalog keys and variant ids never start with 'c-') */
function custom_set_id_of(?string $deck_id): ?int
{
    return is_string($deck_id) && preg_match('/^c-([1-9][0-9]{0,9})$/D', $deck_id, $m) ? (int)$m[1] : null;
}

/* symbol id => display value of the first catalog card with that symbol (e.g. s-3 => '3', s-inf => '∞') */
function catalog_symbol_values(array $catalog): array
{
    $values = array();
    foreach ($catalog['groups'] as $group)
        foreach ($group['cards'] as $card)
            if (isset($card['symbol']) && !isset($values[$card['symbol']])) $values[$card['symbol']] = (string)($card['value'] ?? '');
    return $values;
}

/*
 * Numeric value of a card migrated from the catalog (and the editor's default for a symbol, same map):
 * card_catalog.json "custom_symbol_values" by symbol (e.g. stars 0-5, T-shirt 1-7, faces null), otherwise the
 * catalog's numeric_value. As string '1.50' or null.
 */
function custom_symbol_value(array $entry, array $catalog): ?string
{
    $map = isset($catalog['custom_symbol_values']) && is_array($catalog['custom_symbol_values'])
        ? $catalog['custom_symbol_values'] : array();
    $symbol = $entry['symbol'] ?? null;
    $value = is_string($symbol) && array_key_exists($symbol, $map) ? $map[$symbol] : ($entry['numeric_value'] ?? null);
    return is_int($value) || is_float($value) ? sprintf('%.2f', (float)$value) : null;
}

function custom_symbols(array $catalog): array
{
    return isset($catalog['custom_symbols']) && is_array($catalog['custom_symbols']) ? $catalog['custom_symbols'] : array();
}

function custom_colors(array $catalog): array
{
    return isset($catalog['custom_colors']) && is_array($catalog['custom_colors']) ? $catalog['custom_colors'] : array();
}

function custom_styles(array $catalog): array
{
    return isset($catalog['styles']) && is_array($catalog['styles']) ? $catalog['styles'] : array('plain');
}

/*
 * A card row of pok_custom_cards_tbl as delivered by dao.php and the endpoints, in the shape of a card_catalog.json
 * entry (so the board can treat it like a catalog card): card_key, symbol (null for a text card), value (the text, or
 * the catalog value of the symbol), heading, description, numeric_value (number or null), color, sort_order
 * (position in the set), infinite (symbol s-inf), set_id, active.
 */
function custom_card_out(array $row, array $symbol_values): array
{
    $symbol = $row['symbol_id'];
    $card = array(
        'card_key' => $row['card_key'],
        'symbol' => $symbol,
        'value' => $symbol !== null ? ($symbol_values[$symbol] ?? '') : (string)$row['value_text'],
        'heading' => $row['heading'],
        'description' => $row['description'],
        'numeric_value' => $row['numeric_value'] === null ? null : (float)$row['numeric_value'],
        'color' => $row['color'],
        'sort_order' => (int)$row['position'],
        'set_id' => (int)$row['set_id'],
        'active' => (int)$row['active'] === 1,
    );
    if ($symbol === 's-inf') $card['infinite'] = true;
    return $card;
}

/*
 * The custom sets of a team that are not deleted, by set id, in their order (sort_order, id). Each:
 * {set_id, deck_id, name, style, rev, cards: [active cards in position order, see custom_card_out()]}.
 * $for_update locks the set rows (callers hold the team row lock first).
 */
function load_custom_sets($link, string $t, array $catalog, bool $for_update = false): array
{
    $sql = $link->prepare("select s.id, s.name, s.style, s.rev
                             from pok_custom_sets_tbl s
                            where s.team_id = ? and s.deleted = 0
                            order by s.sort_order, s.id" . ($for_update ? " for update" : ""));
    $sql->bind_param('s', $t);
    $sql->execute();
    $result = $sql->get_result();
    $sets = array();
    while ($row = $result->fetch_assoc()) {
        $sets[(int)$row['id']] = array('set_id' => (int)$row['id'], 'deck_id' => custom_deck_id((int)$row['id']),
            'name' => $row['name'], 'style' => $row['style'], 'rev' => (int)$row['rev'], 'cards' => array());
    }
    if (count($sets) === 0) return $sets;

    $sql = $link->prepare("select c.id, c.set_id, c.card_key, c.position, c.symbol_id, c.value_text, c.heading,
                                  c.description, c.numeric_value, c.color, c.active
                             from pok_custom_cards_tbl c
                             join pok_custom_sets_tbl s on s.id = c.set_id
                            where s.team_id = ? and s.deleted = 0 and c.active = 1 and c.card_key is not null
                            order by c.set_id, c.position, c.id");
    $sql->bind_param('s', $t);
    $sql->execute();
    $result = $sql->get_result();
    $symbol_values = catalog_symbol_values($catalog);
    while ($row = $result->fetch_assoc()) {
        if (isset($sets[(int)$row['set_id']])) $sets[(int)$row['set_id']]['cards'][] = custom_card_out($row, $symbol_values);
    }
    return $sets;
}

/*
 * Custom cards of the team by key, also inactive ones and cards of deleted sets (cards still on the table after a
 * save or delete). Only keys of sets of this team.
 */
function load_custom_cards_by_key($link, string $t, array $keys, array $catalog): array
{
    $keys = array_values(array_unique(array_filter($keys, fn($key) => is_string($key)
        && str_starts_with($key, CUSTOM_DECK_PREFIX))));
    if (count($keys) === 0) return array();
    $marks = implode(',', array_fill(0, count($keys), '?'));
    $sql = $link->prepare("select c.id, c.set_id, c.card_key, c.position, c.symbol_id, c.value_text, c.heading,
                                  c.description, c.numeric_value, c.color, c.active
                             from pok_custom_cards_tbl c
                             join pok_custom_sets_tbl s on s.id = c.set_id
                            where s.team_id = ? and c.card_key in ($marks)");
    $params = array_merge(array($t), $keys);
    $sql->bind_param(str_repeat('s', count($params)), ...$params);
    $sql->execute();
    $result = $sql->get_result();
    $symbol_values = catalog_symbol_values($catalog);
    $cards = array();
    while ($row = $result->fetch_assoc()) $cards[$row['card_key']] = custom_card_out($row, $symbol_values);
    return $cards;
}

/*
 * Reads the JSON body of a request (custom set endpoints: the card list is too long for the URL). null if it is
 * missing, too large or not a JSON object.
 */
function read_json_body(): ?array
{
    $raw = file_get_contents('php://input', false, null, 0, CUSTOM_BODY_MAX_BYTES + 1);
    if (!is_string($raw) || $raw === '' || strlen($raw) > CUSTOM_BODY_MAX_BYTES) return null;
    $data = json_decode($raw, true);
    return is_array($data) && !array_is_list($data) ? $data : null;
}

/*
 * Free text from the JSON body, like get_text_param(): trimmed, otherwise stored as entered (escaped on output).
 * Returns null if the value is no string (or missing and not $optional), longer than $max_length characters or
 * contains control or format characters (\p{Cc}, \p{Cf}: bidi overrides, zero-width characters); '' for a missing optional value.
 */
function body_text(array $data, string $name, int $max_length, bool $optional = true): ?string
{
    if (!array_key_exists($name, $data) || $data[$name] === null) return $optional ? '' : null;
    if (!is_string($data[$name])) return null;
    $value = trim($data[$name]);
    if (cut_text($value, $max_length) !== $value) return null; // too long or invalid UTF-8
    // control and format characters (bidi overrides, zero-width characters) could spoof names on the board
    if (preg_match('/[\p{Cc}\p{Cf}]/u', $value)) return null;
    return $value;
}

/* a text value of a card: 1 to 6 characters, no emoji (pictographs, flags, keycaps, variation selectors, ZWJ) */
function is_custom_value_text(string $value): bool
{
    return $value !== '' && cut_text($value, CUSTOM_VALUE_MAX) === $value
        && !preg_match('/[\p{Extended_Pictographic}\x{1F1E6}-\x{1F1FF}\x{FE00}-\x{FE0F}\x{20E3}\p{Cc}\p{Cf}\p{Co}\p{Cs}]/u', $value);
}

/*
 * Validates the card list of a create/save request. $known: cards of this set by key (active and inactive rows) -
 * a card that refers to one of them may keep its symbol and colour even if they are not in the custom whitelists
 * (cards migrated from an old deck). Returns array('cards' => [normalized cards]) or array('error' => code,
 * 'index' => position of the card).
 * A normalized card: key (given key or null), symbol, text, heading, description, numeric (string '1.50' or null), color.
 */
function validate_custom_cards($input, array $known, array $catalog): array
{
    if (!is_array($input) || !array_is_list($input)) return array('error' => 'cards');
    if (count($input) === 0) return array('error' => 'no_cards');

    $symbols = array_flip(custom_symbols($catalog));
    $colors = array_flip(custom_colors($catalog));
    $cards = array();
    $seen = array();
    foreach ($input as $i => $card) {
        $error = function (string $code) use ($i) { return array('error' => $code, 'index' => $i); };
        if (!is_array($card) || array_is_list($card) && count($card) > 0) return $error('card');

        $key = $card['key'] ?? null;
        if ($key !== null && (!is_string($key) || !preg_match('/^c-[a-z0-9]{1,5}$/D', $key))) return $error('key');
        if ($key !== null && isset($seen[$key])) return $error('duplicate_key');
        if ($key !== null) $seen[$key] = true;
        $ref = $key !== null ? ($known[$key] ?? null) : null;

        $symbol = $card['symbol'] ?? null;
        $symbol = $symbol === '' ? null : $symbol;
        $text = $card['text'] ?? null;
        $text = is_string($text) ? trim($text) : $text;
        $text = $text === '' ? null : $text;
        if (($symbol === null) === ($text === null)) return $error('symbol_or_text');
        if ($symbol !== null && (!is_string($symbol)
                || !isset($symbols[$symbol]) && ($ref === null || $ref['symbol'] !== $symbol))) return $error('symbol');
        if ($text !== null && (!is_string($text) || !is_custom_value_text($text))) return $error('text');

        $heading = body_text($card, 'heading', CUSTOM_HEADING_MAX);
        if ($heading === null) return $error('heading');
        $description = body_text($card, 'description', CUSTOM_DESCRIPTION_MAX);
        if ($description === null) return $error('description');

        $numeric = $card['numeric_value'] ?? null;
        if ($numeric === '') $numeric = null;
        if ($numeric !== null) {
            if (is_string($numeric)) $numeric = trim($numeric);
            if (!(is_int($numeric) || is_float($numeric) || is_string($numeric) && is_numeric($numeric))
                || !is_finite((float)$numeric) || abs((float)$numeric) > CUSTOM_NUMERIC_MAX) return $error('numeric_value');
            $numeric = sprintf('%.2f', round((float)$numeric, 2));
        }

        $color = $card['color'] ?? null;
        if (!is_string($color) || !isset($colors[$color]) && ($ref === null || $ref['color'] !== $color)) return $error('color');

        $cards[] = array('key' => $key, 'symbol' => $symbol, 'text' => $text,
            'heading' => $heading === '' ? null : $heading, 'description' => $description === '' ? null : $description,
            'numeric' => $numeric, 'color' => $color);
    }
    return array('cards' => $cards);
}

/* name and style of a create/save request: array('name' =>, 'style' =>) or array('error' => code) */
function validate_custom_set_head(array $data, array $catalog): array
{
    $name = body_text($data, 'name', CUSTOM_SET_NAME_MAX, false);
    if ($name === null || $name === '') return array('error' => 'name');
    $style = $data['style'] ?? 'plain';
    if (!is_string($style) || !in_array($style, custom_styles($catalog), true)) return array('error' => 'style');
    return array('name' => $name, 'style' => $style);
}

/* content of a stored card (row of load_* / custom_card_out) or a normalized request card, comparable */
function custom_card_signature(array $card): string
{
    if (array_key_exists('numeric', $card)) { // normalized request card
        return json_encode(array($card['symbol'], $card['symbol'] === null ? $card['text'] : null, $card['heading'],
            $card['description'], $card['numeric'], $card['color']));
    }
    return json_encode(array($card['symbol'], $card['symbol'] === null ? $card['value'] : null, $card['heading'],
        $card['description'], $card['numeric_value'] === null ? null : sprintf('%.2f', $card['numeric_value']),
        $card['color']));
}

/* all cards of a set (active and inactive) by key, for references in a save request */
function load_set_cards_by_key($link, int $set_id, array $catalog): array
{
    $sql = $link->prepare("select id, set_id, card_key, position, symbol_id, value_text, heading, description,
                                  numeric_value, color, active
                             from pok_custom_cards_tbl where set_id = ? and card_key is not null");
    $sql->bind_param('i', $set_id);
    $sql->execute();
    $result = $sql->get_result();
    $symbol_values = catalog_symbol_values($catalog);
    $cards = array();
    while ($row = $result->fetch_assoc()) $cards[$row['card_key']] = custom_card_out($row, $symbol_values);
    return $cards;
}

/* inserts a card (normalized) into a set and returns its new key 'c-' + base36(id) */
function insert_custom_card($link, int $set_id, int $position, array $card): string
{
    $sql = $link->prepare("insert into pok_custom_cards_tbl(set_id, position, symbol_id, value_text, heading,
                                                            description, numeric_value, color)
                           values(?, ?, ?, ?, ?, ?, ?, ?)");
    $text = $card['symbol'] === null ? $card['text'] : null;
    $sql->bind_param('iissssss', $set_id, $position, $card['symbol'], $text, $card['heading'], $card['description'],
                     $card['numeric'], $card['color']);
    $sql->execute();
    $id = (int)$link->insert_id;
    $key = CUSTOM_DECK_PREFIX . base_convert((string)$id, 10, 36);
    $sql = $link->prepare("update pok_custom_cards_tbl set card_key = ? where id = ?");
    $sql->bind_param('si', $key, $id);
    $sql->execute();
    return $key;
}

/* creates a set with its cards (no limits checked here), returns the set id */
function insert_custom_set($link, string $t, string $name, string $style, array $cards): int
{
    $sql = $link->prepare("insert into pok_custom_sets_tbl(team_id, name, style, sort_order)
                           select ?, ?, ?, least(255, ifnull(max(sort_order), 0) + 1)
                             from pok_custom_sets_tbl where team_id = ?");
    $sql->bind_param('ssss', $t, $name, $style, $t);
    $sql->execute();
    $set_id = (int)$link->insert_id;
    foreach (array_values($cards) as $i => $card) insert_custom_card($link, $set_id, $i, $card);
    return $set_id;
}

/*
 * Stores the card list of a save request: unchanged cards (same key, active in the set, same content) keep their key
 * (only the position is updated), changed and new cards become new rows, active cards missing in the list get
 * active = 0. Returns the keys in the new order and whether anything changed.
 */
function store_custom_cards($link, int $set_id, array $active, array $cards): array
{
    $keys = array();
    $changed = false;
    $kept = array();
    foreach ($cards as $i => $card) {
        $old = $card['key'] !== null ? ($active[$card['key']] ?? null) : null;
        if ($old !== null && custom_card_signature($old) === custom_card_signature($card)) {
            $kept[$card['key']] = true;
            if ($old['sort_order'] !== $i) {
                $sql = $link->prepare("update pok_custom_cards_tbl set position = ? where set_id = ? and card_key = ?");
                $sql->bind_param('iis', $i, $set_id, $card['key']);
                $sql->execute();
                $changed = true;
            }
            $keys[] = $card['key'];
        } else {
            $keys[] = insert_custom_card($link, $set_id, $i, $card);
            $changed = true;
        }
    }
    foreach ($active as $key => $old) {
        if (isset($kept[$key])) continue;
        $sql = $link->prepare("update pok_custom_cards_tbl set active = 0 where set_id = ? and card_key = ?");
        $sql->bind_param('is', $set_id, $key);
        $sql->execute();
        $changed = true;
    }
    return array('keys' => $keys, 'changed' => $changed);
}

/*
 * B-98 S4: the cards of an old mixed deck (deck_from_cardset_flags() 'mixed') as a set of the team, for the lazy
 * migration. The caller holds the lock on the team row. The numeric value of a symbol card comes from
 * custom_symbol_value() (stars 0-5 instead of the catalog's sort values). An existing set with exactly these cards (any
 * name) is reused
 * (idempotent, e.g. after the old deck menu chose the same cards again); otherwise a new set "Our deck" (style
 * plain, no card limit) is created unless the team has custom_sets_max() sets already. Returns
 * array('deck_id' => 'c-<id>', 'deck_cards' => keys) or null (then the team keeps the default deck).
 */
function migrate_mixed_deck($link, string $t, array $mixed, array $catalog): ?array
{
    $cards = array();
    foreach ($mixed as $entry) {
        $cards[] = array('key' => null, 'symbol' => $entry['symbol'] ?? null,
            'text' => isset($entry['symbol']) ? null : cut_text((string)($entry['value'] ?? ''), CUSTOM_VALUE_MAX),
            'heading' => isset($entry['heading']) ? cut_text((string)$entry['heading'], CUSTOM_HEADING_MAX) : null,
            'description' => isset($entry['description']) ? cut_text((string)$entry['description'], CUSTOM_DESCRIPTION_MAX) : null,
            'numeric' => custom_symbol_value($entry, $catalog),
            'color' => (string)($entry['color'] ?? 'grey'));
    }
    if (count($cards) === 0) return null;
    $wanted = array_map('custom_card_signature', $cards);

    $sets = load_custom_sets($link, $t, $catalog);
    foreach ($sets as $set) {
        if (array_map('custom_card_signature', $set['cards']) === $wanted)
            return array('deck_id' => $set['deck_id'], 'deck_cards' => custom_deck_cards(array_column($set['cards'], 'card_key')));
    }
    if (count($sets) >= custom_sets_max()) return null;

    $set_id = insert_custom_set($link, $t, CUSTOM_MIGRATED_SET_NAME, 'plain', $cards);
    $keys = array();
    foreach (load_set_cards_by_key($link, $set_id, $catalog) as $key => $card) $keys[$card['sort_order']] = $key;
    ksort($keys);
    return array('deck_id' => custom_deck_id($set_id), 'deck_cards' => custom_deck_cards($keys));
}

/*
 * card_key => sort rank of custom cards for sort_players_by_sequence(): strictly by position in the set (the order of
 * the editor), never by numeric value - a value that contradicts the position is ignored (Andreas, 2026-11-02).
 * Average and spread still use numeric_value (frontend), cards without a value do not count there.
 */
function custom_card_rank(array $cards): array
{
    usort($cards, function ($a, $b) {
        return [$a['set_id'], $a['sort_order']] <=> [$b['set_id'], $b['sort_order']];
    });
    $rank = array();
    foreach ($cards as $card) if (!isset($rank[$card['card_key']])) $rank[$card['card_key']] = count($rank);
    return $rank;
}

/* writes an error answer of the custom set endpoints and ends the request */
function custom_fail(int $status, string $error, array $extra = array()): never
{
    http_response_code($status);
    set_header('json');
    echo json_encode(array_merge(array('error' => $error), $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

/* the set id of the request (?set=<id>), 0 if missing or malformed */
function get_set_param(): int
{
    $value = get_id_param('set', 10);
    return ctype_digit($value) && (int)$value > 0 ? (int)$value : 0;
}

/*
 * After a custom set was created (and is to be activated), saved or deleted: the team's deck becomes $deck_id (a custom
 * set or the default deck with all its cards; the control cards stay). If the cards of the deck change (not just their
 * order) while a card is down, a new round starts first (snapshot with the old deck), like a deck change in
 * update_deck.php. The deck is stored (deck_rev + 1) if anything changed or $force_store (e.g. name or style of the
 * active set). The caller holds the team row lock ($team from lock_team_deck()).
 * Returns array('deck' => resolved deck, 'changed' => bool, 'new_round' => bool).
 */
function custom_update_team_deck($link, string $t, array $team, array $catalog, string $deck_id, bool $force_store): array
{
    $sets = load_custom_sets($link, $t, $catalog);
    $old = $team['deck'];
    $new = resolve_deck($deck_id, null, implode(',', $old['controls']), (int)$team['deck_rev'], $catalog, $sets);
    $old_keys = $old['cards'];
    $new_keys = $new['cards'];
    sort($old_keys);
    sort($new_keys);
    $cards_changed = $new['id'] !== $old['id'] || $old_keys !== $new_keys;

    $new_round = false;
    if ($cards_changed && team_has_cards_down($link, $t)) {
        start_new_round($link, $t); // snapshot with the old deck
        $new_round = true;
    }
    $changed = $cards_changed || $force_store || $new['cards'] !== $old['cards'] || $team['deck_id'] !== $old['id'];
    if ($changed) {
        store_team_deck($link, $t, $new, $catalog, true);
        $new['rev']++;
    }
    return array('deck' => $new, 'changed' => $changed, 'new_round' => $new_round);
}
