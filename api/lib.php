<?php
function db_init() {
    //sleep(5);
    $link = mysqli_init();
    mysqli_real_connect(
        $link,
        _MYSQL_HOST,
        _MYSQL_USER,
        _MYSQL_PWD,
        _MYSQL_DB,
        _MYSQL_PORT
    );
    $link->set_charset("utf8");
    return $link;
}

function set_header($content_type) {
    if ($content_type=='json') {
        header('Content-Type: application/json; charset=utf-8');
    }
    else if ($content_type=='event-stream') {
        header("Content-Type: text/event-stream; charset=utf-8");
    }
    else if ($content_type=='svg') {
        header('Content-type: image/svg+xml');
    }
    header('Pragma-directive: no-cache');
    header('Cache-directive: no-cache');
    header('Cache-control: no-cache');
    header('Pragma: no-cache');
    header('Expires: 0');
}

function validate_team($t, $link) {

    $sql = "SELECT count(1) cnt FROM pok_teams_tbl WHERE id = '".$t."'";

    if ($result = $link->query($sql)) {
        $obj = $result->fetch_object();

        if ($obj->cnt==1) {
            $is_valid = true;
        }
        else {
            $is_valid = false;
        }
        $result->close();
    }
    else {
        $is_valid = false;
    }

    return $is_valid;
}

function getDao($t, $id) {
    $all_players_ready = true;
    $one_ore_more_player_ready = false;
    $name = '';
    $mkey = '';
    $timer_time = null;
    $timer_status = null;
    $timer_visibility = 0;
    $card_key = '';
    $cardset_flags = null;
    $team_name = null;
    $color_mode = 'dark';
    $survey = 'NO';
    $topic = null;
    $results_order = 'NAME';

    $link = db_init();

    validate_team($t, $link) or exit;

    /* set last callback of current player */
    $sql = "UPDATE pok_players_tbl 
               SET last_callback_time = current_timestamp 
             WHERE id='$id'
               AND team_id='$t'";
    $link->query($sql);

    $sql = "SELECT t.cardset_flags
                  ,t.name
                  ,if(not isnull(t.timer_start_time) and isnull(t.timer_pause_time)
                      ,'RUNNING'
                      ,'PAUSED') timer_status
                  ,timestampdiff(SECOND
                                ,ifnull(t.timer_start_time, current_timestamp)
                                ,ifnull(t.timer_pause_time, current_timestamp)) timer_time
                  ,t.timer_visibility
                  ,t.topic
                  ,t.results_order
            FROM pok_teams_tbl as t
             WHERE t.id = '$t'";
    if ($result = $link->query($sql)) {
        $obj = $result->fetch_object();
        $cardset_flags = $obj->cardset_flags;
        $team_name = $obj->name;
        $timer_status = $obj->timer_status;
        $timer_time = $obj->timer_time;
        $timer_visibility = $obj->timer_visibility;
        $topic = $obj->topic;
        $results_order = $obj->results_order;
    }

    $sql = "SELECT p.* 
              FROM pok_players_tbl p
             WHERE p.team_id = '$t' 
             ORDER BY p.name";
    $objs = array();
    if ($result = $link->query($sql)) {
        while(  $obj = $result->fetch_object()) {

            if ($obj->id == $id) {
                $name=$obj->name;
                $mkey=$obj->mkey;
                $card_key=$obj->card_key;
            }

            if (is_null($obj->card_key)) $all_players_ready = false;
            else $one_ore_more_player_ready = true;

            $objs[] = $obj;
        }
    }


    $sql = $link->prepare("SELECT count(1) as user_exists
                                     ,max(u.color_mode) as color_mode
                                     ,max(u.survey_id) as survey_id
                                     ,max(u.survey_skipped) as survey_skipped
                                    ,max((select count(1) 
                                            from pok_survey_votes_tbl v 
                                           where v.user_id = u.id 
                                             and v.survey_id = u.survey_id) ) voted
                                FROM pok_user_tbl u WHERE u.id=?");
    $sql->bind_param('s', $id);
    $sql->execute();
    $result = $sql->get_result();
    if ($obj = $result->fetch_object()) {
        if ($obj->user_exists == 0) {
            require './survey_selector.php';
            $survey_id = get_survey_id($link, $t, $id);
            if ($survey_id != null) $survey = 'LOUD';
            $sql_i = $link->prepare("INSERT INTO pok_user_tbl(id,survey_id) values(?,?)");
            $sql_i->bind_param('si', $id, $survey_id);
            $sql_i->execute();
        } else {
            $color_mode = $obj->color_mode;
            if ($obj->survey_id > 0) {
                if ($obj->voted != 0) $survey = 'VOTED';
                elseif ($obj->survey_skipped != 0)  $survey = 'SILENT';
                else $survey = 'LOUD';
            } elseif ($obj->survey_id == -1) {
                require './survey_selector.php';
                $survey_id = get_survey_id($link, $t, $id);
                if ($survey_id != null) {
                    $survey = 'LOUD';
                    $sql_i = $link->prepare("UPDATE pok_user_tbl SET survey_id=? WHERE id=?");
                    $sql_i->bind_param('is', $survey_id, $id);
                } else {
                    $sql_i = $link->prepare("UPDATE pok_user_tbl SET survey_id=null WHERE id=?");
                    $sql_i->bind_param('s',$id);
                }
                $sql_i->execute();
            }
        }
    }


    $link->close();

    if ($all_players_ready) $all_players_ready_s = 'true'; else $all_players_ready_s = 'false';
    if ($one_ore_more_player_ready) $one_ore_more_player_ready_s = 'true'; else $one_ore_more_player_ready_s = 'false';

    $players=array();
    foreach($objs as $obj) {

        if ($all_players_ready)
            $display_card_key = $obj->card_key;
        else if (is_null($obj->card_key))
            $display_card_key = 'prgrss1';
        else
            $display_card_key = 'done001';

        $player = (object) array("name"=>$obj->name
        ,"mkey"=>$obj->mkey
        ,"display_card_key"=>$display_card_key);
        $players[] = $player;

    }


    return array(  "name"=> $name,
        "mkey"=>$mkey,
        "id"=>$id,
        "color_mode"=>(String)$color_mode,
        "survey"=>$survey,
        "team_name"=>$team_name,
        "cardset_flags"=>$cardset_flags,
        "topic"=>(String)$topic,
        "timer_status"=>$timer_status,
        "timer_time"=>(Int)$timer_time,
        "timer_visibility"=>(Int)$timer_visibility,
        "results_order"=>$results_order,
        "selected_card_key"=>$card_key,
        "all_players_ready"=>$all_players_ready_s,
        "one_ore_more_player_ready"=>$one_ore_more_player_ready_s,
        "players"=>$players );
}

function name2id($name) {
    $id='';
    $mix=array(
        "0" => array('0','O','o'),
        "1" => array('1','I','T'),
        "2" => array('2','Z','z'),
        "3" => array('3','E'),
        "4" => array('4','A'),
        "5" => array('5','F'),
        "6" => array('6','S','G'),
        "7" => array('7','T'),
        "8" => array('8','H'),
        "9" => array('9','g'),
        "a" => array('a','A','4'),
        "b" => array('b','B','3'),
        "c" => array('c','C'),
        "d" => array('d','D','0','O'),
        "e" => array('e','E','3'),
        "f" => array('f','F','1'),
        "g" => array('g','G','6'),
        "h" => array('h','H','8'),
        "i" => array('i','I','J','1'),
        "j" => array('j','J','I'),
        "k" => array('k','K','5'),
        "l" => array('l','L','7'),
        "m" => array('m','M'),
        "n" => array('n','N'),
        "o" => array('o','O','0'),
        "p" => array('p','P'),
        "q" => array('q','Q'),
        "r" => array('r','R'),
        "s" => array('s','S','6','9'),
        "t" => array('t','T','1','7'),
        "u" => array('u','U'),
        "v" => array('v','V','U'),
        "w" => array('w','W'),
        "x" => array('x','X'),
        "y" => array('y','Y'),
        "z" => array('z','Z','2'),
        "." => array('-','_'),
        "-" => array('-','_'),
        "_" => array('-','_'),
        "?" => array('S'),
        " " => array('_'),
        "*" => array('0','1','2','3','4','5','6','7','8','9')
    );
    $null_signs = array('x','X','0','o','O');

    for ($i=0;$i<strlen($name);$i++) {
        if (!isset($mix[strtolower($name[$i])]) or !$signs = $mix[strtolower($name[$i])]) {
            $signs = $null_signs;
        }
        $id.=$signs[rand(0,count($signs)-1)];
    }

    return $id;
}

function get_team_id($name, $link) {

    $sql = $link->prepare("select count(1) cnt from pok_teams_tbl where id=?");
    $id = name2id($name);

    for ($i=0;$i<80;$i++) {
        $sql->bind_param("s", $id);
        $sql->execute();
        $result = $sql->get_result();
        $obj = $result->fetch_object();

        if ($obj->cnt == 0){
            break;
        } else {
            if ($i>(strlen($name)/2)) {
                $id = name2id($id.'*');
            }
        }
    }

    return $id;
}