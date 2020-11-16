<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$cardset = filter_input(INPUT_GET, "cardset", FILTER_SANITIZE_NUMBER_INT);

$sql = "UPDATE pok_teams_tbl SET cardset = '".$cardset."' WHERE id ='".$t."'";

$link = db_init();

$link->query($sql);
$link->close();