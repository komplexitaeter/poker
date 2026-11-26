<?php
/*
 * B-150: core functions of the API key management (docs/api-v1-concept.md, section 5.5). A key belongs to ONE person in
 * ONE team: every query is limited to user_id = actor.uid and team_id = actor.team_id, a foreign key id gives
 * 404 key_not_found (no hint that it exists). Key management never notifies (no effect on the board).
 * Same rules as api/lib_core_team.php: first parameter the connection, then the actor; no echo, exit, header() or
 * superglobals; errors as ApiError. Requires api/lib.php and api/lib_api_keys.php.
 */

/* key_create (board only, auth browser): a new key of the actor; the plain key is in this answer only */
function core_key_create(mysqli $link, array $actor, string $name): array
{
    $uid = (string)$actor['uid'];
    $t = (string)$actor['team_id'];
    return db_transaction($link, function () use ($link, $uid, $t, $name): array {
        // lock order teams -> players -> keys: the player row first, so two creations count one after the other
        $sql = $link->prepare("select player_type from pok_players_tbl where id = ? and team_id = ? for update");
        $sql->bind_param('ss', $uid, $t);
        $sql->execute();
        $found = is_array($sql->get_result()->fetch_row());
        $sql->close();
        if (!$found) throw new ApiError(403, 'not_a_member'); // deleted since the authentication
        return api_key_insert_locked($link, $uid, $t, $name);
    });
}

/* key_list: the actor's own keys in the actor's team, newest first; current = the key of this request */
function core_key_list(mysqli $link, array $actor): array
{
    $uid = (string)$actor['uid'];
    $t = (string)$actor['team_id'];
    $current = $actor['key_id'] ?? null;
    $sql = $link->prepare("select id, name, key_hint, unix_timestamp(creation_date) created_ts,
                                  unix_timestamp(last_used_date) last_used_ts
                             from pok_api_keys_tbl
                            where user_id = ? and team_id = ?
                            order by id desc");
    $sql->bind_param('ss', $uid, $t);
    $sql->execute();
    $keys = [];
    foreach ($sql->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $keys[] = ['id' => (int)$row['id'], 'name' => (string)$row['name'], 'hint' => (string)$row['key_hint'],
                   'created' => iso_utc($row['created_ts']), 'last_used' => iso_utc($row['last_used_ts']),
                   'current' => $current !== null && (int)$row['id'] === (int)$current];
    }
    $sql->close();
    return ['keys' => $keys];
}

/* key_delete: one of the actor's own keys (also the current one); unknown or foreign -> 404 key_not_found */
function core_key_delete(mysqli $link, array $actor, int $id): void
{
    $uid = (string)$actor['uid'];
    $t = (string)$actor['team_id'];
    $deleted = db_transaction($link, function () use ($link, $uid, $t, $id): int {
        $sql = $link->prepare("delete from pok_api_keys_tbl where id = ? and user_id = ? and team_id = ?");
        $sql->bind_param('iss', $id, $uid, $t);
        $sql->execute();
        $n = (int)$sql->affected_rows;
        $sql->close();
        return $n;
    });
    if ($deleted === 0) throw new ApiError(404, 'key_not_found');
}

/* key_delete_current: the key this request came with ("I stop"); only in key mode, the board has no current key */
function core_key_delete_current(mysqli $link, array $actor): void
{
    if (($actor['via'] ?? '') !== 'key' || ($actor['key_id'] ?? null) === null) {
        throw new ApiError(400, 'invalid_param', null, 'Only with an API key: the board has no current key.');
    }
    core_key_delete($link, $actor, (int)$actor['key_id']);
}
