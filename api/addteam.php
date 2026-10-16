<?php
require '../config.php';
require './lib.php';

$t = get_text_param("t", 80);

$link = db_init();
$id_val = add_team($link, $t);
$link->close();

print('{"id": "'.$id_val.'"}');