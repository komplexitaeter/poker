<?php
function db_init() {
    $link = mysqli_init();
    $success = mysqli_real_connect(
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

function validate_team($t) {

    $link = db_init();

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

    $link->close();

    return $is_valid;
}

function getDao($t, $id) {
    $all_players_ready = true;
    $one_ore_more_player_ready = false;
    $name = '';
    $mkey = '';
    $card_key = '';
    $cardset = null;

    $link = db_init();

    /* set last callback of current player */
    $sql = "UPDATE pok_players_tbl 
               SET last_callback_time = current_timestamp 
             WHERE id='$id'
               AND team_id='$t'";
    $link->query($sql);

    $sql = "SELECT t.cardset
              FROM pok_teams_tbl as t 
             WHERE t.id = '$t'";
    if ($result = $link->query($sql)) {
        $obj = $result->fetch_object();
        $cardset=$obj->cardset;
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

            array_push($objs, $obj);
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
        array_push($players, $player);

    }

    return array(  "name"=> $name,
        "mkey"=>$mkey,
        "id"=>$id,
        "cardset"=>$cardset,
        "selected_card_key"=>$card_key,
        "all_players_ready"=>$all_players_ready_s,
        "one_ore_more_player_ready"=>$one_ore_more_player_ready_s,
        "players"=>$players );
}