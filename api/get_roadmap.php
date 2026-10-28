<?php
/* B-57: public list "Ideas & Bugs" - visible entries with reaction counts and the reaction of the user (id = SID) */
require '../config.php';
require './lib.php';
set_header('json');

$id = get_text_param("id", 16);

$link = db_init('utf8mb4');
$items = get_roadmap_items($link, $id);
$link->close();

echo json_encode(array("items" => $items), JSON_UNESCAPED_UNICODE);
