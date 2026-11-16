<?php
require '../config.php';
require './lib.php';
require_post();

$id = get_id_param("id");
$color_mode = filter_input(INPUT_GET, "color_mode", FILTER_SANITIZE_FULL_SPECIAL_CHARS	);
// B-57: hide_teaser = 1 means "the user has opened the feedback panel once" (red dot on the feedback menu gone)
$hide_teaser = filter_input(INPUT_GET, "hide_teaser", FILTER_SANITIZE_NUMBER_INT );


$link = db_init();

if ($color_mode != null and in_array($color_mode, ['dark', 'light'])) {
    $sql = $link->prepare("UPDATE pok_user_tbl SET color_mode=? WHERE id=?");
    $sql->bind_param('ss', $color_mode, $id);
    $sql->execute();
}

if ($hide_teaser != null and $hide_teaser >= 0 and $hide_teaser <= 1) {
    $sql = $link->prepare("UPDATE pok_user_tbl
                                     SET hide_teaser=?
                                   WHERE id=?");
    $sql->bind_param('is', $hide_teaser,$id);
    $sql->execute();
}

$link->close();
