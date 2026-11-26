<?php
/*
 * B-150: core functions of the topic items (docs/api-v1-concept.md, sections 7 and 8). Called by the old endpoints
 * api/topic_item_add.php, topic_item_edit.php, topic_item_delete.php (thin wrappers, topic_core_call()) and later by
 * the v1 router and MCP alike: first parameter the connection, second the actor (needs actor.team_id); no echo, exit,
 * header() or superglobals; errors as ApiError. Requires api/lib.php.
 * Rules (B-155): one transaction per call through db_transaction(); its first statement locks the team row
 * (lock_team_topics_or_throw()); the item key is determined and checked BEFORE the insert/update (SQL in the column
 * collation, item_key_taken()); a duplicate key (1062) despite the lock -> 409 key_taken; writes only through
 * topic_items_write() (topics_rev); notify_team() once after the commit.
 * Input checks of the callers: heading trimmed and not longer than TOPIC_HEADING_MAX, description not longer than
 * TOPIC_DESCRIPTION_MAX, maturity null or 0..TOPIC_MATURITY_MAX. The key is checked here (it needs the database).
 */

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
        $counts = topic_item_counts($link, $t);
        if ($counts['open'] >= TOPIC_ITEMS_OPEN_MAX || $counts['total'] >= TOPIC_ITEMS_TOTAL_MAX)
            throw new ApiError(409, 'limit_reached', null, 'At most 100 open and 1000 items per team');
        $key = item_key_checked_locked($link, $t, $fields['key'] ?? null, 0,
                                       fn(): string => item_key_suggest($link, $t));
        $id = insert_topic_item($link, $t, $key, (string)$fields['heading'], null_if_empty($fields['description'] ?? null),
                                $fields['maturity'] ?? null, open_index_for($fields['at'] ?? 'end', $counts['open']));
        return ['item_id' => $id, 'key' => $key, 'active_id' => active_item_id($link, $t)];
    });
    notify_team($t); // B-81: after the commit, never on error
    return $result;
}

/*
 * item_patch: changes an item (open or done, like the board) of the actor's team. $fields: only the given ones change -
 * heading (string), description (?string, '' or null = none), key (string; '' is refused, except for an old item
 * without a key, which then gets the suggestion), maturity (?int). A key sent unchanged (exactly the stored value) is
 * not checked again, so an item with an old invalid key stays editable until the migration has run.
 * Errors: 404 item_not_found, 400 invalid_param key, 409 key_taken, 403 not_a_member. Returns ['item_id', 'key',
 * 'active_id']. Notifies the team after the commit.
 */
function core_item_patch(mysqli $link, array $actor, int $id, array $fields): array
{
    $t = (string)$actor['team_id'];
    $result = item_transaction($link, function () use ($link, $t, $id, $fields): array {
        lock_team_topics_or_throw($link, $t);
        $item = load_topic_item($link, $t, $id);
        if ($item === null) throw new ApiError(404, 'item_not_found');
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
        return ['item_id' => $id, 'key' => $key, 'active_id' => active_item_id($link, $t)];
    });
    notify_team($t);
    return $result;
}

/*
 * item_delete: deletes an item (open or done) of the actor's team for good. 404 item_not_found, 403 not_a_member.
 * Returns ['item_id', 'active_id']. Notifies the team after the commit.
 */
function core_item_delete(mysqli $link, array $actor, int $id): array
{
    $t = (string)$actor['team_id'];
    $result = item_transaction($link, function () use ($link, $t, $id): array {
        lock_team_topics_or_throw($link, $t);
        if (!delete_topic_item($link, $t, $id)) throw new ApiError(404, 'item_not_found');
        return ['item_id' => $id, 'active_id' => active_item_id($link, $t)];
    });
    notify_team($t);
    return $result;
}
