<?php
function initialize_streaming($resource_name) {
    set_header('event-stream');
    ob_implicit_flush(1);

    $id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);

    $t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
    validate_team($t) or exit;

    $count = 0;

    /* force client reconnect after a couple of minutes*/
    while ($count<2500) {
        $data_obj = null;

        $data_obj = get_data_obj($resource_name, $t, $id);

        $str  = "event: update\n";
        $str .= "data: ".json_encode($data_obj, JSON_UNESCAPED_UNICODE);
        $str .= "\n\n";

        $trash = '';
        if (strlen($str)<4096-21) {
            for ($i = 1; $i < 4096-strlen($str)-21; $i++) {
                $trash .= "X";
            }
            $str .= "event: trash\n";
            $str .= "data: " . json_encode($trash);
            $str .= "\n\n";
        }

        echo $str;

        if(ob_get_length() > 0) ob_end_flush();
        flush();

        usleep(300000);
        $count++;
    }
}

function initialize_pulling($resource_name) {
    set_header('json');

    $id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);

    $t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
    validate_team($t) or exit;

    $data_obj = get_data_obj($resource_name, $t, $id);

    echo json_encode($data_obj, JSON_UNESCAPED_UNICODE);
}

function get_data_obj($resource_name, $t, $id) {
    $data_obj = null;
    if ($resource_name == 'dao') {
        $data_obj = getDao($t, $id);
    }
    return $data_obj;
}