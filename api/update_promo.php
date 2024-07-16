<?php
require '../config.php';
require './lib.php';

$id = filter_input(INPUT_GET, 'id', FILTER_SANITIZE_NUMBER_INT);
$action = filter_input(INPUT_GET, 'action', FILTER_SANITIZE_STRING);

if (is_null($id) || is_null($action)) {
    http_response_code(400);
    exit('Invalid request');
}

$link = db_init();

switch ($action) {
    case 'played_out':
        $sql = $link->prepare("UPDATE pok_promotions_tbl SET played_out = CURRENT_TIMESTAMP WHERE id = ?");
        break;

    case 'expanded':
        $sql = $link->prepare("UPDATE pok_promotions_tbl SET first_expanded = IFNULL(first_expanded, CURRENT_TIMESTAMP), expansions_count = expansions_count + 1 WHERE id = ?");
        break;

    case 'converted_img':
        $sql = $link->prepare("UPDATE pok_promotions_tbl SET converted = CURRENT_TIMESTAMP, cta_used = 'img' WHERE id = ?");
        break;

    case 'converted_a':
        $sql = $link->prepare("UPDATE pok_promotions_tbl SET converted = CURRENT_TIMESTAMP, cta_used = 'a' WHERE id = ?");
        break;

    case 'hided':
        $sql = $link->prepare("UPDATE pok_promotions_tbl SET hided = CURRENT_TIMESTAMP WHERE id = ?");
        break;

    default:
        http_response_code(400);
        exit('Invalid action');
}

$sql->bind_param('i', $id);

if ($sql->execute()) {
    http_response_code(200);
} else {
    http_response_code(500);
    exit('Database error');
}

$link->close();