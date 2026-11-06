<?php
/*
 * B-98 S4: custom sets of a team (pok_custom_sets_tbl, pok_custom_cards_tbl). Included by lib.php.
 *
 * - A custom set is a deck like a catalog variant: deck_id 'c-<set id>' (pok_teams_tbl.deck_id), group 'custom',
 *   its cards are the active cards of the set in position order (pok_teams_tbl.deck_cards keeps their keys for the
 *   round snapshot). Control cards stay team-wide (deck_controls).
 * - B-98 (cards on/off): like a catalog variant, the team may switch single cards of the set off (update_deck.php
 *   with cards); deck_cards then holds the switched-on keys. The set itself stays unchanged.
 * - A card whose identity (symbol, text, numeric value) changes is a new row with a new card_key ('c-' +
 *   base36(id)), the old row gets active = 0. Rows are never deleted, so cards still on the table keep their value.
 *   Position, heading, description and colour are updated in place (Andreas 2026-11-03), the key stays.
 * - A card has either a symbol of the symbol library (card_catalog.json "custom_symbols") or a text value (at most 6
 *   graphemes, emoji allowed), optional heading/description, an optional numeric value (spread, sorting, average) and a
 *   colour of the palette (card_catalog.json "custom_colors"). Cards migrated from an old mixed deck may keep their
 *   catalog symbol/colour; an edited copy of such a card may keep them as well. A card copied from a catalog card
 *   (editor template, request key = catalog card_key) may keep that card's symbol/colour, too. Likewise a card copied
 *   from an active card of another (not deleted) set of the same team (request key = its 'c-' card_key).
 */

const CUSTOM_DECK_PREFIX = 'c-';
const CUSTOM_DECK_GROUP = 'custom';
const CUSTOM_SET_NAME_MAX = 24;
const CUSTOM_VALUE_MAX = 6;            // graphemes (user-perceived characters, an emoji sequence counts as one)
const CUSTOM_VALUE_CODEPOINTS_MAX = 48; // code points of a text value (column value_text varchar(48))
const CUSTOM_HEADING_MAX = 16;
const CUSTOM_DESCRIPTION_MAX = 160;
const CUSTOM_NUMERIC_MAX = 99999999;  // decimal(10,2)
const CUSTOM_MIGRATED_SET_NAME = 'Our deck'; // Andreas 2026-11-02 (sets migrated before keep "Previous deck")
const CUSTOM_BODY_MAX_BYTES = 65536;
const CUSTOM_DECK_MIN_CARDS = 2;     // B-98: switched-on cards of a custom set (DECK_MIN_CARDS in script_deck.js)

/* B-98/B-100: sets per team; _CUSTOM_SETS_MAX in config.php overrides the default of 5 (later maybe a paid feature) */
function custom_sets_max(): int
{
    return defined('_CUSTOM_SETS_MAX') ? max(0, (int)constant('_CUSTOM_SETS_MAX')) : 5;
}

/*
 * B-98: cards per set when cards are added (migrated sets may have more); _CUSTOM_CARDS_MAX in config.php overrides
 * the default of 20 (Fibonacci has 17 cards and can be copied as a template, Andreas 2026-11-02)
 */
function custom_cards_max(): int
{
    return defined('_CUSTOM_CARDS_MAX') ? max(1, (int)constant('_CUSTOM_CARDS_MAX')) : 20;
}

/* card_key => card of all cards of the catalog groups (templates of the editor; no control or status cards) */
function catalog_group_cards(array $catalog): array
{
    $cards = array();
    foreach ($catalog['groups'] as $group)
        foreach ($group['cards'] as $card)
            if (isset($card['card_key']) && is_string($card['card_key'])) $cards[$card['card_key']] = $card;
    return $cards;
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

/*
 * B-98 (cards on/off): the switched-on cards of a custom set (its active cards, see load_custom_sets()) for
 * pok_teams_tbl.deck_cards $deck_cards (comma list of keys): the keys that are still active cards of the set, in
 * position order. Fewer than CUSTOM_DECK_MIN_CARDS of them (or null/'') = all cards of the set.
 */
function custom_deck_selection(array $set_cards, ?string $deck_cards): array
{
    $all = array_column($set_cards, 'card_key');
    if ($deck_cards === null || $deck_cards === '') return $all;
    $wanted = array_flip(explode(',', $deck_cards));
    $subset = array_values(array_filter($all, fn($key) => isset($wanted[$key])));
    return count($subset) >= CUSTOM_DECK_MIN_CARDS ? $subset : $all;
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
 * contains spoofing characters (has_spoofing_chars(): bidi overrides, zero-width spaces; the emoji joiner U+200D is
 * fine); '' for a missing optional value. Length in code points (the varchar columns), as before.
 */
function body_text(array $data, string $name, int $max_length, bool $optional = true): ?string
{
    if (!array_key_exists($name, $data) || $data[$name] === null) return $optional ? '' : null;
    if (!is_string($data[$name])) return null;
    $value = trim($data[$name]);
    if (cut_text($value, $max_length) !== $value) return null; // too long or invalid UTF-8
    if (has_spoofing_chars($value)) return null;
    return $value;
}

/*
 * Control and format characters could spoof texts on the board (bidi overrides/isolates, zero-width spaces), so
 * \p{Cc}, \p{Cf} and the line/paragraph separators \p{Zl}, \p{Zp} are refused - except the zero-width joiner U+200D, which composed emoji need (family, profession).
 * Variation selectors (U+FE0F), skin tones, regional indicators (flags) and the keycap U+20E3 are no Cf and allowed.
 */
function has_spoofing_chars(string $value): bool
{
    return (bool)preg_match('/[\p{Cc}\p{Zl}\p{Zp}]|(?!\x{200D})\p{Cf}/u', $value);
}

/*
 * Number of user-perceived characters of a (valid UTF-8) text, simplified UAX #29 for emoji, the same on every server
 * (PCRE \X differs between library versions, e.g. 10.42 joins consecutive emoji; intl is not installed everywhere):
 * combining marks (incl. variation selectors U+FE0F, keycap U+20E3), skin tones U+1F3FB-1F3FF and the joiner U+200D
 * belong to the character before; a pictograph after U+200D joins a pictograph before it (emoji ZWJ sequence, UAX #29
 * GB11), any other character after U+200D starts a new one ('A' ZWJ 'B' are two); two regional indicators form one
 * flag. Tag characters U+E0020-E007F are counted with the character before as well, but card texts refuse them
 * (has_spoofing_chars(), \p{Cf}), so subdivision flags are not allowed.
 */
function is_pictographic_codepoint(int $cp): bool
{
    // Extended_Pictographic by ranges (\p{Extended_Pictographic} needs PCRE2 >= 10.40, not on every server);
    // regional indicators and skin tones lie in these blocks but are no pictographs
    if ($cp >= 0x1F1E6 && $cp <= 0x1F1FF || $cp >= 0x1F3FB && $cp <= 0x1F3FF) return false;
    return in_array($cp, array(0x00A9, 0x00AE, 0x203C, 0x2049, 0x2122, 0x2139, 0x3030, 0x303D, 0x3297, 0x3299), true)
        || $cp >= 0x2194 && $cp <= 0x21AA || $cp >= 0x231A && $cp <= 0x23FF || $cp >= 0x25AA && $cp <= 0x25FE
        || $cp >= 0x2600 && $cp <= 0x27BF || $cp >= 0x2934 && $cp <= 0x2935 || $cp >= 0x2B05 && $cp <= 0x2B55
        || $cp >= 0x1F000 && $cp <= 0x1FAFF || $cp >= 0x1FC00 && $cp <= 0x1FFFD;
}

function custom_grapheme_count(string $value): int
{
    preg_match_all('/./su', $value, $m);
    $count = 0;
    $joined = false;   // previous code point was U+200D
    $open_flag = false; // previous code point was a single regional indicator
    $pictograph = false; // the current grapheme ends with a pictograph (before marks, skin tones, joiner)
    foreach ($m[0] as $char) {
        $b = array_values(unpack('C*', $char)); // one valid UTF-8 code point (1-4 bytes)
        $cp = match (count($b)) {
            1 => $b[0],
            2 => ($b[0] & 0x1F) << 6 | $b[1] & 0x3F,
            3 => ($b[0] & 0x0F) << 12 | ($b[1] & 0x3F) << 6 | $b[2] & 0x3F,
            default => ($b[0] & 0x07) << 18 | ($b[1] & 0x3F) << 12 | ($b[2] & 0x3F) << 6 | $b[3] & 0x3F,
        };
        $is_ri = $cp >= 0x1F1E6 && $cp <= 0x1F1FF;
        $is_pict = is_pictographic_codepoint($cp);
        $mark = $cp === 0x200D || $cp >= 0x1F3FB && $cp <= 0x1F3FF || $cp >= 0xE0020 && $cp <= 0xE007F
            || preg_match('/^\p{M}$/u', $char);
        $extends = $count > 0 && ($mark || $joined && $is_pict && $pictograph || $is_ri && $open_flag);
        if (!$extends) $count++;
        if (!$mark) $pictograph = $is_pict;
        $open_flag = $is_ri && !($extends && $open_flag);
        $joined = $cp === 0x200D;
    }
    return $count;
}

/*
 * A text value of a card (Andreas 2026-11-02: emoji allowed): 1 to 6 graphemes (custom_grapheme_count(), an emoji sequence like a family,
 * a flag or a keycap counts as one), at most CUSTOM_VALUE_CODEPOINTS_MAX code points, no spoofing characters
 * (has_spoofing_chars()), no private-use or surrogate code points, at least one visible character (not only
 * spaces, joiners or combining marks). Expects a trimmed value.
 */
function is_custom_value_text(string $value): bool
{
    $codepoints = preg_match_all('/./su', $value); // false for invalid UTF-8
    if ($value === '' || $codepoints === false || $codepoints > CUSTOM_VALUE_CODEPOINTS_MAX) return false;
    if (custom_grapheme_count($value) > CUSTOM_VALUE_MAX) return false;
    // invisible letters (Hangul fillers U+115F, U+1160, U+3164, U+FFA0, blank Braille U+2800) could fake an empty card
    if (has_spoofing_chars($value) || preg_match('/[\p{Co}\p{Cs}\x{115F}\x{1160}\x{3164}\x{FFA0}\x{2800}]/u', $value))
        return false;
    return (bool)preg_match('/[^\s\x{200D}\p{M}]/u', $value);
}

/*
 * Validates the card list of a create/save request. $known: cards of this set by key (active and inactive rows) -
 * a card that refers to one of them may keep its symbol and colour even if they are not in the custom whitelists
 * (cards migrated from an old deck). Likewise a card whose key is the card_key of a catalog group card (template of
 * the editor, e.g. 'infin01') may take that card's symbol and colour; it is a new card (normalized key null).
 * $sources: active cards of the team's other sets that are not deleted, by key (custom_source_cards()) - a card whose
 * key is one of them is a copy of that card (new set copied from an own set): it may take that card's symbol and
 * colour and is a new card (normalized key null) as well. Other keys (other teams, deleted sets, inactive cards of
 * other sets, unknown) give no exception. Content is validated as usual.
 * Returns array('cards' => [normalized cards]) or array('error' => code, 'index' => position of the card).
 * A normalized card: key (given custom key or null), symbol, text, heading, description, numeric (string '1.50' or
 * null), color.
 */
function validate_custom_cards($input, array $known, array $catalog, array $sources = array()): array
{
    if (!is_array($input) || !array_is_list($input)) return array('error' => 'cards');
    if (count($input) === 0) return array('error' => 'no_cards');

    $symbols = array_flip(custom_symbols($catalog));
    $colors = array_flip(custom_colors($catalog));
    $templates = catalog_group_cards($catalog);
    $cards = array();
    $seen = array();
    foreach ($input as $i => $card) {
        $error = function (string $code) use ($i) { return array('error' => $code, 'index' => $i); };
        if (!is_array($card) || array_is_list($card) && count($card) > 0) return $error('card');

        $key = $card['key'] ?? null;
        $ref = null;
        if ($key !== null && is_string($key) && isset($templates[$key])) {
            $ref = $templates[$key]; // copy of a catalog card: a new card, catalog keys may repeat
            $key = null;
        } elseif ($key !== null && is_string($key) && !isset($known[$key]) && isset($sources[$key])) {
            $ref = $sources[$key]; // copy of a card of another own set: a new card, source keys may repeat
            $key = null;
        } else {
            if ($key !== null && (!is_string($key) || !preg_match('/^c-[a-z0-9]{1,5}$/D', $key))) return $error('key');
            if ($key !== null && isset($seen[$key])) return $error('duplicate_key');
            if ($key !== null) $seen[$key] = true;
            $ref = $key !== null ? ($known[$key] ?? null) : null;
        }

        $symbol = $card['symbol'] ?? null;
        $symbol = $symbol === '' ? null : $symbol;
        $text = $card['text'] ?? null;
        $text = is_string($text) ? trim($text) : $text;
        $text = $text === '' ? null : $text;
        if (($symbol === null) === ($text === null)) return $error('symbol_or_text');
        if ($symbol !== null && (!is_string($symbol)
                || !isset($symbols[$symbol]) && ($ref === null || ($ref['symbol'] ?? null) !== $symbol))) return $error('symbol');
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
        if (!is_string($color) || !isset($colors[$color]) && ($ref === null || ($ref['color'] ?? null) !== $color)) return $error('color');

        $cards[] = array('key' => $key, 'symbol' => $symbol, 'text' => $text,
            'heading' => $heading === '' ? null : $heading, 'description' => $description === '' ? null : $description,
            'numeric' => $numeric, 'color' => $color);
    }
    return array('cards' => $cards);
}

/*
 * Templates for copying from an own set: the active cards of the team's sets that are not deleted (load_custom_sets(),
 * loaded under the team row lock) by card_key, except the set $except_set_id (the set being saved keeps its own logic).
 */
function custom_source_cards(array $sets, ?int $except_set_id = null): array
{
    $cards = array();
    foreach ($sets as $set_id => $set) {
        if ($set_id === $except_set_id) continue;
        foreach ($set['cards'] as $card) $cards[$card['card_key']] = $card;
    }
    return $cards;
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

/*
 * Identity of a card (Andreas, 2026-11-03): symbol, text and numeric value. Changing one of them gives the card a new
 * key (and a new round if cards are down); heading, description and colour are its presentation and change in place.
 * Stored card (row of load_* / custom_card_out) or normalized request card, comparable.
 */
function custom_card_identity(array $card): string
{
    if (array_key_exists('numeric', $card)) { // normalized request card
        return json_encode(array($card['symbol'], $card['symbol'] === null ? $card['text'] : null, $card['numeric']));
    }
    return json_encode(array($card['symbol'], $card['symbol'] === null ? $card['value'] : null,
        $card['numeric_value'] === null ? null : sprintf('%.2f', $card['numeric_value'])));
}

/* complete content of a stored card (row of load_* / custom_card_out) or a normalized request card, comparable */
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
 * Stores the card list of a save request. A card with its key (active in the set) and the same identity
 * (custom_card_identity(): symbol, text, numeric value) keeps its key; its position, heading, description and colour
 * are updated in place (cards on the table show the new presentation). A card with a changed identity and new cards
 * become new rows (new keys), active cards missing in the list (or replaced) get active = 0 - those rows are kept, so
 * cards on the table keep their data. Returns the keys in the new order, whether anything changed and 'replaced'
 * (old key => new key of a card whose identity changed, B-98: it keeps its on/off state).
 */
function store_custom_cards($link, int $set_id, array $active, array $cards): array
{
    $keys = array();
    $changed = false;
    $kept = array();
    $replaced = array();
    foreach ($cards as $i => $card) {
        $old = $card['key'] !== null ? ($active[$card['key']] ?? null) : null;
        if ($old !== null && custom_card_identity($old) === custom_card_identity($card)) {
            $kept[$card['key']] = true;
            if ($old['sort_order'] !== $i || custom_card_signature($old) !== custom_card_signature($card)) {
                $sql = $link->prepare("update pok_custom_cards_tbl set position = ?, heading = ?, description = ?, color = ?
                                        where set_id = ? and card_key = ?");
                $sql->bind_param('isssis', $i, $card['heading'], $card['description'], $card['color'], $set_id, $card['key']);
                $sql->execute();
                $changed = true;
            }
            $keys[] = $card['key'];
        } else {
            $key = insert_custom_card($link, $set_id, $i, $card);
            if ($old !== null) $replaced[$card['key']] = $key;
            $keys[] = $key;
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
    return array('keys' => $keys, 'changed' => $changed, 'replaced' => $replaced);
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
 * B-116: the example set every team gets once (Andreas 2026-11-05), so a team sees what own sets can do. Kept here as
 * a constant, not in card_catalog.json: only the API needs it, and the texts/colours are fixed (no validation of a
 * second source). Colours are tokens of card_catalog.json "custom_colors", texts are emoji (CUSTOM_VALUE_MAX).
 */
const EXAMPLE_SET_NAME = 'Animals (Example)';
const EXAMPLE_SET_STYLE = 'banner';
const EXAMPLE_SET_CARDS = array(
    array('text' => "\u{1F41C}", 'heading' => 'Ant', 'numeric' => 1, 'color' => 'brown'),
    array('text' => "\u{1F401}", 'heading' => 'Mouse', 'numeric' => 2, 'color' => 'red'),
    array('text' => "\u{1F415}", 'heading' => 'Dog', 'numeric' => 3, 'color' => 'amber'),
    array('text' => "\u{1F40E}", 'heading' => 'Horse', 'numeric' => 5, 'color' => 'green'),
    array('text' => "\u{1F418}", 'heading' => 'Elephant', 'numeric' => 8, 'color' => 'grey'),
    array('text' => "\u{1F40B}", 'heading' => 'Whale', 'numeric' => 13, 'color' => 'cyan'),
);

/*
 * B-116: gives the team the example set once, lazily from getDao() (also new teams, on their first load). Runs in its
 * own transaction under the lock of the team row, so parallel loads create one set only; pok_teams_tbl.example_set_given
 * = 1 afterwards, also if the team has custom_sets_max() sets already (then no set) - a deleted example set never comes
 * back. The set is not activated, deck and round stay as they are. A team not migrated yet (deck_id null, e.g. a
 * parallel update_cardset.php) is migrated first under the same lock, so an old mixed deck still gets its set "Our
 * deck" before the example set counts against the limit; then the migrated deck is returned (deck_id, deck_cards,
 * deck_controls), else null. Does not notify (dao.php never notifies).
 */
function give_example_set($link, string $t, array $catalog): ?array
{
    $migrated = null;
    $link->begin_transaction();
    $sql = $link->prepare("select cardset_flags, deck_id, example_set_given from pok_teams_tbl where id = ? for update");
    $sql->bind_param('s', $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    if (is_array($row) && (int)$row['example_set_given'] === 0) {
        if ($row['deck_id'] === null)
            $migrated = migrate_team_deck_locked($link, $t, $row['cardset_flags'], $catalog, true);
        if (count(load_custom_sets($link, $t, $catalog)) < custom_sets_max()) {
            $cards = array();
            foreach (EXAMPLE_SET_CARDS as $card)
                $cards[] = array('key' => null, 'symbol' => null, 'text' => $card['text'], 'heading' => $card['heading'],
                                 'description' => null, 'numeric' => (string)$card['numeric'], 'color' => $card['color']);
            insert_custom_set($link, $t, EXAMPLE_SET_NAME, EXAMPLE_SET_STYLE, $cards);
        }
        $sql = $link->prepare("update pok_teams_tbl set example_set_given = 1 where id = ?");
        $sql->bind_param('s', $t);
        $sql->execute();
    }
    $link->commit();
    return $migrated;
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
 * order) while a card is down (another deck, added or removed card, changed symbol/text/value = new key), a new
 * round starts first (snapshot with the old deck), like a deck
 * change in update_deck.php. The deck is stored (deck_rev + 1) if anything changed or $force_store (e.g. name or style of the
 * active set). The caller holds the team row lock ($team from lock_team_deck()). B-98 V6: $player_id is remembered
 * as the one who changed the card set if the set group changes.
 * B-98 (cards on/off): another deck gets all its cards. The same custom set (saved in the editor) keeps the cards that
 * were switched off ($replaced from store_custom_cards(): a replaced card keeps its state); removed cards drop out,
 * added cards are on. Fewer than CUSTOM_DECK_MIN_CARDS on = all cards again (custom_deck_selection()).
 * Returns array('deck' => resolved deck, 'changed' => bool, 'new_round' => bool).
 */
function custom_update_team_deck($link, string $t, array $team, array $catalog, string $deck_id, bool $force_store,
                                 string $player_id = '', array $replaced = array()): array
{
    $sets = load_custom_sets($link, $t, $catalog);
    $old = $team['deck'];
    $deck_cards = null;
    $set_id = custom_set_id_of($deck_id);
    if ($old['id'] === $deck_id && $set_id !== null && isset($team['custom_sets'][$set_id], $sets[$set_id])) {
        $off = array_flip(array_diff(array_column($team['custom_sets'][$set_id]['cards'], 'card_key'), $old['cards']));
        foreach ($replaced as $old_key => $new_key) if (isset($off[$old_key])) $off[$new_key] = true;
        $on = array_filter(array_column($sets[$set_id]['cards'], 'card_key'), fn($key) => !isset($off[$key]));
        $deck_cards = implode(',', $on);
    }
    $new = resolve_deck($deck_id, $deck_cards, implode(',', $old['controls']), (int)$team['deck_rev'], $catalog, $sets);
    $old_keys = $old['cards'];
    $new_keys = $new['cards'];
    sort($old_keys);
    sort($new_keys);
    $cards_changed = $new['id'] !== $old['id'] || $old_keys !== $new_keys;
    // Andreas 2026-11-03 (variant b): any change of the set of cards (added, removed, new key after a change of
    // symbol, text or value) or another deck starts a new round; order and looks (heading, colour, ...) do not
    $new_round = false;
    if ($cards_changed && team_has_cards_down($link, $t)) {
        start_new_round($link, $t); // snapshot with the old deck
        $new_round = true;
    }
    $changed = $cards_changed || $force_store || $new['cards'] !== $old['cards'] || $team['deck_id'] !== $old['id'];
    if ($changed) {
        store_team_deck($link, $t, $new, $catalog, true);
        // B-98 V6: activating a new set or the fallback after a delete changes the set group
        if (deck_group_key($new) !== deck_group_key($old)) set_deck_changed_by($link, $t, $player_id);
        $new['rev']++;
    }
    return array('deck' => $new, 'changed' => $changed, 'new_round' => $new_round);
}
