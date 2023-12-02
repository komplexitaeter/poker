<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
$name = substr( filter_input(INPUT_GET, "name", FILTER_SANITIZE_STRING, FILTER_FLAG_NO_ENCODE_QUOTES	) ,0,30);

$link = db_init();
validate_team($t, $link) or exit;
if (strlen($name)>0) {
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.name=?
                                   where t.id=?");
    $sql->bind_param('ss', $name, $t);
    $sql->execute();
}

$link->close();