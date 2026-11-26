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
