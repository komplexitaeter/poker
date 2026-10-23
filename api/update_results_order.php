<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$results_order = filter_input(INPUT_GET, "results_order") ?? '';

$link = db_init();
require_team($t, $link);

/* B-42: only NAME and SEQUENCE; the former in-game choice (CHOOSE, CHOOSE:NAME, CHOOSE:SEQUENCE) is gone */
if (!in_array($results_order, ['NAME', 'SEQUENCE'], true)) {
    $link->close();
    http_response_code(400);
    exit;
}

$sql = $link->prepare( "update pok_teams_tbl
                                    set results_order = ?
                                     where id=?");
$sql->bind_param('ss', $results_order, $t);
$sql->execute();

$link->close();
