<?php
require 'config.php';
$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$cardkey = substr( filter_input(INPUT_GET, "cardkey", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,7);

print('id: '.$id.' ');
print('cardkey: '.$cardkey); 

if (strlen($cardkey)>0) 
    $sql = "UPDATE players SET card_key = '".$cardkey."' WHERE id = '".$id."' and team_id ='".$t."'";
else
    $sql = "UPDATE players SET card_key = null WHERE id = '".$id."' and team_id ='".$t."'";

$link = mysqli_init();
$success = mysqli_real_connect(
       $link, 
       _MYSQL_HOST, 
       _MYSQL_USER, 
       _MYSQL_PWD, 
       _MYSQL_DB,
       _MYSQL_PORT
);

if ($result = $link->query($sql)) {  
}

$link->close();

?>