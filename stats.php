<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Agile Poker Cards Online - Statistics</title>
    <link rel="stylesheet" href="style/style.css" media="screen" />
</head>
<body>

    <table>
        <tr class="table_header">
            <th>date</th>
            <th>team registrations</th>
            <th>new round clicks</th>
            <th>average players</th>
            <th>board on load</th>
            <th>open info box</th>
            <th>link simulation infos</th>
            <th>link simulation login</th>
            <th>open feedback box</th>
            <th>open setup box</th>
        </tr>

<?php
require './config.php';
require './api/lib.php';

$sql = "select d.day
     ,ifnull(p.team_registrations_cnt, 0) as team_registrations_cnt
     ,ifnull(r.new_round_cnt, 0) as new_round_cnt
     ,ifnull(round(r.new_round_players_avg, 2), 0) as new_round_players_avg
    ,(select count(1) from pok_analytics_events_tbl
        where date_format(creation_date, '%Y-%m-%d') = d.day
        and event_code = 'BOARD_ON_LOAD') as board_on_load
     ,(select count(1) from pok_analytics_events_tbl
       where date_format(creation_date, '%Y-%m-%d') = d.day
         and event_code = 'OPEN_INFO_BOX') as open_info_box
     ,(select count(1) from pok_analytics_events_tbl
       where date_format(creation_date, '%Y-%m-%d') = d.day
         and event_code = 'LINK_SIMULATION_INFOS') as link_simulation_infos
     ,(select count(1) from pok_analytics_events_tbl
       where date_format(creation_date, '%Y-%m-%d') = d.day
         and event_code = 'LINK_SIMULATION_LOGIN') as link_simulation_login
     ,(select count(1) from pok_analytics_events_tbl
       where date_format(creation_date, '%Y-%m-%d') = d.day
         and event_code = 'OPEN_FEEDBACK_BOX') as open_feedback_box
     ,(select count(1) from pok_analytics_events_tbl
       where date_format(creation_date, '%Y-%m-%d') = d.day
         and event_code = 'OPEN_SETUP_BOX') as open_setup_box
from (select date_format(timestampadd(DAY,-1*i.n,current_timestamp), '%Y-%m-%d') as day
      from (select 0 as n union select 1 union select 2 union  select 3
            union select 4 union select 5 union select 6 union select 7
            union select 8 union select 9 union select 10 union select 11
            union select 12 union select 13 union select 13 union select 14) as i) as d
         left outer join (select date_format(creation_date, '%Y-%m-%d') as day
                               ,count(1) team_registrations_cnt
                          from pok_teams_tbl
                          group by day) as p
                         on p.day = d.day
         left outer join (select date_format(creation_date, '%Y-%m-%d') as day
                               ,count(1) new_round_cnt
                               ,avg(players_count) new_round_players_avg
                          from pok_roundstats_tbl
                          where type_code = 'NEW_ROUND'
                          group by day) as r
                         on r.day = d.day
order by d.day desc
";

$link = db_init();

$result = $link->query($sql);
while(  $obj = $result->fetch_object()) {
    echo("\t\t<tr>\n");
    echo("\t\t\t<td>$obj->day</td>\n");
    echo("\t\t\t<td>$obj->team_registrations_cnt</td>\n");
    echo("\t\t\t<td>$obj->new_round_cnt</td>\n");
    echo("\t\t\t<td>$obj->new_round_players_avg</td>\n");
    echo("\t\t\t<td>$obj->board_on_load</td>\n");
    echo("\t\t\t<td>$obj->open_info_box</td>\n");
    echo("\t\t\t<td>$obj->link_simulation_infos</td>\n");
    echo("\t\t\t<td>$obj->link_simulation_login</td>\n");
    echo("\t\t\t<td>$obj->open_feedback_box</td>\n");
    echo("\t\t\t<td>$obj->open_setup_box</td>\n");
    echo("\t\t</tr>\n\n");
}
echo("</table>\n\n");


$sql = "select *
  from pok_feedback_tbl t
where timestampdiff(month, t.datum, current_timestamp) < 3
order by datum desc";

$result = $link->query($sql);
while(  $obj = $result->fetch_object()) {
    echo('\t\t<div class="feedback">');
    echo("<h1>$obj->datum</h1>");
    echo("<h1>");
    for ($i=0;$i<5;$i++) {
        if ($obj->fb_stars>$i) echo("*");
        else echo("_");
    }
    echo("</h1>");
    echo("<div>\"$obj->fb_text\"</div>");
    echo("</div>\n");
}



$link->close();
?>



</body>
</html>
