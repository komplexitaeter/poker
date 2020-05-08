<?php
require 'config.php';
require 'lib.php';

header("Cache-Control: no-cache");
header("Content-Type: text/event-stream");

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
validate_team($t) or exit;

while (true) {

    echo "event: dao\n";
    echo "data: ".json_encode(getDao($t, $id));
    echo "\n\n";

    if(ob_get_length() > 0) ob_end_flush();
    flush();
    usleep(400000);

}