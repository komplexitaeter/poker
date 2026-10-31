<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$id = get_id_param("id");
// a missing or manipulated id must not create a player with an empty id (B-88), SIDs have 16 characters
if (strlen($id) < 10) exit;
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
        $sql = $link->prepare("UPDATE pok_players_tbl set player_type = 'REMOVED', card_key = null WHERE id = ? and team_id = ?");
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

    $sql = $link->prepare("SELECT if (count(1) = sum(if(p.card_key is not null,1,0)), 1, 0) all_players_ready
                                  FROM pok_players_tbl p
                                 WHERE p.team_id = ?
                                   AND p.player_type = 'PLAYER';");
    $sql->bind_param('s',$t);
    $sql->execute();

    $result = $sql->get_result();
    $obj = $result->fetch_object();

    /* B-102: same condition for a new user (player or observer, decision Andreas 2026-10-31): joining while every
       PLAYER has a card down (cards revealed) gives the system card LATE_CARD_KEY instead of break01. An observer
       keeps it when becoming a player later (the branch above keeps a card already down). Cards of observers never
       count: getDao(), the round snapshot type and stats only look at PLAYER rows. */
    if ($obj->all_players_ready == 0) {
        $sql = $link->prepare( "INSERT INTO pok_players_tbl (id, team_id, name, player_type) VALUES (?, ?, ?, ?)");
        $sql->bind_param('ssss', $id, $t, $name, $type);
    } else {
        $late_card = LATE_CARD_KEY;
        $sql = $link->prepare( "INSERT INTO pok_players_tbl (id, team_id, name, card_key, player_type) VALUES (?, ?, ?, ?, ?)");
        $sql->bind_param('sssss', $id, $t, $name, $late_card, $type);
    }
}

$sql->execute();
$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
