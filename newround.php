<?php
require 'config.php';
require 'lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$sql = "UPDATE pok_players_tbl SET card_key = null WHERE team_id ='".$t."'";

$sql_stats = "insert into pok_roundstats_tbl(team_id, players_count, type_code)
                select team_id
                     , count(1)
                     , case when count(1) = count(card_key) 
                         then 'NEW_ROUND' 
                         else 'CANCEL_ROUND' 
                       end
                  from pok_players_tbl
                 where team_id = '$t'
                 group by team_id";

$link = mysqli_init();
$success = mysqli_real_connect(
       $link, 
       _MYSQL_HOST, 
       _MYSQL_USER, 
       _MYSQL_PWD, 
       _MYSQL_DB,
       _MYSQL_PORT
);

$link->query($sql_stats);
$link->query($sql);
$link->close();