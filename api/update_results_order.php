<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);

$results_order = substr( filter_input(INPUT_GET, "results_order", FILTER_SANITIZE_URL) ,0,50);


$link = db_init();
validate_team($t, $link) or exit;

if ($results_order != null and in_array($results_order, ['NAME', 'SEQUENCE', 'CHOOSE'])) {
    if ($results_order == 'CHOOSE') {
        $sql = $link->prepare( "select results_order 
                                         from  pok_teams_tbl
                                         where id=?");
        $sql->bind_param('s',$t);
        $sql->execute();
        $result = $sql->get_result();

        if ($obj = $result->fetch_object()) {
            if ($obj->results_order == 'SEQUENCE') {
                $results_order = 'CHOOSE:SEQUENCE';
            } else {
                $results_order = 'CHOOSE:NAME';
            }
        } else {
            $results_order = 'CHOOSE:NAME';
        }
    }

    $sql = $link->prepare( "update pok_teams_tbl
                                        set results_order = ?
                                         where id=?");
    $sql->bind_param('ss', $results_order, $t);
    $sql->execute();

}

$link->close();