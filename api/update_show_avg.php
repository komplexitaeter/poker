<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$show_avg = filter_input(INPUT_GET, "show_avg", FILTER_SANITIZE_NUMBER_INT);

if ($show_avg == null or $show_avg != 1) $show_avg = 0;

$link = db_init();
require_team($t, $link);
$sql = $link->prepare( "update pok_teams_tbl t
                                     set t.show_avg=?
                                   where t.id=?");
$sql->bind_param('is', $show_avg, $t);
$sql->execute();

$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
