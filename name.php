<?php
require 'config.php';
require 'lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$name = substr( filter_input(INPUT_GET, "name", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,15);

print('id: '.$id.' ');
print('name: '.$name);

$link = mysqli_init();
$success = mysqli_real_connect(
       $link, 
       _MYSQL_HOST, 
       _MYSQL_USER, 
       _MYSQL_PWD, 
       _MYSQL_DB,
       _MYSQL_PORT
);

$is_in_db=false;
$sql = "SELECT count(1) cnt FROM pok_players_tbl WHERE id = '".$id."' and team_id = '".$t."'";
if ($result = $link->query($sql)) {
    $obj = $result->fetch_object();
    if ($obj->cnt==1) $is_in_db=true;
    $result->close();
}

if (strlen($name)==0) $sql = "DELETE FROM pok_players_tbl WHERE id = '".$id."' and team_id = '".$t."'";
else if ($is_in_db) $sql = "UPDATE pok_players_tbl set name = '".$name."' WHERE id = '".$id."' and team_id = '".$t."'";
else $sql = "INSERT INTO pok_players_tbl (id, team_id, name) VALUES ('".$id."','".$t."' ,'".$name."')";


$link->query($sql);
$link->close();