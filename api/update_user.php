<?php
require '../config.php';
require './lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$color_mode = filter_input(INPUT_GET, "color_mode", FILTER_SANITIZE_FULL_SPECIAL_CHARS	);
$survey_skipped = filter_input(INPUT_GET, "survey_skipped", FILTER_SANITIZE_NUMBER_INT );
$survey_vote =  filter_input(INPUT_GET, "survey_vote", FILTER_SANITIZE_NUMBER_INT );

$link = db_init();

if (in_array($color_mode, ['dark', 'light'])) {
    $sql = $link->prepare("UPDATE pok_user_tbl SET color_mode=? WHERE id=?");
    $sql->bind_param('ss', $color_mode, $id);
    $sql->execute();
}

if ($survey_skipped >= 0 && $survey_skipped <= 1) {
    echo($survey_skipped);
    $sql = $link->prepare("UPDATE pok_user_tbl
                                     SET survey_skipped=?
                                       , survey_skipped_date=CURRENT_TIMESTAMP
                                   WHERE id=?");
    $sql->bind_param('is', $survey_skipped, $id);
    $sql->execute();
}

if ($survey_vote >= 0) {
    /*$sql = $link->prepare("UPDATE pok_user_tbl SET survey_vote=?
                                                        ,survey_date=current_timestamp WHERE id=?");*/
    $sql->bind_param('is', $survey_vote, $id);
    $sql->execute();
}

$link->close();
