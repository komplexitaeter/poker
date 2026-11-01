<?php
require '../config.php';
require './lib.php';
require_post();

$id = get_id_param("id");
// a missing or manipulated id must not delete the rows with an empty id of all teams (B-88)
if ($id === '') exit;
$link = db_init();

// B-81: the user is removed from all teams, so every board of these teams has to reload. Read the teams before the
// DELETE, afterwards they are gone.
$team_ids = array();
$sql = $link->prepare("select distinct team_id from pok_players_tbl where id=?");
$sql->bind_param('s', $id);
$sql->execute();
$result = $sql->get_result();
while ($row = $result->fetch_row()) {
    $team_ids[] = (string)$row[0];
}
$sql->close();

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

$sql = $link->prepare("DELETE FROM pok_roadmap_votes_tbl WHERE user_id=?");
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

notify_teams($team_ids);
