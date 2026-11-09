<?php
require '../config.php';
require './lib.php';

set_header('json');

/*
 * B-127: light heartbeat of the board. On every hb of poker-msg the board calls this instead of loading dao.php:
 * it marks the own board as connected (B-110, like dao.php) and returns the signature of the away persons. The board
 * loads dao.php only when away_sig differs from the one of its last dao.php load.
 * Response: {"away_sig":"<sha1>"} or {"away_sig":""} when nobody is away. Never player ids.
 * No validate_team(): like dao.php, the bound team_id limits UPDATE and SELECT to the team, an unknown team just gives
 * an empty signature (no 4xx for normal boards). No notify_team(): a read-like call must never notify (B-81).
 */

$id = get_id_param("id");
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);

if (strlen($id) < 10) die();

$link = db_init();
touch_player($link, $id, $t);
$away_sig = load_away_sig($link, $id, $t);
$link->close();

echo json_encode(array("away_sig" => $away_sig));
