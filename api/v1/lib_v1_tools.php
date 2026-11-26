<?php
/*
 * B-151 (MCP PR F2): handlers of the routes for card sets, timer and feedback (api/v1/routes.php, public: false, MCP
 * tools card_sets, timer, feedback; docs/mcp-concept.md 5.3) - mini adapters from the validated parameters to the core
 * functions of api/lib_core_deck.php, lib_core_timer.php and lib_core_feedback.php, like those in lib_v1.php. Every
 * write on the board answers with what it did (message) and the board afterwards (v1_seat_answer()). Required by
 * lib_v1.php; defines functions only.
 */

require_once __DIR__ . '/../lib_core_deck.php';
require_once __DIR__ . '/../lib_core_timer.php';
require_once __DIR__ . '/../lib_core_feedback.php';

const V1_FEEDBACK_CONTEXT = 'MCP (AI assistant)';

/* ---------- card sets ---------- */

function v1_deck_get(mysqli $link, array $actor, array $p): array
{
    return core_deck_list($link, $actor);
}

/* a comma list of card keys of a parameter ("" = none), invalid_param if it is no list of keys */
function v1_card_keys(string $value, string $param): array
{
    $keys = parse_card_keys(str_replace(' ', '', $value));
    if ($keys === null) throw new ApiError(400, 'invalid_param', $param, $param . ': a comma list of card keys from list');
    return $keys;
}

/* the sentence after a deck change: did a new round start */
function v1_new_round_text(bool $new_round): string
{
    return $new_round ? ' Cards were down, so a new round started (all cards taken back).' : '';
}

/* PUT /deck: choose a set (catalog variant or custom set), optionally only some of its cards */
function v1_deck_set(mysqli $link, array $actor, array $p): array
{
    $keys = isset($p['cards']) ? v1_card_keys($p['cards'], 'cards') : null;
    $result = core_deck_set($link, $actor, $p['deck'], $keys);
    $answer = v1_seat_answer($link, $actor, '');
    $name = $answer['board']['deck']['name'] ?? $p['deck'];
    $answer['message'] = ($result['changed'] ? 'The card set is now "' . v1_one_line($name) . '".' : 'The card set was already "'
        . v1_one_line($name) . '" - nothing changed.') . v1_new_round_text($result['new_round']);
    return ['new_round' => $result['new_round']] + $answer;
}

/* PUT /deck/controls: the control cards that are on ("" = none) */
function v1_controls_set(mysqli $link, array $actor, array $p): array
{
    $keys = v1_card_keys($p['cards'], 'cards');
    $result = core_controls_set($link, $actor, $keys);
    $answer = v1_seat_answer($link, $actor, '');
    $on = array_map(fn(array $c): string => (string)$c['value'], $answer['board']['deck']['controls'] ?? []);
    $answer['message'] = ($result['changed'] ? 'Control cards changed: ' : 'Control cards unchanged: ')
        . ($on === [] ? 'none.' : v1_one_line(implode(' ', $on)) . '.');
    return $answer;
}

/* the custom set $set_id of the team (not deleted), set_not_found otherwise */
function v1_custom_set(mysqli $link, array $actor, int $set_id): array
{
    $set = load_custom_sets($link, (string)$actor['team_id'], card_catalog())[$set_id] ?? null;
    if ($set === null) throw custom_set_error('not_found');
    return $set;
}

/* a stored card in the shape of a request card (edit without set_cards keeps the cards as they are) */
function v1_custom_card_in(array $card): array
{
    return ['key' => $card['card_key'], $card['symbol'] !== null ? 'symbol' : 'text' => $card['symbol'] ?? $card['value'],
            'heading' => $card['heading'], 'description' => $card['description'],
            'numeric_value' => $card['numeric_value'], 'color' => $card['color']];
}

/* the answer of a set write: message, the set (if it still exists), new_round, you and the board */
function v1_set_answer(mysqli $link, array $actor, string $message, ?array $set, bool $new_round): array
{
    $answer = v1_seat_answer($link, $actor, $message . v1_new_round_text($new_round));
    $out = ['message' => $answer['message']];
    if ($set !== null) {
        $out['set'] = ['set_id' => $set['set_id'], 'id' => $set['deck_id'], 'name' => $set['name'],
                       'rev' => $set['rev'], 'cards' => array_map(fn(array $c): string => (string)$c['value'], $set['cards'])];
    }
    return $out + ['new_round' => $new_round, 'you' => $answer['you'], 'board' => $answer['board']];
}

/* POST /sets: a new custom set (web: the set editor), optionally used at once */
function v1_set_create(mysqli $link, array $actor, array $p): array
{
    $data = ['name' => $p['name'], 'style' => $p['style'], 'cards' => $p['set_cards'], 'activate' => $p['activate']];
    if (isset($p['aim'])) $data['aim'] = $p['aim'];
    $result = core_custom_set_create($link, $actor, $data);
    $set = $result['set'];
    return v1_set_answer($link, $actor, 'Custom set "' . v1_one_line($set['name']) . '" created (set_id ' . $set['set_id'] . ', '
        . count($set['cards']) . ' cards)' . ($p['activate'] ? ' and chosen as the card set.' : '. Choose it with '
        . 'card_sets choose, deck "' . $set['deck_id'] . '".'), $set, $result['new_round']);
}

/* PUT /sets/{set_id}: change a custom set; what is not passed stays (the cards with their keys) */
function v1_set_save(mysqli $link, array $actor, array $p): array
{
    $set = v1_custom_set($link, $actor, $p['set_id']);
    $data = ['name' => $p['name'] ?? $set['name'], 'style' => $p['style'] ?? $set['style'], 'rev' => $p['rev'],
             'cards' => $p['set_cards'] ?? array_map('v1_custom_card_in', $set['cards'])];
    if (isset($p['aim'])) $data['aim'] = $p['aim'];
    $result = core_custom_set_save($link, $actor, $p['set_id'], $data);
    $set = $result['set'];
    return v1_set_answer($link, $actor, $result['changed'] ? 'Custom set "' . v1_one_line($set['name']) . '" saved (rev '
        . $set['rev'] . ').' : 'Nothing changed in custom set "' . v1_one_line($set['name']) . '".', $set, $result['new_round']);
}

/* DELETE /sets/{set_id}: delete a custom set (was it the card set, the team gets the default set) */
function v1_set_delete(mysqli $link, array $actor, array $p): array
{
    $result = core_custom_set_delete($link, $actor, $p['set_id']);
    $deck = $result['deck']['id'] ?? null;
    return v1_set_answer($link, $actor, 'Custom set "' . v1_one_line($result['name']) . '" deleted.'
        . ($result['was_deck'] ? ' It was the card set: the team has the default set "' . $deck . '" again.' : ''),
        null, $result['new_round']);
}

/* ---------- timer ---------- */

/*
 * POST /timer: one action of the web timer. MCP names: show/hide (set_visibility), set_mode stopwatch|timer,
 * set_timebox minutes, set_auto_start off|new_round|next_item. start while running and pause while not running change
 * nothing (the web only offers the other button; a second start would restart the clock).
 */
function v1_timer_set(mysqli $link, array $actor, array $p): array
{
    $need = fn(string $name) => $p[$name] ?? throw new ApiError(400, 'missing_param', $name,
                                                                $name . ': required for ' . $p['action']);
    $timer = core_board_get($link, $actor, false)['timer'];
    $running = $timer['status'] === 'running';
    [$action, $value] = match ($p['action']) {
        'start', 'pause', 'reset' => [$p['action'], null],
        'show' => ['set_visibility', 1],
        'hide' => ['set_visibility', 0],
        'set_mode' => ['set_mode', strtoupper((string)$need('mode'))],
        'set_timebox' => ['set_timebox', $need('minutes')],
        'set_auto_start' => ['set_auto_restart', ['off' => TIMER_AUTO_OFF, 'new_round' => TIMER_AUTO_NEW_ROUND,
                                                  'next_item' => TIMER_AUTO_NEXT_ITEM][$need('auto_start')]],
    };
    $skip = ($action === 'start' && $running) || ($action === 'pause' && !$running);
    if (!$skip) core_timer($link, $actor, $action, $value);
    $answer = v1_seat_answer($link, $actor, '');
    $answer['message'] = ($skip ? 'Nothing to do - ' : 'Done - ') . v1_timer_text($answer['board']['timer'])
        . ($answer['board']['timer']['visible'] ? '' : ' (hidden on the board)') . '.';
    return $answer;
}

/* "timer running, 5:00 countdown (timebox 5 min), auto start off" */
function v1_timer_text(array $timer): string
{
    $seconds = $timer['mode'] === 'timer' ? max(0, $timer['timebox_seconds'] - $timer['seconds']) : $timer['seconds'];
    $clock = sprintf('%d:%02d', intdiv($seconds, 60), $seconds % 60);
    return 'timer ' . $timer['status'] . ', ' . ($timer['mode'] === 'timer'
        ? $clock . ' countdown (timebox ' . intdiv($timer['timebox_seconds'], 60) . ' min)' : $clock . ' stopwatch')
        . ', auto start ' . str_replace('_', ' ', $timer['auto_start']);
}

/* ---------- feedback ---------- */

/* POST /feedback: feedback to the makers (not to the team), like the feedback box of the board */
function v1_feedback_send(mysqli $link, array $actor, array $p): array
{
    core_feedback_send($link, (string)$actor['uid'], strtoupper($p['type']), $p['text'], 0, V1_FEEDBACK_CONTEXT);
    return ['message' => 'Thank you - the feedback was sent to the makers of Agile Poker. It is not shown to the team.'];
}

/* an entry of the public roadmap for the agent */
function v1_roadmap_entry(array $item): array
{
    return ['entry' => $item['id'], 'type' => strtolower((string)$item['type']), 'title' => $item['title'],
            'description' => $item['description'], 'status' => strtolower((string)$item['status']),
            'up' => $item['reactions']['UP'], 'down' => $item['reactions']['DOWN'],
            'your_vote' => $item['my_reaction'] === null ? 'none' : strtolower($item['my_reaction'])];
}

/* GET /roadmap: the public list of ideas and bugs with votes */
function v1_roadmap_list(mysqli $link, array $actor, array $p): array
{
    return ['entries' => array_map('v1_roadmap_entry', get_roadmap_items($link, (string)$actor['uid']))];
}

/* PUT /roadmap/{entry}/vote: up, down or none */
function v1_roadmap_vote(mysqli $link, array $actor, array $p): array
{
    $entry = v1_roadmap_entry(core_roadmap_vote($link, (string)$actor['uid'], $p['entry'], strtoupper($p['reaction'])));
    return ['message' => 'Your vote on "' . v1_one_line((string)$entry['title']) . '" is now ' . $p['reaction'] . '.', 'entry' => $entry];
}
