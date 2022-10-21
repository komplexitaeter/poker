<?php
require '../config.php';
require './lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
$action = filter_input(INPUT_GET, 'action', FILTER_SANITIZE_STRING);

$link = db_init();

if ($action=='start') {
    $sql = $link->prepare( "update pok_teams_tbl t
                                 set t.timer_start_time = current_timestamp
                               where t.id=(select p.team_id from pok_players_tbl p 
                                            where p.id=?
                                              and p.team_id=?); ");
    $sql->bind_param('ss', $t, $id);
    $sql->execute();
}

if ($action=='pause') {
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_pause_time = current_timestamp 
                                   where t.id=(select p.team_id from pok_players_tbl p 
                                                where p.id=?
                                                  and p.team_id=?)
                                      and not isnull(t.timer_start_time)");
    $sql->bind_param('ss', $t, $id);
    $sql->execute();
}

if ($action=='reset') {
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_start_time = null
                                        ,t.timer_pause_time = null
                                   where t.id=(select p.team_id from pok_players_tbl p 
                                                where p.id=?
                                                  and p.team_id=?); ");
    $sql->bind_param('ss', $t, $id);
    $sql->execute();
}


$link->close();