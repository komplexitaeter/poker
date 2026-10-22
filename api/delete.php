<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$mkey = filter_input(INPUT_GET, "mkey", FILTER_SANITIZE_NUMBER_INT);

if (strlen($mkey)>0) {

    $link = db_init();
    require_team($t, $link);

    $sql = $link->prepare("UPDATE pok_players_tbl SET player_type = 'REMOVED', card_key = null WHERE team_id = ? and mkey = ?");
    $sql->bind_param('si', $t, $mkey);
    $sql->execute();
    $link->close();

}