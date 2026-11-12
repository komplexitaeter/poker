<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: "Next item" - finishes the active topic item and starts a new round, in one transaction. S1b: also
 * "Finish item" for the last open item (same call): afterwards there is no active item (active_id null), the team's
 * note (pok_teams_tbl.topic) stays as it is (the same lock as
 * newround.php, so it cannot interleave with "New round", a card or a deck change). URL: t, item = id of the active
 * item as the board shows it (two people clicking at the same time finish one item only: the second gets 409).
 * 1. Cards down? -> start_new_round() as newround.php (snapshot with the note and topic_item_id = this item, the
 *    revealed round goes to the item: distribution, rounds_cnt, last_round_date; then all cards up). No card down ->
 *    no new round needed.
 * 2. The item is done: done_date, its distribution of the last revealed round, result = the card chosen by the team
 *    (result_auto 0) or the automatic one (deck_aim() 'agree': highest value; 'perspectives' or no vote: null).
 * 3. The next open item is active (none after the last one).
 * Answer: {ok, item_id (done), active_id (new active or null), result_card_key, result_auto};
 * 400 {error: item}, 409 {error: not_active, active_id} (item is not the active one, e.g. finished by someone else).
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
if ($id === 0) topic_fail(null, 400, 'item');

$link = db_init();
$catalog = card_catalog();
$link->begin_transaction();
$team = lock_team_deck($link, $t, $catalog); // team row lock, the deck of the round for the result rule
if ($team === null) {
    $link->rollback();
    http_response_code(403);
    exit;
}

$active = active_item_id($link, $t);
if ($active !== $id) topic_fail($link, 409, 'not_active', array('active_id' => $active));

$item = load_topic_item($link, $t, $id);
$chosen = ((int)$item['result_auto'] === 0) ? $item['result_card_key'] : null; // start_new_round() resets it

if (team_has_cards_down($link, $t)) start_new_round($link, $t);

$item = load_topic_item($link, $t, $id);
$distribution = decode_distribution($item['distribution']);
if ($chosen !== null) {
    $result = $chosen;
    $auto = 0;
} else {
    $infos = card_result_infos($link, $t, array_map('strval', array_keys((array)$distribution)), $catalog);
    $result = auto_result_key($distribution, $infos, deck_aim($team['deck'], $catalog, $team['custom_sets']));
    $auto = 1;
}

finish_topic_item($link, $t, $id, $result, $auto);

$next = active_item_id($link, $t);
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $next, 'result_card_key' => $result, 'result_auto' => $auto));
notify_team($t); // B-81
