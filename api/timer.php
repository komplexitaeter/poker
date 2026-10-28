<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$action = get_text_param('action', 30);

$link = db_init();
require_team($t, $link);

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

if ($action=='toggle_visibility') {
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_visibility = not t.timer_visibility
                                   where t.id=?");
    $sql->bind_param('s', $t);
    $sql->execute();
}

/* B-67: explicit visibility (toggle_visibility stays for old clients during the deploy) */
if ($action=='set_visibility') {
    $value = filter_input(INPUT_GET, "value") ?? '';
    if (!in_array($value, ['0', '1'], true)) bad_request($link);
    $visibility = (int)$value;
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_visibility = ?
                                   where t.id=?");
    $sql->bind_param('is', $visibility, $t);
    $sql->execute();
}

/* B-67: STOPWATCH counts up (T+), TIMER counts down from the timebox (T-) and then on into T+.
 * Changing the mode or the timebox also resets the timer, so everyone sees the new start value right away. */
if ($action=='set_mode') {
    $mode = filter_input(INPUT_GET, "value") ?? '';
    if (!in_array($mode, ['STOPWATCH', 'TIMER'], true)) bad_request($link);
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_mode = ?
                                        ,t.timer_start_time = null
                                        ,t.timer_pause_time = null
                                   where t.id=?");
    $sql->bind_param('ss', $mode, $t);
    $sql->execute();
}

/* B-67: timebox in whole minutes (1..240), stored in seconds; resets the timer (see set_mode) */
if ($action=='set_timebox') {
    $value = filter_input(INPUT_GET, "value") ?? '';
    if (!preg_match('/^[0-9]{1,3}$/', $value) || (int)$value < 1 || (int)$value > 240) bad_request($link);
    $timebox = (int)$value * 60;
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_timebox = ?
                                        ,t.timer_start_time = null
                                        ,t.timer_pause_time = null
                                   where t.id=?");
    $sql->bind_param('is', $timebox, $t);
    $sql->execute();
}

/* B-67: restart the timer with every new or cancelled round (see newround.php) */
if ($action=='set_auto_restart') {
    $value = filter_input(INPUT_GET, "value") ?? '';
    if (!in_array($value, ['0', '1'], true)) bad_request($link);
    $auto_restart = (int)$value;
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_auto_restart = ?
                                   where t.id=?");
    $sql->bind_param('is', $auto_restart, $t);
    $sql->execute();
}

$link->close();

function bad_request($link) {
    $link->close();
    http_response_code(400);
    exit;
}