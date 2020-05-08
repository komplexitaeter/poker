<?php
require 'config.php';
$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$sql = "UPDATE players SET card_key = null WHERE team_id ='".$t."'";

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