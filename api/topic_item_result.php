<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: the team chooses the result of a topic item (open or done). URL: t, item, card = card key, or empty/missing
 * = back to the automatic result (highest value). Only for an 'agree' deck (deck_aim()). The card is a played one of the
 * item's distribution (for the active item also the running revealed round; also a card without a value, never a
 * control card) or a card of the team's current deck with a numeric_value. Stored with result_auto = 0. A new revealed
 * round of the active item resets the choice.
 * Answer: {ok, item_id, active_id, result_card_key, result_auto}; 400 {error: item|card}, 404 {error: item},
 * 409 {error: perspectives} (deck without single result).
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$card = get_id_param('card', 7);

if ($id === 0) topic_fail(null, 400, 'item');
if ($card === '' && (string)filter_input(INPUT_GET, 'card') !== '') topic_fail(null, 400, 'card');

$link = db_init();
$catalog = card_catalog();
$link->begin_transaction();
$team = lock_team_deck($link, $t, $catalog); // locks the team row like lock_team_topics()
if ($team === null) {
    $link->rollback();
    http_response_code(403);
    exit;
}

$item = load_topic_item($link, $t, $id);
if ($item === null) topic_fail($link, 404, 'item');

$active = active_item_id($link, $t);

if ($card === '') {
    // automatic: open items compute the proposal in dao.php, done items store it
    $done_distribution = decode_distribution($item['distribution']);
    $infos = card_result_infos($link, $t, array_map('strval', array_keys((array)$done_distribution)), $catalog);
    $result = $item['status'] === 'done' ? auto_result_key($done_distribution, $infos,
                                                         deck_aim($team['deck'], $catalog, $team['custom_sets'])) : null;
    $auto = 1;
} else {
    if (deck_aim($team['deck'], $catalog, $team['custom_sets']) !== 'agree') topic_fail($link, 409, 'perspectives');
    // a played card (also without a value), or a card of the current deck with a value (alternative dropdown)
    if (!result_card_allowed($link, $t, $team, $item, $active === $id, $card, $catalog)) topic_fail($link, 400, 'card');
    $result = $card;
    $auto = 0;
}

set_topic_item_result($link, $t, $id, $result, $auto);
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $active, 'result_card_key' => $result, 'result_auto' => $auto));
notify_team($t); // B-81
