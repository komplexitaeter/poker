<?php
require '../config.php';
require './lib.php';
set_header('json');
$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);


$survey_id = null;
$votes_count = 0;
$intro = null;
$vote_options = array();


if ($id != null) {

    $link = db_init();

    $sql = $link->prepare("  select s.survey_id
                                      ,(select count(1)
                                          from pok_survey_votes_tbl v
                                         where v.survey_id = u.survey_id) votes_count
                                      ,s.intro
                                  from pok_user_tbl u
                                  join pok_survey_tbl s on s.survey_id = u.survey_id
                                 where u.id = ?
                                ;");
    $sql->bind_param('i', $id);
    $sql->execute();
    $result = $sql->get_result();
    if ($obj = $result->fetch_object()) {
        $survey_id = $obj->survey_id;
        $votes_count = $obj->votes_count;
        $intro = $obj->intro;
    }

    if ($survey_id != null) {

        $sql = $link->prepare("select    o.vote_option_id
                                          ,o.text
                                          ,count(v.vote_option_id) votes_count
                                    from pok_survey_vote_options_tbl o
                                      left outer join pok_survey_votes_tbl v on v.vote_option_id = o.vote_option_id
                                     where o.survey_id = ?
                                     group by
                                           o.vote_option_id
                                          ,o.text");
        $sql->bind_param('i', $survey_id);
        $sql->execute();
        $result = $sql->get_result();
        $votes_percentage = null;

        while ($obj = $result->fetch_object()) {

            if ($votes_count != null and $votes_count > 0) {
                $votes_percentage = round($obj->votes_count * 100 / $votes_count);
            }

            $vote_option = (object)array("id" => (int)$obj->vote_option_id
            , "text" => (string)$obj->text
            , "total_count" => (int)$obj->votes_count
            , "votes_percentage" => (int)$votes_percentage);
            $vote_options[] = $vote_option;
        }
    }
    $link->close();
}

echo json_encode(array( "survey_id"=>$survey_id,
                        "votes_count"=>$votes_count,
                        "survey_intro"=>$intro,
                        "vote_options"=>$vote_options), JSON_UNESCAPED_UNICODE);