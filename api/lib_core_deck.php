<?php
/*
 * B-151 (MCP PR F2): core functions of the card set (docs/mcp-concept.md, tool card_sets), shared by the old endpoints
 * update_deck.php, update_controls.php, custom_set_create.php, custom_set_save.php, custom_set_delete.php (thin
 * wrappers with unchanged answers, deck_core_call()) and the routes deck_* / set_* of api/v1/routes.php (MCP).
 * Same rules as api/lib_core_*.php: first parameter the connection, then the actor (['uid', 'team_id', ...]); no echo,
 * exit, header() or superglobals; errors as ApiError (custom sets: CustomSetError, which also carries the answer of the
 * old endpoints); prepared statements only. Locks (B-155): one db_transaction() per call, its first statement locks
 * the team row (lock_team_deck()), the set rows only after it. notify_team() once after the commit, only if something
 * changed, never on error. Requires api/lib.php. Defines functions only, a direct call does nothing.
 */

/* B-151: a short explanation per catalog group, so an agent can explain the options (card_sets list) */
const DECK_GROUP_HINTS = [
    'fib' => 'Story points for effort and complexity; the gaps grow with the size. Classic has ½, 40, 100 and ∞, '
        . 'Short ends at 40, Pure is the real Fibonacci sequence up to 55.',
    'numbers' => 'A simple linear scale 0-10, e.g. for ratings, confidence or business value.',
    'tshirt' => 'T-shirt sizes XXS-XXL for rough sizing (epics, roadmap) when numbers would be too precise.',
    'traffic' => 'Traffic lights: a quick go (green), concerns (yellow) or stop (red).',
    'emotions' => 'Faces for a mood check (check-in, retrospective); only the distribution counts, no agreed value.',
    'stars' => 'Rate something with 0-5 stars (a retrospective, a proposal, a meeting).',
    'judge' => 'Consent decision: everybody shows how far they support a proposal (0 step aside, 1 full support ... '
        . '5 need to talk, 6 veto).',
    'delegation' => 'Delegation Poker (Management 3.0): which of the 7 delegation levels (Tell, Sell, Consult, Agree, '
        . 'Advise, Inquire, Delegate) fits a decision.',
];

/*
 * Error of a custom set function: the v1 error (status, code, param, message for the agent) and the answer of the old
 * endpoints (old_status, old_error, extra: index, max, set), see custom_set_error().
 */
final class CustomSetError extends ApiError
{
    public function __construct(int $status, string $error, ?string $param, string $message,
                                public readonly int $old_status, public readonly string $old_error,
                                public readonly array $extra = [])
    {
        parent::__construct($status, $error, $param, $message);
    }
}

/* the error $old_error of the old custom set endpoints (custom_fail() codes) as CustomSetError */
function custom_set_error(string $old_error, array $extra = []): CustomSetError
{
    $at = isset($extra['index']) ? 'set_cards[' . $extra['index'] . ']' : 'set_cards';
    $card = [
        'card' => $at . ': each card is an object',
        'key' => $at . '.key: a card key of this set (c-...), of a predefined set or of another own set',
        'duplicate_key' => $at . '.key: a key may appear only once',
        'symbol_or_text' => $at . ': exactly one of text or symbol',
        'symbol' => $at . '.symbol: one of the symbols of list (custom.symbols)',
        'text' => $at . '.text: 1-' . CUSTOM_VALUE_MAX . ' characters (emoji allowed), no control characters',
        'heading' => $at . '.heading: at most ' . CUSTOM_HEADING_MAX . ' characters, no control characters',
        'description' => $at . '.description: at most ' . CUSTOM_DESCRIPTION_MAX . ' characters, no control characters',
        'numeric_value' => $at . '.numeric_value: a number (at most ' . CUSTOM_NUMERIC_MAX . ') or null',
        'color' => $at . '.color: one of the colors of list (custom.colors)',
    ];
    [$status, $error, $param, $message] = match (true) {
        isset($card[$old_error]) => [400, 'invalid_param', 'set_cards', $card[$old_error]],
        $old_error === 'cards', $old_error === 'body' => [400, 'invalid_param', 'set_cards', 'set_cards: a list of cards'],
        $old_error === 'no_cards' => [400, 'invalid_param', 'set_cards', 'set_cards: at least one card'],
        $old_error === 'too_many_cards' => [400, 'invalid_param', 'set_cards',
            'set_cards: at most ' . ($extra['max'] ?? custom_cards_max()) . ' cards'],
        $old_error === 'name' => [400, 'invalid_param', 'name', 'name: 1-' . CUSTOM_SET_NAME_MAX
            . ' characters, no control characters'],
        $old_error === 'style' => [400, 'invalid_param', 'style', 'style: one of ' . implode(', ', custom_styles(card_catalog()))],
        $old_error === 'aim' => [400, 'invalid_param', 'aim', 'aim: agree or perspectives'],
        $old_error === 'rev' => [400, 'invalid_param', 'rev', 'rev: the rev of the set from list'],
        $old_error === 'set_limit' => [409, 'limit_reached', null, 'The team has ' . ($extra['max'] ?? custom_sets_max())
            . ' custom sets already, the maximum. Delete one first (ask the user which).'],
        $old_error === 'not_found' => [404, 'set_not_found', 'set_id',
            'The team has no custom set with this set_id (deleted meanwhile?). Call card_sets list.'],
        $old_error === 'conflict' => [409, 'conflict', 'rev', 'Someone else changed this set meanwhile. Call card_sets '
            . 'list, show the user the current cards and edit again with the new rev.'],
        default => [500, 'internal', null, 'The card catalog is not available.'],
    };
    $old_status = match ($old_error) { 'not_found' => 404, 'conflict' => 409, default => 400 };
    return new CustomSetError($status, $error, $param, $message, $old_status, $old_error, $extra);
}

/*
 * For the old endpoints: runs a core function of this file and turns its errors into the old answers: CustomSetError ->
 * custom_fail() (JSON {error, ...}); team gone (403) -> 403 empty; other ApiError -> 400 empty; deadlock or lock wait
 * after the retries -> 503 with Retry-After (as api_transaction()). Returns the result of $core.
 */
function deck_core_call(callable $core): array
{
    try {
        return $core();
    } catch (CustomSetError $e) {
        custom_fail($e->old_status, $e->old_error, $e->extra);
    } catch (ApiError $e) {
        http_response_code($e->status === 403 ? 403 : 400);
        exit;
    } catch (mysqli_sql_exception $e) {
        if (!is_retryable_db_error($e)) throw $e;
        error_log('poker api: transaction given up after retries (' . $e->getCode() . '): ' . $e->getMessage());
        http_response_code(503);
        header('Retry-After: 1');
        exit;
    }
}

/* the team row lock of a deck change (first statement of the transaction); team gone -> 403 not_a_member */
function deck_lock_or_throw(mysqli $link, string $t, array $catalog): array
{
    $team = lock_team_deck($link, $t, $catalog);
    if ($team === null) throw new ApiError(403, 'not_a_member');
    return $team;
}

/*
 * deck_set (update_deck.php, MCP card_sets choose): the team's deck becomes the catalog variant or custom set $deck_id
 * ('c-<set id>'); $keys: only these cards of it (null = all). A variant takes any cards of its group (at least one), a
 * custom set only its active cards (at least CUSTOM_DECK_MIN_CARDS). If the cards change while a card is down, a new
 * round starts first (snapshot with the old deck). B-98 V6: the actor is remembered as the one who changed the set
 * group. Returns ['deck' => resolved deck, 'changed' => bool, 'new_round' => bool]. 400 invalid_param deck|cards.
 */
function core_deck_set(mysqli $link, array $actor, string $deck_id, ?array $keys): array
{
    $t = (string)$actor['team_id'];
    $player_id = (string)$actor['uid'];
    $catalog = card_catalog();
    $set_id = custom_set_id_of($deck_id);
    $entry = catalog_variants($catalog)[$deck_id] ?? null;
    if ($catalog['default_deck'] === null) throw new ApiError(500, 'internal', null, 'The card catalog is not available.');
    if ($entry === null && $set_id === null) {
        throw new ApiError(400, 'invalid_param', 'deck', 'deck: a set id from card_sets list (e.g. fib-short, c-12)');
    }
    $bad_cards = fn(string $rule) => new ApiError(400, 'invalid_param', 'cards', 'cards: ' . $rule);
    $deck_cards = null;
    if ($keys !== null && $set_id !== null) {
        if (count($keys) < CUSTOM_DECK_MIN_CARDS) throw $bad_cards('at least ' . CUSTOM_DECK_MIN_CARDS . ' cards of the set');
        $deck_cards = implode(',', $keys); // checked against the set below (team row lock)
    } elseif ($keys !== null) {
        $group_keys = array_column($entry['group']['cards'], 'card_key');
        if (count($keys) === 0 || count(array_diff($keys, $group_keys)) > 0) {
            throw $bad_cards('keys of cards of this set (list shows them), at least one');
        }
        $deck_cards = implode(',', $keys);
    }

    $result = db_transaction($link, function () use ($link, $t, $catalog, $deck_id, $set_id, $deck_cards, $player_id,
                                                     $bad_cards): array {
        $team = deck_lock_or_throw($link, $t, $catalog);
        $old = $team['deck'];
        if ($set_id !== null && !isset($team['custom_sets'][$set_id]['cards'][0])) { // other team, deleted or empty
            throw new ApiError(400, 'invalid_param', 'deck', 'deck: the team has no custom set ' . $deck_id);
        }
        if ($set_id !== null && $deck_cards !== null) { // B-98: only active cards of this set, and the list must fit
            $set_keys = array_column($team['custom_sets'][$set_id]['cards'], 'card_key');
            $keys = explode(',', $deck_cards);
            if (count(array_diff($keys, $set_keys)) > 0
                || count($keys) < count($set_keys) && custom_deck_cards($keys) === null) {
                throw $bad_cards('keys of cards of this set (list shows them)');
            }
        }
        $new = resolve_deck($deck_id, $deck_cards, implode(',', $old['controls']), (int)$team['deck_rev'], $catalog,
                            $team['custom_sets']);
        $changed = $new['id'] !== $old['id'] || $new['cards'] !== $old['cards'];
        $new_round = false;
        if ($changed || (int)$team['needs_setup'] === 1 || $team['deck_id'] !== $old['id']) {
            if ($changed && team_has_cards_down($link, $t)) {
                start_new_round($link, $t); // snapshot with the old deck
                $new_round = true;
            }
            store_team_deck($link, $t, $new, $catalog, true);
            if (deck_group_key($new) !== deck_group_key($old)) set_deck_changed_by($link, $t, $player_id); // B-98 V6
            $new['rev']++;
            $changed = true;
        }
        return ['deck' => $new, 'changed' => $changed, 'new_round' => $new_round];
    });
    if ($result['changed']) notify_team($t); // B-81
    return $result;
}

/*
 * controls_set (update_controls.php, MCP card_sets controls): the control cards of the team ($keys of card_catalog.json
 * "controls", [] = none), independent of the deck. Never starts a new round (B-98 S2: a control card that is down stays
 * on the table). Returns ['deck' => resolved deck, 'changed' => bool]. 400 invalid_param cards.
 */
function core_controls_set(mysqli $link, array $actor, array $keys): array
{
    $t = (string)$actor['team_id'];
    $catalog = card_catalog();
    if ($catalog['default_deck'] === null) throw new ApiError(500, 'internal', null, 'The card catalog is not available.');
    $control_keys = array_column($catalog['controls'], 'card_key');
    if (count(array_diff($keys, $control_keys)) > 0) {
        throw new ApiError(400, 'invalid_param', 'cards', 'cards: keys of control cards (' . implode(', ', $control_keys) . ')');
    }
    $result = db_transaction($link, function () use ($link, $t, $catalog, $keys): array {
        $team = deck_lock_or_throw($link, $t, $catalog);
        $old = $team['deck'];
        $new = resolve_deck($old['id'], implode(',', $old['cards']), implode(',', $keys), (int)$team['deck_rev'],
                            $catalog, $team['custom_sets']);
        $changed = $new['controls'] !== $old['controls'] || $team['deck_id'] !== $old['id'];
        if ($changed) {
            store_team_deck($link, $t, $new, $catalog, false);
            $new['rev']++;
        }
        return ['deck' => $new, 'changed' => $changed];
    });
    if ($result['changed']) notify_team($t); // B-81
    return $result;
}

/* name, style and aim of a create/save request (validate_custom_set_head()), CustomSetError on a bad value */
function custom_set_head_or_throw(array $data, array $catalog): array
{
    if ($catalog['default_deck'] === null) throw custom_set_error('catalog');
    $head = validate_custom_set_head($data, $catalog);
    if (isset($head['error'])) throw custom_set_error($head['error']);
    return $head;
}

/* validate_custom_cards() with the error as CustomSetError */
function custom_cards_or_throw(mixed $input, array $known, array $catalog, array $sources): array
{
    $checked = validate_custom_cards($input, $known, $catalog, $sources);
    if (isset($checked['error'])) {
        throw custom_set_error($checked['error'], isset($checked['index']) ? ['index' => $checked['index']] : []);
    }
    return $checked['cards'];
}

/*
 * set_create (custom_set_create.php, MCP card_sets create): a new custom set of the team from $data (the JSON body of
 * the web: name, style, aim, cards, activate). At most custom_sets_max() sets and custom_cards_max() cards. activate:
 * the new set becomes the deck (a new round if cards are down). Returns ['set', 'deck', 'new_round']. Always notifies
 * (the deck menus of the team show the new set).
 */
function core_custom_set_create(mysqli $link, array $actor, array $data): array
{
    $t = (string)$actor['team_id'];
    $player_id = (string)$actor['uid'];
    $catalog = card_catalog();
    $head = custom_set_head_or_throw($data, $catalog);
    $activate = ($data['activate'] ?? false) === true;

    $done = db_transaction($link, function () use ($link, $t, $catalog, $data, $head, $activate, $player_id): array {
        $team = deck_lock_or_throw($link, $t, $catalog); // the team row lock serializes all changes of the team's sets
        // cards are validated under the lock: a card may copy an active card of another own set (custom_source_cards())
        $cards = custom_cards_or_throw($data['cards'] ?? null, [], $catalog, custom_source_cards($team['custom_sets']));
        if (count($cards) > custom_cards_max()) throw custom_set_error('too_many_cards', ['max' => custom_cards_max()]);
        if (count($team['custom_sets']) >= custom_sets_max()) throw custom_set_error('set_limit', ['max' => custom_sets_max()]);
        $set_id = insert_custom_set($link, $t, $head['name'], $head['style'], $cards, $head['aim'] ?? 'agree');
        $result = ['deck' => $team['deck'], 'new_round' => false];
        if ($activate) $result = custom_update_team_deck($link, $t, $team, $catalog, custom_deck_id($set_id), true, $player_id);
        $set = load_custom_sets($link, $t, $catalog)[$set_id];
        return ['set' => $set, 'deck' => $result['deck'], 'new_round' => $result['new_round']];
    });
    notify_team($t); // B-81
    return $done;
}

/*
 * set_save (custom_set_save.php, MCP card_sets edit): saves the custom set $set_id from $data (web body: name, style,
 * aim (missing = unchanged), rev, force, cards with key = keep an existing card). Optimistic lock: rev must be the rev
 * of the set unless force -> 409 conflict (old answer with the current set). Rules of custom_set_save.php (card keys,
 * cards on/off, new round only if a card of the deck is gone). Returns ['set', 'deck', 'changed', 'new_round'];
 * notifies only if something changed.
 */
function core_custom_set_save(mysqli $link, array $actor, int $set_id, array $data): array
{
    $t = (string)$actor['team_id'];
    $catalog = card_catalog();
    if ($catalog['default_deck'] === null) throw custom_set_error('catalog');
    if ($set_id <= 0) throw custom_set_error('not_found');
    $head = custom_set_head_or_throw($data, $catalog);
    $rev = $data['rev'] ?? null;
    if (!is_int($rev)) throw custom_set_error('rev');
    $force = ($data['force'] ?? false) === true;

    $done = db_transaction($link, function () use ($link, $t, $catalog, $data, $head, $set_id, $rev, $force): array {
        $team = deck_lock_or_throw($link, $t, $catalog); // the team row lock serializes all changes of the team's sets
        $set = $team['custom_sets'][$set_id] ?? null;
        if ($set === null) throw custom_set_error('not_found');
        if ($rev !== $set['rev'] && !$force) throw custom_set_error('conflict', ['set' => $set]);

        $cards = custom_cards_or_throw($data['cards'] ?? null, load_set_cards_by_key($link, $set_id, $catalog), $catalog,
                                       custom_source_cards($team['custom_sets'], $set_id));
        $max = max(custom_cards_max(), count($set['cards']));
        if (count($cards) > $max) throw custom_set_error('too_many_cards', ['max' => $max]);

        $active = [];
        foreach ($set['cards'] as $card) $active[$card['card_key']] = $card;
        $stored = store_custom_cards($link, $set_id, $active, $cards);
        $aim = $head['aim'] ?? $set['aim'];
        $changed = $stored['changed'] || $head['name'] !== $set['name'] || $head['style'] !== $set['style'] || $aim !== $set['aim'];

        $result = ['deck' => $team['deck'], 'new_round' => false];
        if ($changed) {
            try {
                $sql = $link->prepare("update pok_custom_sets_tbl set name = ?, style = ?, aim = ?, rev = rev + 1 where id = ? and team_id = ?");
                $sql->bind_param('sssis', $head['name'], $head['style'], $aim, $set_id, $t);
            } catch (mysqli_sql_exception $e) {
                // B-52 S1b: without the column aim (code before the S1b schema) every set stays 'agree'
                if (!is_missing_schema_error($e) || $aim !== 'agree') throw $e;
                $sql = $link->prepare("update pok_custom_sets_tbl set name = ?, style = ?, rev = rev + 1 where id = ? and team_id = ?");
                $sql->bind_param('ssis', $head['name'], $head['style'], $set_id, $t);
            }
            $sql->execute();
            if ($team['deck']['id'] === custom_deck_id($set_id))
                $result = custom_update_team_deck($link, $t, $team, $catalog, custom_deck_id($set_id), true, '',
                                                  $stored['replaced']);
        }
        $set = load_custom_sets($link, $t, $catalog)[$set_id];
        return ['set' => $set, 'deck' => $result['deck'], 'changed' => $changed, 'new_round' => $result['new_round']];
    });
    if ($done['changed']) notify_team($t); // B-81
    return $done;
}

/*
 * set_delete (custom_set_delete.php, MCP card_sets delete): soft delete of the custom set $set_id (its cards stay for
 * the round history). Was it the deck, the team falls back to the default deck (a new round first if cards are down).
 * Returns ['deck', 'new_round', 'was_deck', 'name' (of the set)]. Always notifies.
 */
function core_custom_set_delete(mysqli $link, array $actor, int $set_id): array
{
    $t = (string)$actor['team_id'];
    $player_id = (string)$actor['uid'];
    $catalog = card_catalog();
    if ($catalog['default_deck'] === null) throw custom_set_error('catalog');
    if ($set_id <= 0) throw custom_set_error('not_found');

    $done = db_transaction($link, function () use ($link, $t, $catalog, $set_id, $player_id): array {
        $team = deck_lock_or_throw($link, $t, $catalog); // the team row lock serializes all changes of the team's sets
        if (!isset($team['custom_sets'][$set_id])) throw custom_set_error('not_found');
        $sql = $link->prepare("update pok_custom_sets_tbl set deleted = 1, rev = rev + 1 where id = ? and team_id = ?");
        $sql->bind_param('is', $set_id, $t);
        $sql->execute();

        $result = ['deck' => $team['deck'], 'new_round' => false];
        $was_deck = $team['deck']['id'] === custom_deck_id($set_id);
        if ($was_deck)
            $result = custom_update_team_deck($link, $t, $team, $catalog, (string)$catalog['default_deck'], true, $player_id);
        return ['deck' => $result['deck'], 'new_round' => $result['new_round'], 'was_deck' => $was_deck,
                'name' => $team['custom_sets'][$set_id]['name']];
    });
    notify_team($t); // B-81
    return $done;
}

/*
 * deck_get (MCP card_sets list): everything the deck menu and the set editor of the board show - the predefined sets
 * with their cards and a short explanation, the team's custom sets (with rev for edit), the control cards (on/off),
 * the current deck, whether cards are down (changing the deck then starts a new round) and what a custom card may be
 * (symbols, colours, styles, limits). Reads only (no lock, no notify).
 */
function core_deck_list(mysqli $link, array $actor): array
{
    $t = (string)$actor['team_id'];
    $catalog = card_catalog();
    $board = core_board_get($link, $actor, false);
    $deck = $board['deck'];
    $custom = load_custom_sets($link, $t, $catalog);
    $card = fn(array $c): array => array_filter(['key' => $c['card_key'], 'value' => (string)($c['value'] ?? ''),
                                                 'heading' => $c['heading'] ?? null], fn($v) => $v !== null && $v !== '');

    $sets = [];
    foreach ($catalog['groups'] as $group) {
        $by_key = array_column($group['cards'], null, 'card_key');
        foreach ($group['variants'] as $variant) {
            $name = (string)$group['name'];
            $variant_name = (string)($variant['name'] ?? '');
            $in = array_flip($variant['cards']);
            $entry = [
                'id' => $variant['id'],
                'name' => ($variant_name === '' || $variant_name === $name) ? $name : $name . ' (' . $variant_name . ')',
                'explanation' => DECK_GROUP_HINTS[$group['id']] ?? '',
                'cards' => array_values(array_map(fn($key) => $card($by_key[$key]), array_filter($variant['cards'],
                    fn($key) => isset($by_key[$key])))),
            ];
            $more = array_values(array_filter($group['cards'], fn($c) => !isset($in[$c['card_key']])));
            if ($more !== []) $entry['more_cards'] = array_map($card, $more);
            $sets[] = $entry;
        }
    }

    $own = [];
    foreach ($custom as $set) {
        $own[] = [
            'set_id' => $set['set_id'], 'id' => $set['deck_id'], 'name' => $set['name'], 'style' => $set['style'],
            'aim' => $set['aim'], 'rev' => $set['rev'],
            'cards' => array_map(fn(array $c): array => [
                'key' => $c['card_key'], 'value' => $c['value'],
                $c['symbol'] !== null ? 'symbol' : 'text' => $c['symbol'] ?? $c['value'],
                'heading' => $c['heading'], 'description' => $c['description'], 'numeric_value' => $c['numeric_value'],
                'color' => $c['color'],
            ], $set['cards']),
        ];
    }

    $on = $deck === null ? [] : array_column($deck['controls'], 'key');
    $controls = array_map(fn(array $c): array => $card($c) + ['description' => (string)($c['description'] ?? ''),
                                                               'on' => in_array($c['card_key'], $on, true)],
                          $catalog['controls']);
    $values = catalog_symbol_values($catalog);

    return [
        'current' => $deck === null ? null : ['id' => $deck['id'], 'name' => $deck['name'],
                                             'cards' => array_column($deck['cards'], 'key')],
        'cards_down' => team_has_cards_down($link, $t),
        'sets' => $sets,
        'custom_sets' => $own,
        'controls' => $controls,
        'custom' => [
            'max_sets' => custom_sets_max(), 'max_cards' => custom_cards_max(), 'min_cards_on' => CUSTOM_DECK_MIN_CARDS,
            'styles' => custom_styles($catalog), 'colors' => custom_colors($catalog),
            'symbols' => array_map(fn(string $s): array => ['symbol' => $s, 'value' => $values[$s] ?? ''],
                                   custom_symbols($catalog)),
        ],
    ];
}
