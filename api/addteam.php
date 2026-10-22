<?php
require '../config.php';
require './lib.php';

set_header('json');

$t = get_text_param("t", 80);

$link = db_init();
$id_val = add_team($link, $t);
$link->close();

echo json_encode(array("id" => $id_val), JSON_UNESCAPED_UNICODE);