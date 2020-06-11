<?php
require 'config.php';
require 'lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$cardkey = substr( filter_input(INPUT_GET, "cardkey", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,7);


if (strlen($cardkey)>0)
    $sql = "UPDATE pok_players_tbl SET card_key = '".$cardkey."' WHERE id = '".$id."' and team_id ='".$t."'";
else
    $sql = "UPDATE pok_players_tbl SET card_key = null WHERE id = '".$id."' and team_id ='".$t."'";

$link = db_init();

$link->query($sql);
$link->close();