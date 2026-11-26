<?php
/*
 * B-150: core functions about the team (docs/api-v1-concept.md, section 8). Called by the v1 router
 * (api/v1/lib_v1.php) and later by old endpoints and MCP alike: first parameter the connection, second the actor
 * (['uid', 'team_id', 'role', 'via', 'key_id'] from the router's authentication), no echo, exit, header() or
 * superglobals; errors as ApiError. Requires api/lib.php. Defines functions only, a direct call does nothing.
 */

/*
 * Link to the board of team $t: relative ('/?t=...') or, if config.php defines _PUBLIC_BASE_URL (e.g.
 * 'https://poker.komplexitaeter.de'), absolute with it. Never built from the Host header.
 */
function public_board_url(string $t): string
{
    $base = defined('_PUBLIC_BASE_URL') ? rtrim((string)constant('_PUBLIC_BASE_URL'), '/') : '';
    return $base . '/?t=' . rawurlencode($t);
}

/* player_type of pok_players_tbl -> role of the API (Member.role) */
function api_member_role(string $player_type): string
{
    return match ($player_type) {
        'PLAYER' => 'player',
        'OBSERVER' => 'observer',
        default => 'removed',
    };
}

/*
 * team_get: the actor's team (id, name, link, note), the actor (name, role) and the item counts with the key of the
 * active item. Reads only, never notifies. Separate autocommit reads: a write in between can make the counts and the
 * active key differ by one change, which is fine for an overview.
 */
function core_team_get(mysqli $link, array $actor): array
{
    $t = (string)$actor['team_id'];

    $sql = $link->prepare("select name, topic from pok_teams_tbl where id = ?");
    $sql->bind_param('s', $t);
    $sql->execute();
    $team = $sql->get_result()->fetch_assoc();
    $sql->close();
    if (!is_array($team)) throw new ApiError(403, 'not_a_member'); // team deleted since the authentication

    $sql = $link->prepare("select name, player_type from pok_players_tbl where team_id = ? and id = ?");
    $uid = (string)$actor['uid'];
    $sql->bind_param('ss', $t, $uid);
    $sql->execute();
    $member = $sql->get_result()->fetch_assoc();
    $sql->close();
    if (!is_array($member)) throw new ApiError(403, 'not_a_member');

    $counts = topic_item_counts($link, $t);
    $sql = $link->prepare("select ext_id from pok_topic_items_tbl
                            where team_id = ? and status = 'open' order by position, id limit 1");
    $sql->bind_param('s', $t);
    $sql->execute();
    $active = $sql->get_result()->fetch_row();
    $sql->close();
    $active_key = (is_array($active) && $active[0] !== null && $active[0] !== '') ? (string)$active[0] : null;

    return [
        'team' => ['id' => $t, 'name' => (string)$team['name'], 'url' => public_board_url($t),
                   'note' => (string)($team['topic'] ?? '')],
        'member' => ['name' => (string)$member['name'], 'role' => api_member_role((string)$member['player_type'])],
        'items' => ['open_count' => $counts['open'], 'done_count' => $counts['total'] - $counts['open'],
                    'active_key' => $active_key],
    ];
}


/* role of the API (team_create/team_join) -> player_type */
function api_player_type(string $role): string
{
    return $role === 'observer' ? 'OBSERVER' : 'PLAYER';
}

/*
 * A new person in team $t, inside the caller's transaction (team row created or locked before: lock order teams ->
 * players -> keys): server-made UID (new_uid()), the player row with the B-102 rule and the user row like name.php
 * (insert_new_player()), then the key.
 * - REST ($key_name given): the UID is never delivered - the person exists only through its key. Returns
 *   ['api_key', 'member'].
 * - MCP (B-151, $key_name null): no key; the seat is the UID, which goes back to the agent like uid.php gives it to a
 *   browser. Returns ['uid', 'member'].
 */
function team_member_locked(mysqli $link, string $t, string $name, string $role, ?string $key_name): array
{
    $uid = new_uid();
    insert_new_player($link, $t, $uid, $name, api_player_type($role));
    $member = ['name' => $name, 'role' => $role];
    if ($key_name === null) return ['uid' => $uid, 'member' => $member];
    $key = api_key_insert_locked($link, $uid, $t, $key_name);
    return ['api_key' => $key['key'], 'member' => $member];
}

/* the JoinResult in its documented order: api_key (or uid), team, member */
function joined_with_team(array $joined, array $team): array
{
    $member = $joined['member'];
    unset($joined['member']);
    return $joined + ['team' => $team, 'member' => $member];
}

/*
 * team_create (auth none): a new team (id after B-156 via add_team()/new_team_id(), default deck like the web or, for
 * MCP, the catalog variant $variant_id), the creator joins it with name and role - all in one transaction. With
 * $key_name (REST) the creator gets an API key, without (B-151 MCP create_team) the seat's UID. No notify: nobody has
 * the new board open yet. Returns the JoinResult (api_key, team, member) or, without key, uid, team, member.
 */
function core_team_create(mysqli $link, string $name, string $member_name, string $member_role, ?string $key_name,
                          ?string $variant_id = null): array
{
    return db_transaction($link, function () use ($link, $name, $member_name, $member_role, $key_name, $variant_id): array {
        $t = add_team($link, $name, null, null, $variant_id);
        if ($t === '') throw new RuntimeException('B-150: team not created');
        $joined = team_member_locked($link, $t, $member_name, $member_role, $key_name);
        return joined_with_team($joined, ['id' => $t, 'name' => $name, 'url' => public_board_url($t), 'note' => '']);
    });
}

/*
 * team_join (auth none): a NEW person in team $t (every call, the caller keeps the key or UID), with name and role,
 * and with $key_name its API key (REST) or, without (B-151 MCP join_team, like a new browser), its UID. Unknown team ->
 * 404 team_not_found (only here; a team id is the board link anyway, B-156 makes it hard to guess). The team row is
 * locked first (B-155), so the B-102 check sees a stable round. Notifies the team after the commit (the new person
 * appears on open boards). Returns the JoinResult (api_key, team, member) or, without key, uid, team, member.
 */
function core_team_join(mysqli $link, string $t, string $name, string $role, ?string $key_name): array
{
    $result = db_transaction($link, function () use ($link, $t, $name, $role, $key_name): array {
        $sql = $link->prepare("select name, topic from pok_teams_tbl where id = ? for update");
        $sql->bind_param('s', $t);
        $sql->execute();
        $team = $sql->get_result()->fetch_assoc();
        $sql->close();
        if (!is_array($team)) throw new ApiError(404, 'team_not_found');
        $joined = team_member_locked($link, $t, $name, $role, $key_name);
        return joined_with_team($joined, ['id' => $t, 'name' => (string)$team['name'], 'url' => public_board_url($t),
                                          'note' => (string)($team['topic'] ?? '')]);
    });
    notify_team($t); // B-81: after the commit, never on error
    return $result;
}

/*
 * team_note_set: the team note (formerly "topic", pok_teams_tbl.topic), '' empties it. $note is checked by the caller
 * (v1: trimmed, at most 2000 characters, refused above; update_topic.php: cut like before). Notifies the team.
 * Shared by PUT /api/v1/team/note and api/update_topic.php (needs only actor.team_id).
 */
function core_team_note_set(mysqli $link, array $actor, string $note): array
{
    $t = (string)$actor['team_id'];
    db_transaction($link, function () use ($link, $t, $note): void {
        $sql = $link->prepare("update pok_teams_tbl set topic = ? where id = ?");
        $sql->bind_param('ss', $note, $t);
        $sql->execute();
        $sql->close();
    });
    notify_team($t);
    return ['note' => $note];
}

/*
 * B-151 (MCP PR E) team_settings_patch: the team settings of the board's settings menu, shared by update_team.php,
 * update_results_order.php, update_show_avg.php and MCP board_settings. $fields, only the given ones change:
 * name (string, not empty), anonymous (bool), results_order ('NAME' | 'SEQUENCE'), show_avg (bool), show_tips (bool),
 * show_card_changes (bool). The caller checks the values.
 * anonymous and show_card_changes belong to a round: while no player has a card down they apply at once, otherwise
 * from the next round (start_new_round() copies them). Switched off, show_card_changes also clears an original card
 * left from an "on" phase of the same round (B-115). One transaction, the team row locked first (then players, B-155).
 * Unknown team -> 403 not_a_member. Notifies the team after the commit if anything changed; returns whether it did.
 */
function core_team_settings_patch(mysqli $link, array $actor, array $fields): bool
{
    $t = (string)$actor['team_id'];
    $changed = db_transaction($link, function () use ($link, $t, $fields): bool {
        $sql = $link->prepare("select id from pok_teams_tbl where id = ? for update");
        $sql->bind_param('s', $t);
        $sql->execute();
        $found = $sql->get_result()->fetch_row() !== null;
        $sql->close();
        if (!$found) throw new ApiError(403, 'not_a_member');

        $changed = false;
        $update = function (string $statement, string $types, mixed ...$params) use ($link, &$changed): void {
            $sql = $link->prepare($statement);
            $sql->bind_param($types, ...$params);
            $sql->execute();
            if ($sql->affected_rows > 0) $changed = true;
            $sql->close();
        };
        // no card of a player down = the round has not started: round settings apply at once
        $no_cards = "(select count(1) from pok_players_tbl p2
                       where p2.team_id = t.id and p2.card_key is not null and p2.player_type = 'PLAYER') = 0";
        if (isset($fields['name'])) {
            $update("update pok_teams_tbl t set t.name = ? where t.id = ?", 'ss', (string)$fields['name'], $t);
        }
        if (isset($fields['anonymous'])) {
            $anonymous = $fields['anonymous'] ? 1 : 0;
            $update("update pok_teams_tbl t
                        set t.anonymous_request_toggle = ?
                           ,t.anonymous_mode = if($no_cards, t.anonymous_request_toggle, t.anonymous_mode)
                      where t.id = ?", 'is', $anonymous, $t);
        }
        if (isset($fields['results_order'])) {
            $update("update pok_teams_tbl t set t.results_order = ? where t.id = ?", 'ss', (string)$fields['results_order'], $t);
        }
        if (isset($fields['show_avg'])) {
            $update("update pok_teams_tbl t set t.show_avg = ? where t.id = ?", 'is', $fields['show_avg'] ? 1 : 0, $t);
        }
        if (isset($fields['show_tips'])) {
            $update("update pok_teams_tbl t set t.show_tips = ? where t.id = ?", 'is', $fields['show_tips'] ? 1 : 0, $t);
        }
        if (isset($fields['show_card_changes'])) {
            $on = $fields['show_card_changes'] ? 1 : 0;
            $update("update pok_teams_tbl t
                        set t.show_card_changes = ?
                           ,t.round_show_card_changes = if($no_cards, ?, t.round_show_card_changes)
                      where t.id = ?", 'iis', $on, $on, $t);
            $sql = $link->prepare("update pok_players_tbl p
                                     join pok_teams_tbl t on t.id = p.team_id
                                      set p.original_card_key = null
                                    where p.team_id = ?
                                      and t.round_show_card_changes = 0
                                      and p.original_card_key is not null");
            $sql->bind_param('s', $t);
            $sql->execute();
            $sql->close();
        }
        return $changed;
    });
    if ($changed) notify_team($t); // B-81: after the commit, never on error
    return $changed;
}
