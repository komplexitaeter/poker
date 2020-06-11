<?php
require 'config.php';
require 'lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

$mkey = filter_input(INPUT_GET, "mkey", FILTER_SANITIZE_NUMBER_INT);
 
print('mkey: '.$mkey);

if (strlen($mkey)>0) {

    $link = db_init();

    $sql = "DELETE FROM pok_players_tbl WHERE team_id='".$t."' and mkey = ".$mkey;

    $link->query($sql);
    $link->close();

}