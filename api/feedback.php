<?php
require '../config.php';
require './lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$stars = filter_input(INPUT_GET, "stars", FILTER_SANITIZE_NUMBER_INT );
$text = substr( filter_input(INPUT_GET, "text", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,1800);

$link = db_init();

$sql = "INSERT INTO pok_feedback_tbl (id, fb_stars, fb_text) VALUES ('".$id."','".$stars."','".$text."')";

$link->query($sql);
$link->close();
