<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$cardset_flags = filter_input(INPUT_GET, "cardset_flags", FILTER_SANITIZE_NUMBER_INT);


$link = db_init();
require_team($t, $link);

$sql = $link->prepare("UPDATE pok_teams_tbl SET cardset_flags = ?, needs_setup=0 WHERE id=?");
$sql->bind_param('ss',$cardset_flags, $t);
$sql->execute();

$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
