<?php
require '../config.php';
require './lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$link = db_init();

$sql = $link->prepare("DELETE FROM pok_feedback_tbl WHERE id=?");
$sql->bind_param('s', $id);
$sql->execute();

$sql = $link->prepare("DELETE FROM pok_roundstat_details_tbl WHERE player_id=?");
$sql->bind_param('s', $id);
$sql->execute();
$sql->close();

$sql = $link->prepare("DELETE FROM pok_survey_votes_tbl WHERE user_id=?");
$sql->bind_param('s', $id);
$sql->execute();
$sql->close();

$sql = $link->prepare("DELETE FROM pok_players_tbl WHERE id=?");
$sql->bind_param('s', $id);
$sql->execute();
$sql->close();

$sql = $link->prepare("DELETE FROM pok_user_tbl WHERE id=?");
$sql->bind_param('s', $id);
$sql->execute();
$sql->close();

$link->close();
