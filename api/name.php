<?php
require '../config.php';
require './lib.php';
require './lib_core_member.php';
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
    /* B-151: core_member_leave() / core_member_update() (lib_core_member.php), shared with MCP me leave, rename and
       set_role: an empty name takes the person off the board (REMOVED, card up), else name and type - B-102: an
       existing user who becomes (or stays) a player while the cards are revealed gets the system card LATE_CARD_KEY
       if he has no card yet; a card already down is kept (B-33). Both notify the team (B-81) and keep the user row
       (ensure_user_row(), rows from before #282). A row gone in between changes nothing, as before. */
    $actor = ['uid' => $id, 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null];
    try {
        if (strlen($name) == 0) core_member_leave($link, $actor);
        else core_member_update($link, $actor, $name, $type);
    } catch (ApiError $e) {
        // the person was deleted in between ("Delete my data" in another tab): nothing to change
    }
    $link->close();
    exit;
}

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
$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
