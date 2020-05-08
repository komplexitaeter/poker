<?php
require 'config.php';
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

$isindb=false;
$sql = "SELECT count(1) cnt FROM players WHERE id = '".$id."' and team_id = '".$t."'";
if ($result = $link->query($sql)) {
    $obj = $result->fetch_object();
    if ($obj->cnt==1) $isindb=true;
    $result->close();
}

if (strlen($name)==0) $sql = "DELETE FROM players WHERE id = '".$id."' and team_id = '".$t."'";
else if ($isindb) $sql = "UPDATE players set name = '".$name."' WHERE id = '".$id."' and team_id = '".$t."'";
else $sql = "INSERT INTO players (id, team_id, name) VALUES ('".$id."','".$t."' ,'".$name."')";


if ($result = $link->query($sql)) {  
}
$link->close();

?>