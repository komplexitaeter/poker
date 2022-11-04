<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$sql = "UPDATE pok_players_tbl SET card_key = null WHERE team_id ='".$t."'";

$sql_stats = "insert into pok_roundstats_tbl(team_id, players_count, type_code, topic)
                select team_id
                     , count(1)
                     , case when count(1) = count(card_key) 
                         then 'NEW_ROUND' 
                         else 'CANCEL_ROUND' 
                       end
                     , p.topic = (select topic from pok_teams_tbl t where t.team_id = p.team_id)
                  from pok_players_tbl p
                 where team_id = '$t'
                 group by team_id";

$link = db_init();

$link->query($sql_stats);
$link->query($sql);

$link->close();