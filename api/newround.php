<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$link = db_init();
require_team($t, $link);

$sql = $link->prepare( "delete from pok_players_tbl
                                   where team_id=?
                                    and last_callback_time < TIMESTAMPADD(MONTH, -2, CURRENT_TIMESTAMP);
                                ");
$sql->bind_param('s', $t);
$sql->execute();

$sql = $link->prepare("insert into pok_roundstats_tbl(team_id, players_count, type_code, timer_start_time
                            , timer_pause_time ,timer_visibility, topic, cardset_flags, results_order, show_avg
                            , anonymous_mode, deck_id)
                select p.team_id
                     , count(1) players_count
                     , IF(count(1) = count(p.card_key), 'NEW_ROUND', 'CANCEL_ROUND') type_code
                     , t.timer_start_time
                     , t.timer_pause_time
                     , t.timer_visibility
                     , t.topic
                     , t.cardset_flags
                     , t.results_order
                     , t.show_avg
                     , t.anonymous_mode
                     , t.deck_id
                  from pok_players_tbl p, pok_teams_tbl t
                 where p.team_id = ?
                   and p.player_type = 'PLAYER'
                   and t.id = p.team_id
                 group by p.team_id, t.timer_start_time, t.timer_pause_time, t.timer_visibility, t.topic");

$sql->bind_param('s', $t);
$sql->execute();

$sql = $link->prepare( "select last_insert_id() as last_id");
$sql->execute();
$result = $sql->get_result();
$obj = $result->fetch_object();
if ($obj != null && $obj->last_id != 0) {
    $sql = $link->prepare( "insert into pok_roundstat_details_tbl
                                    select ? roundstat_id, t.id as player_id, t.team_id, t.name, t.card_key, t.player_type
                                    from pok_players_tbl t
                                    where t.team_id = ?
                                      and t.last_callback_time > TIMESTAMPADD(DAY, -1, CURRENT_TIMESTAMP);
                                    ");
    $sql->bind_param('is', $obj->last_id, $t);
    $sql->execute();
}

$sql = $link->prepare( "update pok_teams_tbl t
                                     set t.anonymous_mode = t.anonymous_request_toggle
                                   where t.id=?");
$sql->bind_param('s', $t);
$sql->execute();

/* B-67: with "auto-start on new round" a visible timer restarts at 0 (TIMER mode: at T-timebox) and runs.
   Applies to NEW_ROUND and CANCEL_ROUND; otherwise the timer stays untouched. */
$sql = $link->prepare( "update pok_teams_tbl t
                                     set t.timer_start_time = current_timestamp
                                        ,t.timer_pause_time = null
                                   where t.id=?
                                     and t.timer_visibility = 1
                                     and t.timer_auto_restart = 1");
$sql->bind_param('s', $t);
$sql->execute();

$sql = $link->prepare( "update pok_players_tbl p
                                     set card_key = null
                                   where p.team_id=?");
$sql->bind_param('s', $t);
$sql->execute();

$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
