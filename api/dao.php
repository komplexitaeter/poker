<?php
require '../config.php';
require './lib.php';

set_header('json');

// B-81: never call notify_team() here - every pull loads dao.php, a notification would trigger the next pull (endless loop).

$id = get_id_param("id");
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$data_obj = getDao($t, $id);

echo json_encode($data_obj, JSON_UNESCAPED_UNICODE);