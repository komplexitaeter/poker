<?php
/*
 * B-57: sets (UP / DOWN) or removes (NONE) the reaction of a user (id = SID) on a visible entry of the public list.
 * One reaction per user id, entry and phase; the phase follows from the current status of the entry (roadmap_phase()),
 * the client does not send it. Answers with the updated entry (same shape as in get_roadmap.php).
 * 400: invalid parameters, 403: user id has not joined a board (not in pok_players_tbl), 404: entry does not exist or is not visible.
 */
require '../config.php';
require './lib.php';
require_post();
set_header('json');

$id = get_id_param("id");
$item = filter_input(INPUT_GET, "item", FILTER_VALIDATE_INT, array("options" => array("min_range" => 1)));
$reaction = get_text_param("reaction", 10);

if (strlen($id) < 10 || !is_int($item) || !in_array($reaction, array_merge(ROADMAP_REACTIONS, ['NONE']), true)) {
    http_response_code(400);
    exit;
}

$link = db_init('utf8mb4');

// only users who joined a board (player or observer), so not every random id can vote
// (dao.php creates a pok_user_tbl row for any id, so that table is no proof)
$sql = $link->prepare("select count(1) cnt from pok_players_tbl where id = ?");
$sql->bind_param('s', $id);
$sql->execute();
if ($sql->get_result()->fetch_object()->cnt < 1) {
    http_response_code(403);
    exit;
}

$items = get_roadmap_items($link, $id, $item);
if (count($items) !== 1) {
    http_response_code(404);
    exit;
}
$phase = roadmap_phase($items[0]['status']);

if ($reaction === 'NONE') {
    $sql = $link->prepare("delete from pok_roadmap_votes_tbl where item_id = ? and user_id = ? and phase = ?");
    $sql->bind_param('iss', $item, $id, $phase);
} else {
    $sql = $link->prepare("insert into pok_roadmap_votes_tbl (item_id, user_id, phase, reaction) values (?, ?, ?, ?) as new
                           on duplicate key update reaction = new.reaction");
    $sql->bind_param('isss', $item, $id, $phase, $reaction);
}
$sql->execute();

$items = get_roadmap_items($link, $id, $item);
$link->close();

echo json_encode($items[0], JSON_UNESCAPED_UNICODE);
