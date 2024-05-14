<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_STRING	) ,0,80);

$link = db_init();
$id_val = add_team($link, $t);
$link->close();

print('{"id": "'.$id_val.'"}');