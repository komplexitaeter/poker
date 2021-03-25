<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_STRING	) ,0,80);
$id_val = '';

if (strlen($t) <= 0) {
    $t = 'Team';
}

$link = db_init();

$id = get_team_id($t, $link);

$sql = $link->prepare("INSERT INTO pok_teams_tbl(id, cardset_flags, name)
                                VALUES(?,'1111101001111110000000001', ?)");
$sql->bind_param('ss', $id, $t);

if ($sql->execute()) {
    $id_val = $id;
}
$link->close();

print('{"id": "'.$id_val.'"}');