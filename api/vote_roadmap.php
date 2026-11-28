<?php
/*
 * B-57: sets (UP / DOWN) or removes (NONE) the reaction of a user (id = SID) on a visible entry of the public list.
 * One row per user id, entry and phase; the phase follows from the current status of the entry (roadmap_phase()),
 * the client does not send it. NONE is stored as a row too (not deleted): the public list counts the latest row of a
 * user over all phases, so after removing a vote on a DONE entry the old WANT vote must not count again. Answers with the updated entry (same shape as in get_roadmap.php).
 * 400: invalid parameters, 403: user id has not joined a board (not in pok_players_tbl), 404: entry does not exist or is not visible.
 */
require '../config.php';
require './lib.php';
require './lib_core_feedback.php';
require_post();
set_header('json');

$id = get_uid(); // B-152: header X-Poker-User, transitionally body uid or URL id
$item = filter_input(INPUT_GET, "item", FILTER_VALIDATE_INT, array("options" => array("min_range" => 1)));
$reaction = get_text_param("reaction", 10);

if ($id === '' || !is_int($item) || !in_array($reaction, array_merge(ROADMAP_REACTIONS, ['NONE']), true)) {
    http_response_code(400);
    exit;
}

$link = db_init();
// B-151: core_roadmap_vote() (lib_core_feedback.php), shared with MCP feedback vote
try {
    $entry = core_roadmap_vote($link, $id, $item, $reaction);
} catch (ApiError $e) {
    http_response_code($e->status === 403 ? 403 : 404);
    exit;
}
$link->close();

echo json_encode($entry, JSON_UNESCAPED_UNICODE);
