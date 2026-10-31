<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$link = db_init();
require_team($t, $link);

start_new_round($link, $t); // B-98 S2: shared with update_deck.php (api/lib.php)

$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
