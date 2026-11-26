<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$id = get_uid(); // B-152: header X-Poker-User, transitionally body uid or URL id
// a missing or manipulated id must not create a player with an empty id (B-88); get_uid() is '' below 10 characters
if ($id === '') exit;
$name = get_text_param("name", 15);
$type = get_text_param("type", 10);

$link = db_init();
require_team($t, $link);

if (strtolower($type) !== "observer") {
    $type = 'PLAYER';
} else {
    $type = 'OBSERVER';
}


$is_in_db=false;

$sql = $link->prepare('SELECT count(1) cnt FROM pok_players_tbl WHERE id = ? and team_id = ?');
$sql->bind_param('ss', $id, $t);
$sql->execute();

if ($result = $sql->get_result()) {
    $obj = $result->fetch_object();
    if ($obj->cnt >= 1) $is_in_db=true;
    $result->close();
}

if ($is_in_db) {
    if (strlen($name) == 0) {
        $sql = $link->prepare("UPDATE pok_players_tbl set player_type = 'REMOVED', card_key = null, original_card_key = null WHERE id = ? and team_id = ?");
        $sql->bind_param('ss', $id, $t);
    } else if ($type == 'PLAYER') {
        /* B-102: an existing user becomes (or stays) a player. If every PLAYER of the team already has a card down
           (all_players_ready = 1, i.e. the cards are revealed; a team without players counts as not ready) and the
           user has no card yet, he gets the system card LATE_CARD_KEY (before B-102: break01) so the revealed round
           is not covered again. A card already down is kept (B-33). */
        $sql = $link->prepare("SELECT if (count(1) = sum(if(p.card_key is not null,1,0)), 1, 0) all_players_ready
                                  FROM pok_players_tbl p
                                 WHERE p.team_id = ?
                                   AND p.player_type = 'PLAYER';");
        $sql->bind_param('s',$t);
        $sql->execute();

        $result = $sql->get_result();
        $obj = $result->fetch_object();

        $sql = $link->prepare("UPDATE pok_players_tbl ppt 
                                        set ppt.name = ?,
                                            ppt.player_type = ?, 
                                            ppt.card_key = if(? = 1 and card_key is null, ?, card_key)
                                      WHERE ppt.id = ? and ppt.team_id = ?");
        $late_card = LATE_CARD_KEY;
        $sql->bind_param('ssisss', $name, $type, $obj->all_players_ready, $late_card, $id, $t);
    }  else {
        $sql = $link->prepare("UPDATE pok_players_tbl set name = ?, player_type = ? WHERE id = ? and team_id = ?");
        $sql->bind_param('ssss', $name, $type, $id, $t);
    }
}
else {
    // B-152: a new person needs a name (an empty name only removes an existing one from the board, see above)
    if (strlen($name) == 0) {
        $link->close();
        http_response_code(400);
        exit;
    }

    // B-102 rule ("joined in" card while the cards are revealed) and the user row: insert_new_player() in lib.php,
    // shared with the API (B-150 team_create/team_join)
    try {
        insert_new_player($link, $t, $id, $name, $type);
    } catch (mysqli_sql_exception $e) {
        // a double submit of the same join: the other request registered the UID a moment ago, so this join is done
        // too. Quiet on purpose: the message of 1062 contains the UID, which must never reach a log.
        if ($e->getCode() !== 1062) throw $e;
    }
    $sql = null;
}

if ($sql !== null) $sql->execute();

/* The user row (ensure_user_row() in lib.php) is created on joining, not by dao.php. A new person got it from
   insert_new_player() already; an existing one gets it here (rows from before #282). */
if ($is_in_db && strlen($name) > 0) ensure_user_row($link, $id);
$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
