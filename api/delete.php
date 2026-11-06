<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$mkey = filter_input(INPUT_GET, "mkey", FILTER_SANITIZE_NUMBER_INT) ?? '';

if (strlen($mkey)>0) {

    $link = db_init();
    require_team($t, $link);

    /* B-110: only players can be removed; observers (and rows already removed) are not touched (Andreas, 2026-11-01).
       The own "Delete user" goes through delete_user.php and is not affected. */
    $sql = $link->prepare("UPDATE pok_players_tbl SET player_type = 'REMOVED', card_key = null, original_card_key = null
                            WHERE team_id = ? and mkey = ? and player_type = 'PLAYER'");
    $sql->bind_param('si', $t, $mkey);
    $sql->execute();
    $removed = $sql->affected_rows > 0;
    $link->close();

    if (!$removed) {
        // no player with this mkey (an observer, removed already, e.g. by a second click at the same time): no notify
        http_response_code(400);
        exit;
    }

    // B-81: all boards of the team reload (only with mkey, after the team check)
    notify_team($t);

}
