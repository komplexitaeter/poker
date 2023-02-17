<?php
require '../config.php';
require './lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$color_mode = filter_input(INPUT_GET, "color_mode", FILTER_SANITIZE_FULL_SPECIAL_CHARS	);
$survey_skipped = filter_input(INPUT_GET, "survey_skipped", FILTER_SANITIZE_NUMBER_INT );
$survey_vote =  filter_input(INPUT_GET, "survey_vote", FILTER_SANITIZE_NUMBER_INT );
$hide_teaser = filter_input(INPUT_GET, "hide_teaser", FILTER_SANITIZE_NUMBER_INT );


$link = db_init();

if ($color_mode != null and in_array($color_mode, ['dark', 'light'])) {
    $sql = $link->prepare("UPDATE pok_user_tbl SET color_mode=? WHERE id=?");
    $sql->bind_param('ss', $color_mode, $id);
    $sql->execute();
}

if ($survey_skipped != null and $survey_skipped >= 0 and $survey_skipped <= 1) {
    $sql = $link->prepare("UPDATE pok_user_tbl
                                     SET survey_skipped=".$survey_skipped.",
                                         survey_skipped_date=CURRENT_TIMESTAMP
                                   WHERE id=?");
    $sql->bind_param('s', $id);
    $sql->execute();
}

if ($survey_vote != null and $survey_vote >= 0) {
    $sql = $link->prepare("select u.survey_id
                                  ,(select count(1) from pok_survey_votes_tbl v 
                                    where v.survey_id = u.survey_id and v.user_id = u.id) votes_count
                                  ,(select vote_option_id from pok_survey_vote_options_tbl o 
                                    where o.survey_id = u.survey_id and o.vote_option_id = ?) vote_option_id
                                  from pok_user_tbl u
                                 where u.id = ?");
    $sql->bind_param('is', $survey_vote, $id);
    $sql->execute();
    $result = $sql->get_result();

    if ($obj = $result->fetch_object()) {
        if ($obj->survey_id and $obj->votes_count == 0 and $obj->vote_option_id != null) {
            $sql = $link->prepare("insert into pok_survey_votes_tbl(user_id,survey_id,vote_option_id)
                                            values(?,?,?)");
            $sql->bind_param('sii', $id, $obj->survey_id, $obj->vote_option_id);
            $sql->execute();
        }
    }
}

if ($hide_teaser != null and $hide_teaser >= 0 and $hide_teaser <= 1) {
    $sql = $link->prepare("UPDATE pok_user_tbl
                                     SET hide_teaser=?
                                   WHERE id=?");
    $sql->bind_param('is', $hide_teaser,$id);
    $sql->execute();
}

$link->close();
