<?php
require '../config.php';
require './lib.php';
set_header('json');

$vote_results = array();

$link = db_init();

$sql = $link->prepare("select survey_vote vote_option
                                    ,count(1) total_count 
                                from pok_user_tbl
                                where survey_vote is not null
                               group by survey_vote");
$sql->execute();
$result = $sql->get_result();
while ($obj = $result->fetch_object()) {
    $vote_result = (object) array("vote_option"=>(Int)$obj->vote_option
                          ,"total_count"=>(Int)$obj->total_count);
    $vote_results[] = $vote_result;
}

$link->close();

echo json_encode(array("vote_results"=>$vote_results), JSON_UNESCAPED_UNICODE);
