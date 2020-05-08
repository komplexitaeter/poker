<?php
require 'config.php';
require 'lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$cardset = filter_input(INPUT_GET, "cardset", FILTER_SANITIZE_NUMBER_INT);

$sql = "UPDATE pok_teams_tbl SET cardset = '".$cardset."' WHERE id ='".$t."'";

$link = mysqli_init();
$success = mysqli_real_connect(
       $link, 
       _MYSQL_HOST, 
       _MYSQL_USER, 
       _MYSQL_PWD, 
       _MYSQL_DB,
       _MYSQL_PORT
);

$link->query($sql);

$link->close();