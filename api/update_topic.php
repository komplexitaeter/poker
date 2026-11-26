<?php
require '../config.php';
require './lib.php';
require './lib_core_team.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$topic = cut_text((string)filter_input(INPUT_POST, "topic"), 2000);

$link = db_init();
require_team($t, $link);

// B-150: same core function as PUT /api/v1/team/note (cuts instead of refusing, as before); notifies the team (B-81)
core_team_note_set($link, ['team_id' => $t], $topic);

$link->close();
