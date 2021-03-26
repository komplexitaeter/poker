<?php
require '../config.php';
require './lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$color_mode = filter_input(INPUT_GET, "color_mode", FILTER_SANITIZE_FULL_SPECIAL_CHARS	);

if (in_array($color_mode, ['dark', 'light'])) {
    $link = db_init();
    $sql = $link->prepare("UPDATE pok_user_tbl SET color_mode=? WHERE id=?");
    $sql->bind_param('ss', $color_mode, $id);
    $sql->execute();
    $link->close();
}