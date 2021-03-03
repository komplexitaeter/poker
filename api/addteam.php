<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
$id = '';

if (strlen($t) > 0) {
    if (validate_team($t)) {
        $id = $t;
    }
    else {
        $link = db_init();

        $sql = "INSERT INTO pok_teams_tbl(id, cardset_flags) VALUES('".$t."','1111101001111110001')";

        if ($result = $link->query($sql)) {
            $id = $t; 
        }
        $link->close();
    }

}

print('{"id": "'.$id.'"}');