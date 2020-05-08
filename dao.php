<?php
require 'config.php';
require 'lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team_conf($t, $cardset) or exit;

$all_players_ready = true;
$one_ore_more_player_ready = false;
$name = '';
$mkey = '';
$card_key = '';

$link = mysqli_init();
$success = mysqli_real_connect(
   $link, 
   _MYSQL_HOST, 
   _MYSQL_USER, 
   _MYSQL_PWD, 
   _MYSQL_DB,
   _MYSQL_PORT 
);

$sql = "SELECT * FROM pok_players_tbl WHERE team_id = '".$t."' ORDER BY name";

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
        $card_key = $obj->card_key;
    else if (is_null($obj->card_key))
        $card_key = 'prgrss1';
        else
            $card_key = 'done001';

    $player = (object) array("name"=>$obj->name
                            ,"mkey"=>$obj->mkey
                            ,"display_card_key"=>$card_key);
    array_push($players, $player);

}

echo(json_encode(
    array(  "name"=> $name,
            "mkey"=>$mkey,
            "id"=>$id,
            "cardset"=>$cardset,
            "selected_card_key"=>$card_key,
            "all_players_ready"=>$all_players_ready_s,
            "one_ore_more_player_ready"=>$one_ore_more_player_ready_s,
            "players"=>$players )));
