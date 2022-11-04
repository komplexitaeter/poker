<?php
require '../config.php';
require './lib.php';
error_log("call...");
$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$topic = substr( filter_input(INPUT_POST, "topic", FILTER_SANITIZE_STRING, FILTER_FLAG_NO_ENCODE_QUOTES	) ,0,2000);

$link = db_init();

$sql = $link->prepare( "update pok_teams_tbl t
                                     set t.topic=?
                                   where t.id=?");
$sql->bind_param('ss', $topic, $t);
$sql->execute();

$link->close();