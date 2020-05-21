<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Agile Poker Cards Online - Statistics</title>
    <link rel="stylesheet" href="style.css" media="screen" />
</head>
<body>

    <table>
        <tr class="table_header">
            <th>date</th>
            <th>team registrations</th>
            <th>new round clicks</th>
            <th>average players</th>
        </tr>

<?php
require 'config.php';

$sql = "select d.day
      ,ifnull(p.team_registrations_cnt, 0) as team_registrations_cnt
      ,ifnull(r.new_round_cnt, 0) as new_round_cnt
      ,ifnull(round(r.new_round_players_avg, 2), 0) as new_round_players_avg
  from (select date_format(timestampadd(DAY,-1*i.n,current_timestamp+i.n), '%Y-%m-%d') as day
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

$link = mysqli_init();
$success = mysqli_real_connect(
    $link,
    _MYSQL_HOST,
    _MYSQL_USER,
    _MYSQL_PWD,
    _MYSQL_DB,
    _MYSQL_PORT
);

$result = $link->query($sql);
while(  $obj = $result->fetch_object()) {
    echo("\t\t<tr>\n");
    echo("\t\t\t<td>$obj->day</td>\n");
    echo("\t\t\t<td>$obj->team_registrations_cnt</td>\n");
    echo("\t\t\t<td>$obj->new_round_cnt</td>\n");
    echo("\t\t\t<td>$obj->new_round_players_avg   </td>\n");
    echo("\t\t</tr>\n\n");
}

$link->close();
?>

    </table>

</body>
</html>
