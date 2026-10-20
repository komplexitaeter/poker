<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Agile Poker Cards Online - Statistics</title>
    <link rel="stylesheet" href="style/style.css" media="screen" />
</head>
<body onload="document.body.style.opacity = '1';">

    <table>
        <tr class="table_header">
            <th>date</th>
            <th>team registrations</th>
            <th>new round clicks</th>
            <th>average players</th>
            <th>board on load (mobile)</th>
            <th>open info box</th>
            <th>link simulation infos</th>
            <th>link simulation login</th>
            <th>open feedback box</th>
            <th>open setup box</th>
            <th>use color switch</th>
            <th>use stopwatch switch</th>
            <th>topic saved</th>
        </tr>

<?php
require './config.php';
require './api/lib.php';

$sql = "select /*+ MAX_EXECUTION_TIME(30000) */ d.day
     ,ifnull(p.team_registrations_cnt, 0) as team_registrations_cnt
     ,ifnull(r.new_round_cnt, 0) as new_round_cnt
     ,ifnull(round(r.new_round_players_avg, 2), 0) as new_round_players_avg
     ,ifnull(e.board_on_load, 0) as board_on_load
     ,ifnull(e.board_on_load_mobile, 0) as board_on_load_mobile
     ,ifnull(e.open_info_box, 0) as open_info_box
     ,ifnull(e.link_simulation_infos, 0) as link_simulation_infos
     ,ifnull(e.link_simulation_login, 0) as link_simulation_login
     ,ifnull(e.open_feedback_box, 0) as open_feedback_box
     ,ifnull(e.open_setup_box, 0) as open_setup_box
     ,ifnull(e.use_color_switch, 0) as use_color_switch
     ,ifnull(e.toggle_timer, 0) as toggle_timer
     ,ifnull(e.topic_saved, 0) as topic_saved

from (select date_format(timestampadd(DAY,-1*i.n,current_timestamp), '%Y-%m-%d') as day
      from (select 0 as n union select 1 union select 2 union  select 3
            union select 4 union select 5 union select 6 union select 7
            union select 8 union select 9 union select 10 union select 11
            union select 12 union select 13 union select 14) as i) as d
         left outer join (select date_format(creation_date, '%Y-%m-%d') as day
                               ,count(1) team_registrations_cnt
                          from pok_teams_tbl
                          where creation_date >= cast(date(timestampadd(day,-14, current_timestamp)) as datetime)
                          group by day) as p
                         on p.day = d.day
         left outer join (select date_format(creation_date, '%Y-%m-%d') as day
                               ,count(1) new_round_cnt
                               ,avg(players_count) new_round_players_avg
                          from pok_roundstats_tbl
                          where type_code = 'NEW_ROUND'
                            and creation_date >= cast(date(timestampadd(day,-14, current_timestamp)) as datetime)
                          group by day) as r
                         on r.day = d.day
         left outer join (select date_format(creation_date, '%Y-%m-%d') as day
                               ,sum(event_code = 'BOARD_ON_LOAD') as board_on_load
                               ,sum(event_code = 'BOARD_ON_LOAD' and display_type in ('xs','sm')) as board_on_load_mobile
                               ,sum(event_code = 'OPEN_INFO_BOX') as open_info_box
                               ,sum(event_code = 'LINK_SIMULATION_INFOS') as link_simulation_infos
                               ,sum(event_code = 'LINK_SIMULATION_LOGIN') as link_simulation_login
                               ,sum(event_code = 'OPEN_FEEDBACK_BOX') as open_feedback_box
                               ,sum(event_code = 'OPEN_SETUP_BOX') as open_setup_box
                               ,sum(event_code = 'USE_COLOR_SWITCH') as use_color_switch
                               ,sum(event_code = 'TOGGLE_TIMER') as toggle_timer
                               ,sum(event_code = 'TOPIC_SAVED') as topic_saved
                          from pok_analytics_events_tbl
                          where creation_date > timestampadd(day,-14, current_timestamp)
                          group by day) as e
                         on e.day = d.day
order by d.day desc
";

$link = db_init();

// Always escape DB values on output (project convention: store raw, escape on output).
function h($value) {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

$result = $link->query($sql);
while(  $obj = $result->fetch_object()) {
    echo("<tr>\n");
    echo("<td>" . h($obj->day) . "</td>\n");
    echo("<td>" . h($obj->team_registrations_cnt) . "</td>\n");
    echo("<td>" . h($obj->new_round_cnt) . "</td>\n");
    echo("<td>" . h($obj->new_round_players_avg) . "</td>\n");
    echo("<td>" . h($obj->board_on_load) . " (" . h($obj->board_on_load_mobile) . ")</td>\n");
    echo("<td>" . h($obj->open_info_box) . "</td>\n");
    echo("<td>" . h($obj->link_simulation_infos) . "</td>\n");
    echo("<td>" . h($obj->link_simulation_login) . "</td>\n");
    echo("<td>" . h($obj->open_feedback_box) . "</td>\n");
    echo("<td>" . h($obj->open_setup_box) . "</td>\n");
    echo("<td>" . h($obj->use_color_switch) . "</td>\n");
    echo("<td>" . h($obj->toggle_timer) . "</td>\n");
    echo("<td>" . h($obj->topic_saved) . "</td>\n");
    echo("</tr>\n\n");
}
echo("</table>\n\n");


$sql = "select *
  from pok_feedback_tbl t
where timestampdiff(month, t.datum, current_timestamp) < 3
order by datum desc";

$result = $link->query($sql);
while(  $obj = $result->fetch_object()) {
    echo('<div class="feedback">');
    echo("<h1>" . h($obj->datum) . "</h1>");
    echo("<h1>");
    for ($i=0;$i<5;$i++) {
        if ($obj->fb_stars>$i) echo("*");
        else echo("_");
    }
    echo("</h1>");
    echo("<div>\"" . h($obj->fb_text) . "\"</div>");
    echo("</div>\n");
}



$link->close();
?>

</body>
</html>
