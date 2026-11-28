<?php
/*
 * B-151 (MCP PR D): core functions of the own seat and the round (docs/mcp-concept.md, tools play_card, round, me),
 * shared by the old endpoints (setc.php, newround.php, delete.php, name.php, delete_user.php - thin wrappers with
 * unchanged answers) and the routes of api/v1/routes.php (MCP). Same rules as api/lib_core_*.php: first parameter the
 * connection, then the actor (['uid', 'team_id', 'role', 'via', 'key_id']); no echo, exit, header() or superglobals;
 * errors as ApiError; prepared statements only (B-137). Every write notifies the team after the commit, never on
 * error. Requires api/lib.php (and api/lib_api_keys.php for core_user_delete()); the board resolvers at the end need
 * api/lib_core_board.php. Defines functions only, a direct call does nothing.
 */

/*
 * card_set (setc.php, MCP play_card): the actor's card in the running round, $card_key null takes it back.
 * B-103: a key that is neither in the team's deck nor in its active control cards -> 400 invalid_card, nothing written;
 * B-102: the system card "joined in" (LATE_CARD_KEY) is never picked. B-104/B-115: a change after the reveal keeps the
 * card of the reveal as original_card_key (first change only, back to it -> null) while "See changed cards" is on for
 * the round. B-52 S1d: the first card of a round decides the topic item of the round.
 * $players_only (B-152, everything but setc.php until BE-2): only a PLAYER may play or take back a card, an observer or
 * a removed person gets 403 role_not_allowed, a seat that is gone 403 not_a_member. setc.php passes false and keeps
 * its old behaviour (an unknown person changes nothing, an observer row is written as before).
 * Lock order as newround.php/update_deck.php: team row first (lock_team_deck()), then players.
 */
function core_card_set(mysqli $link, array $actor, ?string $card_key, bool $players_only = true): void
{
    $t = (string)$actor['team_id'];
    $id = (string)$actor['uid'];
    if ($card_key === LATE_CARD_KEY) throw new ApiError(400, 'invalid_card', 'card', 'card: not in the card set of the team');

    db_transaction($link, function () use ($link, $t, $id, $card_key, $players_only): void {
        // locks the team row and reads the team's deck, lazy migration included (B-103)
        $catalog = card_catalog();
        $team = lock_team_deck($link, $t, $catalog);
        if ($team === null) throw new ApiError(403, 'not_a_member'); // team deleted in between
        // B-103: only cards of the team's deck or its active control cards; taking the card back is always allowed
        if ($card_key !== null && !deck_allows_card($team['deck'], $card_key, $catalog)) {
            throw new ApiError(400, 'invalid_card', 'card', 'card: not in the card set of the team');
        }

        $sql = $link->prepare("select count(1) players_cnt, count(card_key) cards_cnt from pok_players_tbl
                                where team_id = ? and player_type = 'PLAYER'");
        $sql->bind_param('s', $t);
        $sql->execute();
        $counts = $sql->get_result()->fetch_object();
        $sql->close();
        // B-115: read with the lock on the team row (lock_team_deck()), so it cannot change during this transaction
        $keep_original = (int)$team['round_show_card_changes'] === 1;
        $revealed = $keep_original && $counts !== null && (int)$counts->players_cnt > 0
            && (int)$counts->players_cnt === (int)$counts->cards_cnt;

        $sql = $link->prepare("select card_key, original_card_key, player_type from pok_players_tbl
                                where id = ? and team_id = ? for update");
        $sql->bind_param('ss', $id, $t);
        $sql->execute();
        $me = $sql->get_result()->fetch_object();
        $sql->close();

        if ($me === null) {
            if ($players_only) throw new ApiError(403, 'not_a_member');
            return;
        }
        if ($players_only && $me->player_type !== 'PLAYER') {
            throw new ApiError(403, 'role_not_allowed', null, $me->player_type === 'OBSERVER'
                ? 'Observers cannot play cards. Switch to player first (me, action set_role) if the user wants to vote.'
                : 'You are no longer at the table. Ask the user whether to come back as player (me, action set_role).');
        }

        $original = $me->original_card_key;
        if (!$keep_original) {
            $original = null; // B-115: never an original in a round with "See changed cards" off (no leftover either)
        } else if ($card_key !== null && $card_key === $original) {
            $original = null; // back to the card of the reveal
        } else if ($revealed && $me->player_type === 'PLAYER' && $original === null && $me->card_key !== null
                   && $me->card_key !== LATE_CARD_KEY && $card_key !== $me->card_key) {
            $original = $me->card_key; // first change after the reveal (also taking the card back)
        }
        /* B-52 S1d: the first card of a round decides the topic item the round belongs to (the active one now). A
           missing column (code deployed before the schema) must not break the card; anything else is rethrown. */
        if ($card_key !== null && $me->player_type === 'PLAYER') {
            try {
                round_item_on_first_card($link, $t, $id, $me->card_key);
            } catch (mysqli_sql_exception $e) {
                if (!is_missing_schema_error($e)) throw $e;
                error_log('poker card: topic item of the round not stored: ' . $e->getMessage());
            }
        }
        $sql = $link->prepare("update pok_players_tbl set card_key = ?, original_card_key = ? where id = ? and team_id = ?");
        $sql->bind_param('ssss', $card_key, $original, $id, $t);
        $sql->execute();
        $sql->close();
    });
    notify_team($t); // B-81: after the commit, never on error
}

/*
 * round_new (newround.php, MCP round new_round): snapshot of the round, all cards up (start_new_round()). Team row
 * locked first like update_deck.php (B-98 S2), so a parallel deck change and "New round" run one after the other.
 */
function core_round_new(mysqli $link, array $actor): void
{
    $t = (string)$actor['team_id'];
    db_transaction($link, function () use ($link, $t): void {
        $sql = $link->prepare("select id from pok_teams_tbl where id = ? for update");
        $sql->bind_param('s', $t);
        $sql->execute();
        $found = $sql->get_result()->fetch_row() !== null;
        $sql->close();
        if (!$found) throw new ApiError(403, 'not_a_member'); // team deleted in between
        start_new_round($link, $t);
    });
    notify_team($t);
}

/*
 * member_remove (delete.php, MCP round remove_player): takes the player with $mkey off the table (REMOVED, card up).
 * B-110: only players; an observer, a removed person or an unknown mkey -> 404 player_not_found, nothing notified.
 * B-152: every registered person may remove others (also a removed one). B-151 self leave: the own mkey counts as
 * leaving by oneself (mark set), anybody else's clears the mark of that seat.
 * B-159: anonymous mode after the reveal: only the own seat (others -> 404 player_not_found, like MCP board_player()),
 * else a mkey remembered from before the reveal would tell its card when it disappears. One transaction, team row
 * locked first (B-155), so the self-left mark cannot get lost against a parallel wait_for_change (seat_states_store()).
 */
function core_member_remove(mysqli $link, array $actor, int $mkey): void
{
    $t = (string)$actor['team_id'];
    $uid = (string)$actor['uid'];
    db_transaction($link, function () use ($link, $t, $uid, $mkey): void {
        $sql = $link->prepare("select anonymous_mode from pok_teams_tbl where id = ? for update");
        $sql->bind_param('s', $t);
        $sql->execute();
        $team = $sql->get_result()->fetch_row();
        $sql->close();
        if ($team === null) throw new ApiError(404, 'player_not_found'); // team deleted in between

        $sql = $link->prepare("select id from pok_players_tbl where team_id = ? and mkey = ? and player_type = 'PLAYER' for update");
        $sql->bind_param('si', $t, $mkey);
        $sql->execute();
        $row = $sql->get_result()->fetch_row();
        $sql->close();
        if ($row === null) throw new ApiError(404, 'player_not_found');
        $id = (string)$row[0];
        $self = $uid !== '' && $id === $uid;

        if ((int)$team[0] === 1 && !$self) {
            // revealed = every player has a card (as getDao()); read under the lock on the team row
            $sql = $link->prepare("select count(1), count(card_key) from pok_players_tbl where team_id = ? and player_type = 'PLAYER'");
            $sql->bind_param('s', $t);
            $sql->execute();
            [$players, $cards] = $sql->get_result()->fetch_row();
            $sql->close();
            if ((int)$players > 0 && (int)$players === (int)$cards) throw new ApiError(404, 'player_not_found');
        }

        // B-163: anonymous mode after the reveal (only the own seat gets here then): the card stays until the next round
        $sql = $link->prepare(keep_anon_card($link, $t, $id)
            ? "update pok_players_tbl set player_type = 'REMOVED' where team_id = ? and mkey = ? and player_type = 'PLAYER'"
            : "update pok_players_tbl set player_type = 'REMOVED', card_key = null, original_card_key = null
                where team_id = ? and mkey = ? and player_type = 'PLAYER'");
        $sql->bind_param('si', $t, $mkey);
        $sql->execute();
        $sql->close();
        // B-151 self leave: removing the own seat (trash can on the own card, remove_player with the own mkey) is a leave
        seat_mark_self_left($link, $id, $t, $self);
    });
    notify_team($t); // after the commit, never on error
}

/*
 * member_update (name.php for a registered person, MCP me rename/set_role): name and/or player type ('PLAYER' or
 * 'OBSERVER') of the actor's seat, null = unchanged. A removed person who only renames stays removed.
 * B-102: becoming (or staying) a player while every PLAYER of the team has a card down (cards revealed; a team without
 * players counts as not ready) gives a person without card the system card LATE_CARD_KEY; a card already down is kept
 * (B-33). Seat gone -> 403 not_a_member.
 */
function core_member_update(mysqli $link, array $actor, ?string $name, ?string $player_type): void
{
    $t = (string)$actor['team_id'];
    $id = (string)$actor['uid'];
    db_transaction($link, function () use ($link, $t, $id, $name, $player_type): void {
        $me = member_lock($link, $t, $id);
        $name ??= (string)$me['name'];
        if ($player_type === null && $me['player_type'] === 'REMOVED') {
            $sql = $link->prepare("update pok_players_tbl set name = ? where id = ? and team_id = ?");
            $sql->bind_param('sss', $name, $id, $t);
        } else {
            $player_type ??= (string)$me['player_type'];
            if ($player_type === 'PLAYER') {
                $sql = $link->prepare("select if (count(1) = sum(if(p.card_key is not null,1,0)), 1, 0) all_players_ready
                                         from pok_players_tbl p
                                        where p.team_id = ?
                                          and p.player_type = 'PLAYER'");
                $sql->bind_param('s', $t);
                $sql->execute();
                $all_players_ready = (int)$sql->get_result()->fetch_object()->all_players_ready;
                $sql->close();
                $late_card = LATE_CARD_KEY;
                $sql = $link->prepare("update pok_players_tbl
                                          set name = ?,
                                              player_type = ?,
                                              card_key = if(? = 1 and card_key is null, ?, card_key)
                                        where id = ? and team_id = ?");
                $sql->bind_param('ssisss', $name, $player_type, $all_players_ready, $late_card, $id, $t);
            } else {
                // B-163: a player becoming an observer in anonymous mode after the reveal: his card stays on the table
                if ($me['player_type'] === 'PLAYER') keep_anon_card($link, $t, $id);
                $sql = $link->prepare("update pok_players_tbl set name = ?, player_type = ? where id = ? and team_id = ?");
                $sql->bind_param('ssss', $name, $player_type, $id, $t);
            }
        }
        $sql->execute();
        $sql->close();
        // B-151 self leave: back at the table (set_role) - the mark of an own leave goes
        if ($player_type !== null || $me['player_type'] !== 'REMOVED') seat_mark_self_left($link, $id, $t, false);
        // the user row (settings, first-seen date) for rows from before #282, like name.php
        ensure_user_row($link, $id);
    });
    notify_team($t);
}

/*
 * member_leave (name.php with an empty name, MCP me leave): the actor gets up from this table - REMOVED, card up, name
 * kept, marked as left by itself (seat_mark_self_left(), board you.left_by_self); coming back works with member_update
 * (player or observer). Seat gone -> 403 not_a_member.
 */
function core_member_leave(mysqli $link, array $actor): void
{
    $t = (string)$actor['team_id'];
    $id = (string)$actor['uid'];
    db_transaction($link, function () use ($link, $t, $id): void {
        member_lock($link, $t, $id);
        // B-163: anonymous mode after the reveal: the card stays on the table until the next round
        $sql = $link->prepare(keep_anon_card($link, $t, $id)
            ? "update pok_players_tbl set player_type = 'REMOVED' where id = ? and team_id = ?"
            : "update pok_players_tbl set player_type = 'REMOVED', card_key = null, original_card_key = null
                where id = ? and team_id = ?");
        $sql->bind_param('ss', $id, $t);
        $sql->execute();
        $sql->close();
        seat_mark_self_left($link, $id, $t, true); // B-151 self leave: "You left the table.", no alarm in the live board
    });
    notify_team($t);
}

/*
 * B-151 end session (MCP me end_session, POST /me/end-session): like closing the browser tab - the seat counts as not
 * connected at once and the live views of the seat stop (end_mcp_session()). The seat, its role, card and keys stay;
 * the next call of the seat connects it again.
 */
function core_member_end_session(mysqli $link, array $actor): void
{
    end_mcp_session($link, (string)$actor['uid'], (string)$actor['team_id']);
    notify_team((string)$actor['team_id']);
}

/* team row, then the actor's player row locked (lock order teams -> players); either gone -> 403 not_a_member */
function member_lock(mysqli $link, string $t, string $id): array
{
    $sql = $link->prepare("select id from pok_teams_tbl where id = ? for update");
    $sql->bind_param('s', $t);
    $sql->execute();
    $team = $sql->get_result()->fetch_row();
    $sql->close();
    if ($team === null) throw new ApiError(403, 'not_a_member');
    $sql = $link->prepare("select name, player_type from pok_players_tbl where id = ? and team_id = ? for update");
    $sql->bind_param('ss', $id, $t);
    $sql->execute();
    $me = $sql->get_result()->fetch_assoc();
    $sql->close();
    if (!is_array($me)) throw new ApiError(403, 'not_a_member');
    return $me;
}

/*
 * user_delete (delete_user.php "Delete my data", MCP me delete_my_data): the person and everything it wrote, in ALL
 * teams (feedback, round details, votes, seats, API keys, user row). Not with an API key (decision 8 of the MCP
 * concept): the key stands for the user's browser seat, deleting would wipe the user's identity in all teams, also in
 * the browser -> 403 browser_only. Notifies every team the person sat in. Returns the number of those teams.
 */
function core_user_delete(mysqli $link, array $actor): int
{
    if (($actor['via'] ?? '') === 'key') {
        throw new ApiError(403, 'browser_only', null, 'Not possible with an API key: the key stands for the user\'s '
            . 'browser seat, and deleting would wipe the user\'s identity in all their teams, including their browser. '
            . 'Offer instead: end_session (gone like a closed tab), leave (stop playing, stay as observer) or '
            . 'delete_key with key_id "current" (ends your access). '
            . 'To delete all their data, the user uses "Delete my data" in the You menu of the board in the browser.');
    }
    $id = (string)$actor['uid'];

    // B-81: the user is removed from all teams, so every board of these teams has to reload. Read the teams before the
    // DELETE, afterwards they are gone.
    $team_ids = [];
    $sql = $link->prepare("select distinct team_id from pok_players_tbl where id = ?");
    $sql->bind_param('s', $id);
    $sql->execute();
    foreach ($sql->get_result()->fetch_all() as $row) $team_ids[] = (string)$row[0];
    $sql->close();

    foreach (["delete from pok_feedback_tbl where id = ?",
              "delete from pok_roundstat_details_tbl where player_id = ?",
              "delete from pok_survey_votes_tbl where user_id = ?",
              "delete from pok_roadmap_votes_tbl where user_id = ?",
              "delete from pok_players_tbl where id = ?"] as $statement) {
        $sql = $link->prepare($statement);
        $sql->bind_param('s', $id);
        $sql->execute();
        $sql->close();
    }
    // B-150: the API keys of the user over all teams, AFTER the player rows: a key_create running at the same time
    // either finished before (its key is deleted here) or finds no player row any more (403), so no key is left behind
    api_keys_delete_user($link, $id);
    $sql = $link->prepare("delete from pok_user_tbl where id = ?");
    $sql->bind_param('s', $id);
    $sql->execute();
    $sql->close();

    notify_teams($team_ids);
    return count($team_ids);
}

/* ---------- board resolvers (MCP: what the agent names -> keys; need lib_core_board.php) ---------- */

/*
 * The card key for $card as the agent names it: the key, else the value as shown on the board (exact, then ignoring
 * case), searched in the deck and the active control cards of the board. Unknown -> 400 invalid_card listing the
 * valid values. core_card_set() checks the key again under the lock.
 */
function board_card_key(array $board, string $card): string
{
    $cards = $board['deck'] === null ? [] : array_merge($board['deck']['cards'], $board['deck']['controls']);
    foreach ($cards as $c) if ($c['key'] === $card) return $c['key'];
    foreach ($cards as $c) if ((string)$c['value'] === $card) return $c['key'];
    foreach ($cards as $c) if (mb_strtolower((string)$c['value']) === mb_strtolower($card)) return $c['key'];
    throw new ApiError(400, 'invalid_card', 'card', 'card: not in the card set of the team. Valid: '
        . implode(', ', array_map(fn($c) => '"' . $c['value'] . '"', $cards)));
}

/*
 * The player $player names: mkey (digits) of a player on the board, else the exact name of exactly one player.
 * Returns [mkey, name]. Only people the board shows can be named (anonymous mode after the reveal hides the mkeys of
 * others, so nobody can be matched to a card by removing them). Several players with this name -> 400 invalid_param (pass the mkey), none -> 404 player_not_found.
 */
function board_player(array $board, string $player): array
{
    $digits = preg_match('/^\d{1,10}$/D', $player) === 1;
    if ($digits) {
        foreach ($board['players'] as $p) if ($p['mkey'] !== null && (string)$p['mkey'] === $player) return [(int)$player, $p['name']];
    }
    $named = array_values(array_filter($board['players'], fn($p) => $p['name'] === $player && $p['mkey'] !== null));
    if (count($named) === 1) return [(int)$named[0]['mkey'], $named[0]['name']];
    if (count($named) > 1) {
        throw new ApiError(400, 'invalid_param', 'player', 'player: several players have this name, pass the mkey');
    }
    throw new ApiError(404, 'player_not_found');
}
