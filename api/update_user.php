<?php
require '../config.php';
require './lib.php';
require_post();

$id = get_uid(); // B-152: header X-Poker-User, transitionally body uid or URL id
$color_mode = filter_input(INPUT_GET, "color_mode", FILTER_SANITIZE_FULL_SPECIAL_CHARS	);
// B-57: hide_teaser = 1 means "the user has opened the feedback panel once" (red dot on the feedback menu gone)
$hide_teaser = filter_input(INPUT_GET, "hide_teaser", FILTER_SANITIZE_NUMBER_INT );

// B-88: no valid user id, nothing to store (B-152: get_uid() is '' below 10 characters, as in dao.php)
if ($id === '') exit;

$link = db_init();

// The user row is normally created by the first dao.php of a board. A user who changes a setting on the start page
// before ever opening a board has no row yet, so a plain UPDATE would change 0 rows and lose the setting. Insert the
// row with the setting instead; ON DUPLICATE KEY makes it idempotent and race-free like the insert in dao.php (B-21).
if ($color_mode != null and in_array($color_mode, ['dark', 'light'])) {
    $sql = $link->prepare("insert into pok_user_tbl(id, color_mode) values(?, ?)
                               on duplicate key update color_mode=?");
    $sql->bind_param('sss', $id, $color_mode, $color_mode);
    $sql->execute();
}

if ($hide_teaser != null and $hide_teaser >= 0 and $hide_teaser <= 1) {
    $hide_teaser = (int)$hide_teaser;
    $sql = $link->prepare("insert into pok_user_tbl(id, hide_teaser) values(?, ?)
                               on duplicate key update hide_teaser=?");
    $sql->bind_param('sii', $id, $hide_teaser, $hide_teaser);
    $sql->execute();
}

$link->close();
