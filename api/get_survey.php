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

$temp = '{
  "survey_id": 1,
  "votes_count": 200,
  "survey_intro": "Currently working on a feature to sort the cards (after revealed) by values and not by player\'s names, like it is now). Would you like it...",
  "vote_options": [
    {"id": 1, "text": "no (leave as is)", "votes_count": 66, "votes_percentage": 33},
    {"id": 2, "text": "to automatically sort", "votes_count": 42, "votes_percentage": 21},
    {"id": 3, "text": "to have a button to sort", "votes_count": 32, "votes_percentage": 16},
    {"id": 4, "text": "configurable over toggle", "votes_count": 60, "votes_percentage": 30}
  ]
}';

//echo json_encode(array("vote_results"=>$vote_results), JSON_UNESCAPED_UNICODE);

echo $temp;