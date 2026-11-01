<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$id = get_id_param("id");
// card keys are up to 7 characters a-z0-9 (cards.json); a manipulated key changes nothing (B-88)
$cardkey = get_id_param("cardkey", 7);
if ($cardkey === '' && (string)filter_input(INPUT_GET, "cardkey") !== '') exit;


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

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
