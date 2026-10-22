<?php
require '../config.php';
require './lib.php';

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$topic = cut_text((string)filter_input(INPUT_POST, "topic"), 2000);

$link = db_init();
require_team($t, $link);

$sql = $link->prepare( "update pok_teams_tbl t
                                     set t.topic=?
                                   where t.id=?");
$sql->bind_param('ss', $topic, $t);
$sql->execute();

$link->close();