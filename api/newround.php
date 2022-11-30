<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);

$link = db_init();
validate_team($t, $link) or exit;

$sql = $link->prepare("insert into pok_roundstats_tbl(team_id, players_count, type_code, timer_start_time
                            , timer_pause_time ,timer_visibility, topic)
                select p.team_id
                     , count(1) players_count
                     , IF(count(1) = count(p.card_key), 'NEW_ROUND', 'CANCEL_ROUND') type_code
                     , t.timer_start_time
                     , t.timer_pause_time
                     , t.timer_visibility
                     , t.topic
                  from pok_players_tbl p, pok_teams_tbl t
                 where p.team_id = ?
                   and t.id = p.team_id
                 group by p.team_id, t.timer_start_time, t.timer_pause_time, t.timer_visibility, t.topic");

$sql->bind_param('s', $t);
$sql->execute();

$sql = $link->prepare( "update pok_players_tbl p
                                     set card_key = null
                                   where p.team_id=?");
$sql->bind_param('s', $t);
$sql->execute();

$link->close();