<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
$action = filter_input(INPUT_GET, 'action', FILTER_SANITIZE_STRING);

$link = db_init();

if ($action=='start') {
    $sql = $link->prepare( "SELECT if(isnull(timer_pause_time), 0
         ,timestampdiff(SECOND, timer_pause_time, timer_start_time)) paused_time_value
                                    FROM pok_teams_tbl as t
                                    where t.id=?;");
    $sql->bind_param('s', $t);
    $sql->execute();
    $result = $sql->get_result();
    $obj = $result->fetch_object();
    if ($obj == null)
        $paused_time_value = 0;
    else
        $paused_time_value = $obj->paused_time_value;


    $sql = $link->prepare( "update pok_teams_tbl t
                                 set t.timer_start_time = timestampadd(SECOND, ?, current_timestamp)
                                    ,t.timer_pause_time = null
                               where t.id=?;");
    $sql->bind_param('is', $paused_time_value, $t);
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