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
function core_board_get(mysqli $link, array $actor, bool $include_items = false): array
{
    $t = (string)$actor['team_id'];
    $dao = getDao($t, (string)$actor['uid']);
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
        // through it; the own one stays (the agent finds its own row by it)
        $mkey = ($anonymous_revealed && $player->mkey !== (string)$dao['mkey']) ? null : $player->mkey;
        $entry = ['name' => $player->name, 'mkey' => $mkey, 'played' => $played, 'card' => $text($card),
                  'away' => (bool)$player->away];
        if ($player->original_card_key !== null) $entry['card_before_change'] = $text($player->original_card_key);
        $out_players[] = $entry;
    }

    $topics = $dao['topic_items'];
    $active = $topics['active'] ?? null;
    $round = ['state' => $revealed ? 'revealed' : 'voting', 'waiting_for' => $revealed ? [] : $waiting_for,
              'result' => $revealed ? board_round_result($link, $t, $distribution, $texts, $deck['aim'] ?? 'agree',
                                                         ($topics['round_counts'] ?? false) ? $active : null,
                                                         (int)$dao['show_avg'] === 1) : null];

    $card_out = function (string $key) use ($text, $catalog, $dao): array {
        return ['key' => $key, 'value' => $text($key), 'heading' => board_card_heading($key, $catalog, $dao)];
    };

    $board = [
        'team' => ['id' => $t, 'name' => (string)$dao['team_name'], 'invite_link' => public_board_url($t)],
        'you' => ['name' => (string)$dao['name'], 'role' => api_member_role((string)$dao['player_type']),
                  'mkey' => (string)$dao['mkey'], 'card' => $text($dao['selected_card_key'])],
        'note' => (string)$dao['topic'],
        'round' => $round,
        'players' => $out_players,
        'observers' => array_map(fn($o) => ['name' => $o->name, 'mkey' => $o->mkey], $dao['observers']),
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
