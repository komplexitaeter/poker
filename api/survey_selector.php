<?php
function get_survey_id($link, $team_id, $user_id) {
    $survey_id = null;
    $sql = $link->prepare(" select greatest(team_age, ifnull(related_teams_age, 0)) as approx_team_age
                              from
                            (
                            select t.id, timestampdiff(DAY, t.creation_date, current_timestamp) team_age
                            ,(SELECT max( timestampdiff(DAY, t2.creation_date, current_timestamp) )
                              FROM pok_players_tbl p1, pok_players_tbl p2, pok_teams_tbl t2 where p1.team_id =t.id
                                                                            and p2.id = p1.id
                                                                            and p2.team_id != p1.team_id
                                                                            and t2.id = p2.team_id) related_teams_age
                              from pok_teams_tbl t
                            where t.id = ?
                            ) as x
                            ;");
    $sql->bind_param('s', $team_id);
    $sql->execute();
    $result = $sql->get_result();
    if ($obj = $result->fetch_object()) {
        if ($obj->approx_team_age >= 30) $survey_id = 1;
    }
    return $survey_id;
}