<?php
/*
 * B-150: core functions of the topic items (docs/api-v1-concept.md, sections 7 and 8). Called by the old endpoints
 * api/topic_item_add.php, topic_item_edit.php, topic_item_delete.php, topic_item_reopen.php (thin wrappers, topic_core_call()) and later by
 * the v1 router and MCP alike: first parameter the connection, second the actor (needs actor.team_id); no echo, exit,
 * header() or superglobals; errors as ApiError. Requires api/lib.php.
 * Rules (B-155): one transaction per call through db_transaction(); its first statement locks the team row
 * (lock_team_topics_or_throw()); the item key is determined and checked BEFORE the insert/update (SQL in the column
 * collation, item_key_taken()); a duplicate key (1062) despite the lock -> 409 key_taken; writes only through
 * topic_items_write() (topics_rev); notify_team() once after the commit.
 * Input checks of the callers: heading trimmed and not longer than TOPIC_HEADING_MAX, description not longer than
 * TOPIC_DESCRIPTION_MAX, maturity null or 0..TOPIC_MATURITY_MAX. The key is checked here (it needs the database).
 * An item is named by its id (int, old endpoints, the board) or by its key (string, /api/v1; found by SQL in the
 * collation of the column, load_topic_item_by_key()).
 * PR 4: the API representation of an item (schema Item of api/v1/routes.php) is built here too (items_api_out(),
 * item_result_out()), so v1 and later MCP share it.
 */

require_once __DIR__ . '/lib_core_team.php'; // public_board_url()

/*
 * The key of a new or changed item, checked under the team row lock: '' or null -> $fallback() (the suggestion),
 * otherwise it must match ITEM_KEY_PATTERN (400 invalid_param key) and be free in the team apart from the item
 * $except_id (409 key_taken).
 */
function item_key_checked_locked(mysqli $link, string $t, ?string $key, int $except_id, callable $fallback): string
{
    if ($key === null || $key === '') return $fallback();
    if (!valid_item_key($key)) {
        throw new ApiError(400, 'invalid_param', 'key',
                           'key: 1-20 characters A-Z, a-z, 0-9, _ or -, starting with a letter or digit');
    }
    if (item_key_taken($link, $t, $key, $except_id)) throw new ApiError(409, 'key_taken', 'key', 'Key already used');
    return $key;
}

/* runs $work in db_transaction(); a duplicate key (1062, unique index ux_topic_items_team_key) -> 409 key_taken */
function item_transaction(mysqli $link, callable $work): array
{
    try {
        return db_transaction($link, $work);
    } catch (mysqli_sql_exception $e) {
        if ($e->getCode() === 1062) throw new ApiError(409, 'key_taken', 'key', 'Key already used');
        throw $e;
    }
}

/* the item $ref (int = id, string = key) of team $t under the caller's team row lock; 404 item_not_found */
function item_locked_or_throw(mysqli $link, string $t, int|string $ref): array
{
    $item = is_int($ref) ? load_topic_item($link, $t, $ref) : load_topic_item_by_key($link, $t, $ref);
    if ($item === null) throw new ApiError(404, 'item_not_found');
    return $item;
}

/*
 * Inserts a new open item under the caller's team row lock (limits, key checked or suggested, see core_item_create()).
 * Returns [id, key].
 */
function item_create_locked(mysqli $link, string $t, array $fields): array
{
    $counts = topic_item_counts($link, $t);
    if ($counts['open'] >= TOPIC_ITEMS_OPEN_MAX || $counts['total'] >= TOPIC_ITEMS_TOTAL_MAX)
        throw new ApiError(409, 'limit_reached', null, 'At most 100 open and 1000 items per team');
    $key = item_key_checked_locked($link, $t, $fields['key'] ?? null, 0,
                                   fn(): string => item_key_suggest($link, $t));
    $id = insert_topic_item($link, $t, $key, (string)$fields['heading'], null_if_empty($fields['description'] ?? null),
                            $fields['maturity'] ?? null, open_index_for($fields['at'] ?? 'end', $counts['open']));
    return [$id, $key];
}

/* changes the item row $item under the caller's team row lock (the given $fields only, see core_item_patch());
   returns the key */
function item_patch_locked(mysqli $link, string $t, array $item, array $fields): ?string
{
    $id = (int)$item['id'];
    $stored = $item['ext_id'] === null ? null : (string)$item['ext_id'];
    $key = $stored;
    if (array_key_exists('key', $fields) && $fields['key'] !== $stored) {
        $new = (string)$fields['key'];
        if ($new === '' && $stored !== null && $stored !== '')
            throw new ApiError(400, 'invalid_param', 'key', 'key: required');
        $key = item_key_checked_locked($link, $t, $new, $id, fn(): string => item_key_suggest($link, $t));
    }
    $heading = array_key_exists('heading', $fields) ? (string)$fields['heading'] : (string)$item['heading'];
    $description = array_key_exists('description', $fields) ? null_if_empty($fields['description'])
                                                             : $item['description'];
    $maturity = array_key_exists('maturity', $fields) ? $fields['maturity']
                                                      : ($item['maturity'] === null ? null : (int)$item['maturity']);
    update_topic_item($link, $t, $id, $heading, $description, $key, $maturity);
    return $key;
}

/*
 * item_create: a new open item of the actor's team. $fields: heading (required), description (?string, '' = none),
 * key (?string; missing, null or '' -> the server's suggestion item_key_suggest(), e.g. an old cached board or a
 * script), maturity (?int), at ('end' | 'next'). Errors: 400 invalid_param key, 409 key_taken, 409 limit_reached,
 * 403 not_a_member (unknown team). Returns ['item_id', 'key', 'active_id']. Notifies the team after the commit.
 */
function core_item_create(mysqli $link, array $actor, array $fields): array
{
    $t = (string)$actor['team_id'];
    $result = item_transaction($link, function () use ($link, $t, $fields): array {
        lock_team_topics_or_throw($link, $t);
        [$id, $key] = item_create_locked($link, $t, $fields);
        return ['item_id' => $id, 'key' => $key, 'active_id' => active_item_id($link, $t)];
    });
    notify_team($t); // B-81: after the commit, never on error
    return $result;
}

/*
 * item_patch: changes an item $ref (id or key; open or done, like the board) of the actor's team. $fields: only the
 * given ones change - heading (string), description (?string, '' or null = none), key (string; '' is refused, except
 * for an old item without a key, which then gets the suggestion), maturity (?int). A key sent unchanged (exactly the
 * stored value) is not checked again, so an item with an old invalid key stays editable until the migration has run.
 * Errors: 404 item_not_found, 400 invalid_param key, 409 key_taken, 403 not_a_member. Returns ['item_id', 'key',
 * 'active_id']. Notifies the team after the commit.
 */
function core_item_patch(mysqli $link, array $actor, int|string $ref, array $fields): array
{
    $t = (string)$actor['team_id'];
    $result = item_transaction($link, function () use ($link, $t, $ref, $fields): array {
        lock_team_topics_or_throw($link, $t);
        $item = item_locked_or_throw($link, $t, $ref);
        $key = item_patch_locked($link, $t, $item, $fields);
        return ['item_id' => (int)$item['id'], 'key' => $key, 'active_id' => active_item_id($link, $t)];
    });
    notify_team($t);
    return $result;
}

/*
 * item_delete: deletes an item $ref (id or key; open or done) of the actor's team for good. 404 item_not_found,
 * 403 not_a_member. Returns ['item_id', 'active_id']. Notifies the team after the commit.
 */
function core_item_delete(mysqli $link, array $actor, int|string $ref): array
{
    $t = (string)$actor['team_id'];
    $result = item_transaction($link, function () use ($link, $t, $ref): array {
        lock_team_topics_or_throw($link, $t);
        $id = (int)item_locked_or_throw($link, $t, $ref)['id'];
        if (!delete_topic_item($link, $t, $id)) throw new ApiError(404, 'item_not_found');
        return ['item_id' => $id, 'active_id' => active_item_id($link, $t)];
    });
    notify_team($t);
    return $result;
}

/*
 * item_upsert (PUT /api/v1/items/{key}): creates the item $key of the actor's team or changes it - in ONE transaction
 * under the team row lock, so two simultaneous calls with the same key give one item (the second one updates).
 * $fields: heading (required), description (missing = unchanged, null or '' = none), at ('end'|'next', only on create).
 * A done item is not changed: 409 item_closed (reopen it first, like on the board). Errors: 400 invalid_param key,
 * 409 limit_reached, 409 item_closed, 403 not_a_member. Returns ['created' => bool, 'item' => Item (API)].
 * Notifies the team after the commit.
 */
function core_item_upsert(mysqli $link, array $actor, string $key, array $fields): array
{
    $t = (string)$actor['team_id'];
    $result = db_transaction($link, function () use ($link, $t, $key, $fields): array {
        lock_team_topics_or_throw($link, $t);
        $item = load_topic_item_by_key($link, $t, $key);
        if ($item === null) {
            [$id] = item_create_locked($link, $t, ['key' => $key, 'heading' => $fields['heading'],
                                                   'description' => $fields['description'] ?? null,
                                                   'at' => $fields['at'] ?? 'end']);
            $created = true;
        } else {
            if ($item['status'] === 'done') {
                throw new ApiError(409, 'item_closed', null,
                                   'The item is done - reopen it first: POST /items/{key}/reopen');
            }
            $id = (int)$item['id'];
            item_patch_locked($link, $t, $item, array_intersect_key($fields, ['heading' => 1, 'description' => 1]));
            $created = false;
        }
        return ['created' => $created, 'item' => item_api_by_id($link, $t, $id)]; // same snapshot as the write
    });
    notify_team($t);
    return $result;
}

/*
 * item_reopen: a done item $ref (id or key) of the actor's team is open again, at index open_index_for($at) of the
 * open order (distribution, rounds and a chosen result stay, an automatic result is computed again). An item that is
 * open already stays as it is ('reopened' false, no write, no notify; v1 answers 200, topic_item_reopen.php 409
 * not_done). Errors: 404 item_not_found, 409 limit_reached (100 open items), 403 not_a_member.
 * Returns ['item_id', 'active_id', 'reopened', 'item' => Item (API, only if $with_item)].
 */
function core_item_reopen(mysqli $link, array $actor, int|string $ref, string $at = 'end', bool $with_item = false): array
{
    $t = (string)$actor['team_id'];
    $result = item_transaction($link, function () use ($link, $t, $ref, $at, $with_item): array {
        lock_team_topics_or_throw($link, $t);
        $item = item_locked_or_throw($link, $t, $ref);
        $id = (int)$item['id'];
        $reopened = $item['status'] === 'done';
        if ($reopened) {
            $open = topic_item_counts($link, $t)['open'];
            if ($open >= TOPIC_ITEMS_OPEN_MAX) throw new ApiError(409, 'limit_reached', null, 'At most 100 open items per team');
            reopen_topic_item($link, $t, $id, open_index_for($at, $open));
        }
        $out = ['item_id' => $id, 'active_id' => active_item_id($link, $t), 'reopened' => $reopened];
        if ($with_item) $out['item'] = item_api_by_id($link, $t, $id);
        return $out;
    });
    if ($result['reopened']) notify_team($t);
    return $result;
}

/*
 * item_get: the item $key of the actor's team as Item (API), read in one consistent snapshot. 404 item_not_found.
 */
function core_item_get(mysqli $link, array $actor, string $key): array
{
    $t = (string)$actor['team_id'];
    $link->begin_transaction(MYSQLI_TRANS_START_READ_ONLY | MYSQLI_TRANS_START_WITH_CONSISTENT_SNAPSHOT);
    try {
        $item = load_topic_item_by_key($link, $t, $key);
        $out = $item === null ? null : item_api_by_id($link, $t, (int)$item['id']);
    } finally {
        $link->commit();
    }
    if ($out === null) throw new ApiError(404, 'item_not_found');
    return $out;
}

/*
 * item_list: items of the actor's team as Item (API) - $status 'open' (all open items in their order, at most
 * TOPIC_ITEMS_OPEN_MAX), 'done' (newest first, $limit from $offset) or 'all' (both, open first) - with open_count and
 * done_count. One consistent snapshot, the same lists as the board (topic_lists()).
 */
function core_item_list(mysqli $link, array $actor, string $status, int $limit, int $offset): array
{
    $t = (string)$actor['team_id'];
    $catalog = card_catalog();
    $lists = topic_lists($link, $t, $catalog, $status !== 'open', $offset, $limit);
    $entries = [];
    if ($status !== 'done') foreach ($lists['open'] as $i => $item) $entries[] = [$item, $i + 1];
    if ($status !== 'open') foreach ($lists['done'] as $item) $entries[] = [$item, null];
    return ['items' => items_api_out($link, $t, $entries, $catalog), 'open_count' => $lists['open_count'],
            'done_count' => $lists['done_count']];
}

/* ---------- API representation (schema Item of api/v1/routes.php) ---------- */

/*
 * The Item (API) of item $id of team $t, read in the caller's transaction (or snapshot); null if it does not exist.
 * An open item gets its position and the proposal like on the board (open_items_out(); the active one with the cards
 * of the running round while revealed and if the round belongs to it, S1d), a done item its final result.
 */
function item_api_by_id(mysqli $link, string $t, int $id): ?array
{
    $sql = $link->prepare("select " . TOPIC_ITEM_COLUMNS . " from pok_topic_items_tbl where id = ? and team_id = ?");
    $sql->bind_param('is', $id, $t);
    $sql->execute();
    $row = $sql->get_result()->fetch_assoc();
    $sql->close();
    if (!is_array($row)) return null;

    $catalog = card_catalog();
    $position = null;
    if ($row['status'] === 'open') {
        $index = array_search($id, array_keys(open_item_positions($link, $t)), true);
        $position = $index === false ? null : $index + 1;
        $live = ($position === 1 && load_round_item_id($link, $t) === $id) ? revealed_distribution($link, $t) : null;
        $item = open_items_out($link, $t, [$row], $live, $catalog, fn() => team_deck_aim($link, $t, $catalog))[0];
    } else {
        $item = topic_item_out($row, decode_distribution($row['distribution']));
    }
    return items_api_out($link, $t, [[$item, $position]], $catalog)[0];
}

/*
 * Items as delivered by the API. $entries: list of [item as topic_item_out() (result_card_key = the chosen card or the
 * proposal), position (1..n for open items, null for done ones)]. The card texts are read once for all of them.
 */
function items_api_out(mysqli $link, string $t, array $entries, array $catalog): array
{
    $keys = [];
    foreach ($entries as [$item]) {
        foreach (array_keys((array)($item['distribution'] ?? [])) as $key) $keys[(string)$key] = true;
        if ($item['result_card_key'] !== null) $keys[(string)$item['result_card_key']] = true;
    }
    $cards = count($keys) > 0 ? item_card_texts($link, $t, array_keys($keys), $catalog) : [];
    $url = public_board_url($t);
    return array_map(fn(array $entry): array => [
        'key' => (string)$entry[0]['ext_id'],
        'heading' => (string)$entry[0]['heading'],
        'description' => $entry[0]['description'],
        'status' => $entry[0]['status'] === 'done' ? 'done' : 'open',
        'active' => $entry[1] === 1,
        'position' => $entry[1],
        'result' => item_result_out($entry[0], $cards),
        'url' => $url,
    ], $entries);
}

/*
 * Text and order of cards by key, like the export of the board (script/topics.js, topicExportValue()): the text of the
 * card (catalog/custom field value, else heading, else the key) and its sort_order (catalog; custom cards: position).
 * Control cards included; unknown keys are left out (shown as their key).
 */
function item_card_texts(mysqli $link, string $t, array $keys, array $catalog): array
{
    $text = function (array $card): string {
        foreach (['value', 'heading'] as $field) {
            if (is_string($card[$field] ?? null) && $card[$field] !== '') return $card[$field];
        }
        return (string)$card['card_key'];
    };
    $wanted = array_flip(array_map('strval', $keys));
    $cards = [];
    $catalog_cards = $catalog['controls'];
    foreach ($catalog['groups'] as $group) $catalog_cards = array_merge($catalog_cards, $group['cards']);
    foreach ($catalog_cards as $card) {
        if (isset($wanted[$card['card_key']])) $cards[$card['card_key']] = [$text($card), (int)($card['sort_order'] ?? 0)];
    }
    foreach (load_custom_cards_by_key($link, $t, array_keys($wanted), $catalog) as $key => $card) {
        $cards[(string)$key] = [$text($card), (int)$card['sort_order']];
    }
    return $cards;
}

/*
 * The result of an item "like the export" (docs/api-v1-concept.md, 4.4): value (text of the result card, null if
 * none), card_key, chosen (picked by the team), votes of the last revealed round in deck order (text, card_key,
 * count) and as text "5 ×2, 8 ×3", rounds, last_round_date, done_date. null for an open item without any round,
 * distribution or chosen card.
 */
function item_result_out(array $item, array $cards): ?array
{
    $distribution = [];
    foreach ((array)($item['distribution'] ?? []) as $key => $count) {
        if ((int)$count > 0) $distribution[(string)$key] = (int)$count;
    }
    $card_key = $item['result_card_key'] === null ? null : (string)$item['result_card_key'];
    if ($item['status'] !== 'done' && $distribution === [] && $card_key === null && (int)$item['rounds_cnt'] === 0) return null;

    $keys = array_keys($distribution);
    usort($keys, fn(string $a, string $b): int
        => [isset($cards[$a]) ? 0 : 1, $cards[$a][1] ?? 0, $a] <=> [isset($cards[$b]) ? 0 : 1, $cards[$b][1] ?? 0, $b]);
    $value = fn(string $key): string => $cards[$key][0] ?? $key;
    $votes = array_map(fn(string $key): array => ['value' => $value($key), 'card_key' => $key,
                                                  'count' => $distribution[$key]], $keys);
    return [
        'value' => $card_key === null ? null : $value($card_key),
        'card_key' => $card_key,
        'chosen' => $card_key !== null && (int)$item['result_auto'] === 0,
        'votes' => $votes,
        'votes_text' => implode(', ', array_map(fn(array $vote): string => $vote['value'] . ' ×' . $vote['count'], $votes)),
        'rounds' => (int)$item['rounds_cnt'],
        'last_round_date' => $item['last_round_date'],
        'done_date' => $item['done_date'],
    ];
}
