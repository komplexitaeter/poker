<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$cardset_flags = filter_input(INPUT_GET, "cardset_flags", FILTER_SANITIZE_NUMBER_INT);

$sql = "UPDATE pok_teams_tbl SET cardset_flags = '".$cardset_flags."' WHERE id ='".$t."'";

$link = db_init();

$link->query($sql);
$link->close();