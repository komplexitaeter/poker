<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$id = substr(filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ?? '', 0,16);
$cardkey = substr(filter_input(INPUT_GET, "cardkey", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ?? '', 0,7);


$link = db_init();
require_team($t, $link);

if (strlen($cardkey)>0) {
    $sql = $link->prepare("UPDATE pok_players_tbl SET card_key = ? WHERE id = ? and team_id = ?");
    $sql->bind_param('sss', $cardkey, $id, $t);
} else {
    $sql = $link->prepare("UPDATE pok_players_tbl SET card_key = null WHERE id = ? and team_id = ?");
    $sql->bind_param('ss', $id, $t);
}

$sql->execute();
$link->close();