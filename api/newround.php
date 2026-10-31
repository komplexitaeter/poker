<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$link = db_init();
require_team($t, $link);

/*
 * B-98 S2: same lock order as update_deck.php (team row first, then players), so a parallel deck change and
 * "New Round" run one after the other instead of deadlocking.
 */
$link->begin_transaction();
$sql = $link->prepare("select id from pok_teams_tbl where id = ? for update");
$sql->bind_param('s', $t);
$sql->execute();
if ($sql->get_result()->fetch_assoc() === null) { // team deleted in between
    $link->rollback();
    http_response_code(403);
    exit;
}
start_new_round($link, $t); // B-98 S2: shared with update_deck.php (api/lib.php)
$link->commit();

$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
