<?php
/*
 * B-151: the board as the actor sees it in the browser (docs/mcp-concept.md, tool get_board). A projection of getDao():
 * the same view as dao.php, so hidden cards stay hidden (placeholders before the reveal), anonymous names stay
 * '******' - never own SQL on pok_players_tbl.card_key. Core function like api/lib_core_*.php: first parameter the
 * connection, then the actor, no echo, exit, header() or superglobals. Requires api/lib.php, lib_core_team.php and
 * lib_core_items.php. Defines functions only, a direct call does nothing.
 */

/* display keys of getDao() that are no card: no card yet (prgrss1, anonymous prgrss2), card down but hidden (done001) */
const BOARD_NO_CARD_KEYS = ['prgrss1', 'prgrss2'];
const BOARD_HIDDEN_CARD_KEY = 'done001';
const BOARD_LATE_CARD_TEXT = 'joined in';

/*
 * board_get: team, the actor, note, round (voting with the names still to play, or revealed with distribution, range,
 * suggestion and average), players, connected observers, active item, counts, timer, deck and settings; with
 * $include_items also the open items (like GET /items). getDao() marks the actor as present (like a board loading
 * dao.php). Reads only, never notifies.
 */
function core_board_get(mysqli $link, array $actor, bool $include_items = false, ?string &$card_mkey = null): array
{
    $t = (string)$actor['team_id'];
    $dao = getDao($t, (string)$actor['uid']);
    // B-163: id of the own card on the web boards (its handle in anonymous mode after the reveal, '' = no card); only
    // for the caller (MCP react sends it as the thrower), not part of the board
    $card_mkey = (string)$dao['card_mkey'];
    if ($dao['team_name'] === null || $dao['player_type'] === null) throw new ApiError(403, 'not_a_member'); // gone meanwhile

    $catalog = card_catalog();
    $players = $dao['players'];
    $revealed = $dao['all_players_ready'] && $dao['players_count'] > 0;
    $anonymous_revealed = $revealed && (int)$dao['anonymous_mode'] === 1;

    // texts of every card the view shows: the table, the own card, the deck
    $deck = $dao['deck'];
    $keys = array_merge(array_column($players, 'display_card_key'), array_column($players, 'original_card_key'),
                        [$dao['selected_card_key']], $deck['cards'] ?? [], $deck['controls'] ?? []);
    $keys = array_values(array_unique(array_filter($keys, fn($key) => is_string($key) && $key !== '')));
    $texts = item_card_texts($link, $t, $keys, $catalog);
    $text = fn(?string $key): ?string => match (true) {
        $key === null || $key === '' => null,
        $key === LATE_CARD_KEY => BOARD_LATE_CARD_TEXT,
        default => $texts[$key][0] ?? $key,
    };

    $out_players = [];
    $waiting_for = [];
    $distribution = [];
    foreach ($players as $player) {
        $key = (string)$player->display_card_key;
        $played = !in_array($key, BOARD_NO_CARD_KEYS, true);
        if (!$played) $waiting_for[] = $player->name;
        $card = ($revealed && $played && $key !== BOARD_HIDDEN_CARD_KEY) ? $key : null;
        if ($card !== null && $card !== LATE_CARD_KEY) $distribution[$card] = ($distribution[$card] ?? 0) + 1;
        // anonymous mode after the reveal: no mkey of others, else name (before) and card (after) could be matched
        // through it; the own one stays (the agent finds its own row by it). B-163: getDao() gives card handles then,
        // the own card is the one with card_mkey and gets the real mkey back (API unchanged)
        $mkey = !$anonymous_revealed ? $player->mkey
            : ($player->mkey === (string)$dao['card_mkey'] ? (string)$dao['mkey'] : null);
        $entry = ['name' => $player->name, 'mkey' => $mkey, 'played' => $played, 'card' => $text($card),
                  'away' => (bool)$player->away, 'via_ai' => (bool)$player->via_ai, 'card_key' => $card];
        // B-151: in anonymous mode after the reveal getDao() gives away/via_ai of others as false (team counts below);
        // card_key says no more than card (rows sorted by card there, names hidden, no mkey)
        if ($player->original_card_key !== null) {
            $entry['card_before_change'] = $text($player->original_card_key);
            $entry['card_before_change_key'] = (string)$player->original_card_key;
        }
        $out_players[] = $entry;
    }

    $topics = $dao['topic_items'];
    $active = $topics['active'] ?? null;
    $round = ['state' => $revealed ? 'revealed' : 'voting', 'waiting_for' => $revealed ? [] : $waiting_for,
              'result' => $revealed ? board_round_result($link, $t, $distribution, $texts, $deck['aim'] ?? 'agree',
                                                         ($topics['round_counts'] ?? false) ? $active : null,
                                                         (int)$dao['show_avg'] === 1) : null];

    // B-151 rich view: the face of a card as the web draws it (script/deck.js, cards.js), keyed by card_key
    $faces = board_card_faces($catalog, $dao);
    $card_out = function (string $key) use ($text, $catalog, $dao, $faces): array {
        return ['key' => $key, 'value' => $text($key), 'heading' => board_card_heading($key, $catalog, $dao)]
            + ($faces[$key] ?? board_unknown_face($key, $text($key)));
    };
    // cards visible on the table that are in no deck list (other set, deleted custom card, "joined in")
    $in_deck = array_flip(array_merge($deck['cards'] ?? [], $deck['controls'] ?? []));
    $visible = array_merge(array_column($out_players, 'card_key'), array_column($out_players, 'card_before_change_key'),
                           [$dao['selected_card_key']], array_column($round['result']['distribution'] ?? [], 'card_key'));
    $other = [];
    foreach ($visible as $key) {
        if (is_string($key) && $key !== '' && !isset($in_deck[$key]) && !isset($other[$key])) $other[$key] = $card_out($key);
    }

    $board = [
        'team' => ['id' => $t, 'name' => (string)$dao['team_name'], 'invite_link' => public_board_url($t)],
        'you' => ['name' => (string)$dao['name'], 'role' => api_member_role((string)$dao['player_type']),
                  'mkey' => (string)$dao['mkey'], 'card' => $text($dao['selected_card_key']),
                  'card_key' => is_string($dao['selected_card_key']) && $dao['selected_card_key'] !== ''
                      ? $dao['selected_card_key'] : null,
                  // B-151 self leave: removed by its own leave (me leave, own trash can), not by someone else
                  'left_by_self' => $dao['player_type'] === 'REMOVED'
                      && seat_left_by_self($link, (string)$actor['uid'], $t)],
        'note' => (string)$dao['topic'],
        'round' => $round,
        'players' => $out_players,
        // B-163: in anonymous mode after the reveal the others as '******' without mkey (null, like the players)
        'observers' => array_map(fn($o) => ['name' => $o->name, 'mkey' => $o->mkey === '' ? null : $o->mkey,
                                             'via_ai' => (bool)$o->via_ai],
                                 $dao['observers']),
        'away_count' => (int)$dao['away_count'], // B-151: players away
        'ai_count' => (int)$dao['ai_count'], // B-151 mcp seen: players and observers using the board through an AI assistant
        'active_item' => $active === null ? null : ['key' => $active['ext_id'], 'heading' => $active['heading'],
                                                    'description' => $active['description'],
                                                    'rounds' => $active['rounds_cnt']],
        'open_count' => (int)($topics['open_count'] ?? 0),
        'done_count' => (int)($topics['done_count'] ?? 0),
        'timer' => [
            'status' => $dao['timer_status'] === 'RUNNING' ? 'running' : 'paused',
            'mode' => $dao['timer_mode'] === 'TIMER' ? 'timer' : 'stopwatch',
            'seconds' => (int)$dao['timer_time'],
            'timebox_seconds' => (int)$dao['timer_timebox'],
            'visible' => (int)$dao['timer_visibility'] === 1,
            'auto_start' => [TIMER_AUTO_NEW_ROUND => 'new_round', TIMER_AUTO_NEXT_ITEM => 'next_item']
                [(int)$dao['timer_auto_restart']] ?? 'off',
        ],
        'deck' => $deck === null ? null : [
            'id' => $deck['id'],
            'name' => board_deck_name($deck, $catalog, $dao['custom_sets']),
            'aim' => $deck['aim'] ?? 'agree',
            'cards' => array_map($card_out, $deck['cards']),
            'controls' => array_map($card_out, $deck['controls']),
            'style' => board_deck_style($deck, $catalog, $dao['custom_sets']),
            'other_cards' => array_values($other),
        ],
        'settings' => [
            'anonymous' => (int)$dao['anonymous_mode'] === 1,
            'results_order' => $dao['results_order'] === 'SEQUENCE' ? 'card' : 'name',
            'show_average' => (int)$dao['show_avg'] === 1,
            'show_tips' => (int)$dao['show_tips'] === 1,
            'show_card_changes' => (int)$dao['show_card_changes'] === 1,
        ],
    ];
    if ($include_items) $board['items'] = core_item_list($link, $actor, 'open', 100, 0)['items'];
    return $board;
}

/*
 * The revealed round: distribution in deck order ("5 ×2, 8 ×1"), range (lowest-highest card with a value, decks that
 * agree on a value only), suggestion (the active item's result if the round belongs to it - chosen or automatic, like
 * the board - else the automatic rule) and the average (only if the team shows it).
 */
function board_round_result(mysqli $link, string $t, array $distribution, array $texts, string $aim, ?array $active,
                            bool $show_average): array
{
    $keys = array_keys($distribution);
    usort($keys, fn(string $a, string $b): int => [$texts[$a][1] ?? PHP_INT_MAX, $a] <=> [$texts[$b][1] ?? PHP_INT_MAX, $b]);
    $votes = array_map(fn(string $key): array => ['card' => $texts[$key][0] ?? $key, 'card_key' => $key,
                                                  'count' => $distribution[$key]], $keys);

    $infos = card_result_infos($link, $t, $keys, card_catalog());
    $valued = array_values(array_filter($keys, fn(string $key): bool => card_has_result_value($infos[$key] ?? null)));
    $range = null;
    if ($aim === 'agree' && $valued !== []) {
        usort($valued, fn(string $a, string $b): int => $infos[$a]['numeric'] <=> $infos[$b]['numeric']);
        $low = $texts[$valued[0]][0] ?? $valued[0];
        $high = $texts[end($valued)][0] ?? end($valued);
        $range = $low === $high ? $low : $low . '–' . $high;
    }
    $suggestion_key = $active !== null ? $active['result_card_key'] : auto_result_key($distribution, $infos, $aim);
    $average = null;
    if ($show_average && $valued !== []) {
        $sum = 0.0;
        $count = 0;
        foreach ($valued as $key) {
            $sum += $infos[$key]['numeric'] * $distribution[$key];
            $count += $distribution[$key];
        }
        $average = round($sum / $count, 1);
    }
    return [
        'distribution' => $votes,
        'text' => implode(', ', array_map(fn(array $vote): string => $vote['card'] . ' ×' . $vote['count'], $votes)),
        'range' => $range,
        'suggestion' => $suggestion_key === null ? null : ($texts[$suggestion_key][0] ?? $suggestion_key),
        'average' => $average,
    ];
}

/* name of the deck: catalog group and variant ("Fibonacci (Short)", "T-shirt sizes") or the name of the custom set */
function board_deck_name(array $deck, array $catalog, array $custom_sets): string
{
    if (isset($deck['set_id'])) {
        foreach ($custom_sets as $set) if ((int)$set['set_id'] === (int)$deck['set_id']) return (string)$set['name'];
        return '';
    }
    $entry = catalog_variants($catalog)[(string)$deck['id']] ?? null;
    if ($entry === null) return '';
    $group = (string)$entry['group']['name'];
    $variant = (string)($entry['variant']['name'] ?? '');
    return ($variant === '' || $variant === $group) ? $group : $group . ' (' . $variant . ')';
}

/* the heading of a card (catalog card, control card or card of a custom set), null if it has none */
function board_card_heading(string $key, array $catalog, array $dao): ?string
{
    $cards = $catalog['controls'];
    foreach ($catalog['groups'] as $group) $cards = array_merge($cards, $group['cards']);
    foreach ($dao['custom_sets'] as $set) $cards = array_merge($cards, $set['cards']);
    foreach ($cards as $card) {
        if ($card['card_key'] === $key) return is_string($card['heading'] ?? null) && $card['heading'] !== '' ? $card['heading'] : null;
    }
    return null;
}

/* ---------- B-151 rich view: card faces like the web (script/deck.js cardFromCatalog/cardFromCustom, cards.js) ---------- */

const BOARD_CARD_STYLES = ['plain', 'badge', 'banner', 'inverted'];
/* cards.js CARD_VALUE_LOOK: symbol and colour of a value text that is not a plain number */
const BOARD_VALUE_LOOK = [
    '½' => ['s-half', 'vh'], '∞' => ['s-inf', 'vinf'],
    '☕' => ['s-coffee', 'vbrk'], '?' => ['s-question', 'vq'], '!' => ['s-exclam', 'vx'], '✋' => ['s-hand', 'vveto'],
    '🟢' => ['s-light-green', 'agreen'], '🟡' => ['s-light-yellow', 'ayellow'], '🔴' => ['s-light-red', 'ared'],
    '🙂' => ['s-face-satisfied', 'esatis'], '😒' => ['s-face-annoyed', 'eannoy'], '😢' => ['s-face-sad', 'esad'],
    '😐' => ['s-face-uninterested', 'eunint'], '😡' => ['s-face-angry', 'eangry'], '🤩' => ['s-face-enthusiastic', 'eenthu'],
];
/* status card of a player who joined after the reveal (cards.js STATUS_CARDS late001) */
const BOARD_LATE_FACE = ['text' => BOARD_LATE_CARD_TEXT, 'description' => null, 'symbol' => 's-late', 'color' => 'grey',
                         'numeric_value' => null, 'has_value' => false, 'infinite' => false, 'range' => false,
                         'style' => 'plain', 'control' => false];

/* the ids of the symbols in src/cards.svg (a symbol the sprite does not have is drawn as text, like cardLook()) */
function board_symbol_ids(): array
{
    static $ids = null;
    if ($ids === null) {
        $svg = @file_get_contents(__DIR__ . '/../src/cards.svg');
        preg_match_all('/<symbol id="([a-z0-9-]+)"/', is_string($svg) ? $svg : '', $m);
        $ids = array_flip($m[1]);
    }
    return $ids;
}

/* one face: the fields the web uses to draw a card */
function board_face(array $entry, ?array $group, string $style, bool $control, bool $custom): array
{
    $str = fn($v): ?string => is_string($v) && $v !== '' ? $v : null;
    $text = $str($entry['value'] ?? null) ?? (string)$entry['card_key'];
    // a number, or a numeric string as custom_symbol_value() gives it ('1.50' -> 1.5, '2.00' -> 2)
    $raw = $entry['numeric_value'] ?? null;
    $value = is_int($raw) || is_float($raw) ? $raw : (is_string($raw) && is_numeric($raw) ? $raw + 0 : null);
    if (is_float($value) && $value == floor($value) && abs($value) < PHP_INT_MAX) $value = (int)$value;
    $infinite = ($entry['infinite'] ?? false) === true || (!$custom && $text === '∞');
    if ($custom) $range = $value !== null || $infinite;
    else $range = ($value !== null || $infinite) && (is_bool($entry['range'] ?? null) ? $entry['range']
        : !($group !== null && ($group['range'] ?? true) === false));

    // cardLook(): catalog values win, else derived from the text; a custom text card has no symbol
    $guess = BOARD_VALUE_LOOK[$text] ?? null;
    if ($guess === null) {
        if (preg_match('/^\d{1,3}$/', $text)) $guess = ['s-' . $text, 'v' . $text];
        elseif (preg_match('/^([0-5])★$/u', $text, $m)) $guess = ['s-stars-' . $m[1], 'star'];
        elseif (preg_match('/^(XXS|XS|S|M|L|XL|XXL)$/', $text)) $guess = ['s-' . strtolower($text), 't' . $text];
        else $guess = [null, null];
    }
    $symbol = $custom ? $str($entry['symbol'] ?? null) : ($str($entry['symbol'] ?? null) ?? $guess[0]);
    $color = $str($entry['color'] ?? null);
    if ($color === null) {
        $gid = $group['id'] ?? '';
        if ($gid === 'judge' && preg_match('/^[0-6]$/', $text)) $color = 'j' . $text;
        elseif ($gid === 'delegation' && preg_match('/^[1-7]$/', $text)) $color = 'g' . $text;
        else $color = $guess[1];
    }
    return [
        'text' => $text,
        'description' => $str($entry['description'] ?? null),
        'symbol' => $symbol !== null && isset(board_symbol_ids()[$symbol]) ? $symbol : null,
        'color' => $color !== null && preg_match('/^[A-Za-z0-9]{1,16}$/', $color) ? $color : null,
        'numeric_value' => $value,
        'has_value' => $value !== null && !$control,
        'infinite' => $infinite,
        'range' => $range,
        'style' => $control || !in_array($style, BOARD_CARD_STYLES, true) ? 'plain' : $style,
        'control' => $control,
    ];
}

/* faces of every card the board may show: control cards, catalog cards, the team's custom cards (also played ones) */
function board_card_faces(array $catalog, array $dao): array
{
    $faces = [LATE_CARD_KEY => BOARD_LATE_FACE];
    foreach ($catalog['controls'] as $entry) $faces[$entry['card_key']] = board_face($entry, null, 'plain', true, false);
    foreach ($catalog['groups'] as $group) {
        foreach ($group['cards'] as $entry) {
            if (!isset($faces[$entry['card_key']])) {
                $faces[$entry['card_key']] = board_face($entry, $group, (string)($group['style'] ?? 'plain'), false, false);
            }
        }
    }
    $styles = [];
    foreach ($dao['custom_sets'] as $set) {
        $styles[(int)$set['set_id']] = (string)$set['style'];
        foreach ($set['cards'] as $entry) $faces[$entry['card_key']] = board_face($entry, null, (string)$set['style'], false, true);
    }
    foreach ($dao['custom_cards_played'] ?? [] as $entry) {
        if (!isset($faces[$entry['card_key']])) {
            $faces[$entry['card_key']] = board_face($entry, null, $styles[(int)$entry['set_id']] ?? 'plain', false, true);
        }
    }
    return $faces;
}

/* a key no list knows (e.g. after a catalog change): its text, no symbol */
function board_unknown_face(string $key, ?string $text): array
{
    return board_face(['card_key' => $key, 'value' => $text], null, 'plain', false, true);
}

/* the style of the deck: catalog group style or the custom set's style */
function board_deck_style(array $deck, array $catalog, array $custom_sets): string
{
    $style = 'plain';
    if (isset($deck['set_id'])) {
        foreach ($custom_sets as $set) if ((int)$set['set_id'] === (int)$deck['set_id']) $style = (string)$set['style'];
    } else {
        foreach ($catalog['groups'] as $group) if ($group['id'] === ($deck['group'] ?? null)) $style = (string)($group['style'] ?? 'plain');
    }
    return in_array($style, BOARD_CARD_STYLES, true) ? $style : 'plain';
}
