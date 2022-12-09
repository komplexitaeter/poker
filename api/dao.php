<?php
require '../config.php';
require './lib.php';

set_header('json');

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);

$data_obj = getDao($t, $id);

echo json_encode($data_obj, JSON_UNESCAPED_UNICODE);