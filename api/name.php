<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$name = substr( filter_input(INPUT_GET, "name", FILTER_SANITIZE_STRING, FILTER_FLAG_NO_ENCODE_QUOTES	) ,0,15);

print('id: '.$id.' ');
print('name: '.$name);

$link = db_init();
validate_team($t, $link) or exit;


$is_in_db=false;
$sql = "SELECT count(1) cnt FROM pok_players_tbl WHERE id = '".$id."' and team_id = '".$t."'";

$sql = $link->prepare('SELECT count(1) cnt FROM pok_players_tbl WHERE id = ? and team_id = ?');
$sql->bind_param('ss', $id, $t);
$sql->execute();

if ($result = $sql->get_result()) {
    $obj = $result->fetch_object();
    if ($obj->cnt==1) $is_in_db=true;
    $result->close();
}

if (strlen($name)==0) {
    $sql = $link->prepare('DELETE FROM pok_players_tbl WHERE id = ? and team_id = ?');
    $sql->bind_param('ss', $id, $t);
}
else if ($is_in_db) {
    $sql = $link->prepare('UPDATE pok_players_tbl set name = ? WHERE id = ? and team_id = ?');
    $sql->bind_param('sss', $name,$id, $t);
}
else {

    $sql = $link->prepare('SELECT if (count(1) = sum(if(p.card_key is not null,1,0)), 1, 0) all_players_ready
                                  FROM pok_players_tbl p
                                 WHERE p.team_id = ?;');
    $sql->bind_param('s',$t);
    $sql->execute();

    $result = $sql->get_result();
    $obj = $result->fetch_object();

    if ($obj->all_players_ready == 0) {
        $sql = $link->prepare( 'INSERT INTO pok_players_tbl (id, team_id, name) VALUES (?, ?, ?)');
        $sql->bind_param('sss', $id, $t, $name);
    } else {
        $sql = $link->prepare( "INSERT INTO pok_players_tbl (id, team_id, name, card_key) VALUES (?, ?, ?, 'break01')");
        $sql->bind_param('sss', $id, $t, $name);
    }
}

$sql->execute();
$link->close();