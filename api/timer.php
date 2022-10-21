<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
$action = filter_input(INPUT_GET, 'action', FILTER_SANITIZE_STRING);

$link = db_init();

if ($action=='start') {
    $sql = $link->prepare( "update pok_teams_tbl t
                                 set t.timer_start_time = current_timestamp - (
                                         ifnull(timer_pause_time, current_timestamp)
                                       - ifnull(timer_start_time, current_timestamp)
                                             )
                                    ,t.timer_pause_time = null
                               where t.id=?;");
    $sql->bind_param('s', $t);
    $sql->execute();
}

if ($action=='pause') {
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_pause_time = current_timestamp 
                                   where t.id=?");
    $sql->bind_param('s', $t);
    $sql->execute();
}

if ($action=='reset') {
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_start_time = null
                                        ,t.timer_pause_time = null
                                   where t.id=?");
    $sql->bind_param('s', $t);
    $sql->execute();
}


$link->close();