<?php
require '../config.php';
require './lib.php';
require_post();

$id = get_text_param("id", 16);
$stars = (int)filter_input(INPUT_GET, "stars", FILTER_SANITIZE_NUMBER_INT );
// Store feedback text raw (trim + length limit only); escaping happens on output (B-02).
$text = get_text_param("text", 1800);

$link = db_init();

$sql = $link->prepare("INSERT INTO pok_feedback_tbl (id, fb_stars, fb_text) VALUES (?, ?, ?)");
$sql->bind_param('sis', $id, $stars, $text);
$sql->execute();
$link->close();
