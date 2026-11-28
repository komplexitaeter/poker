<?php
require '../config.php';
require './lib.php';
require './lib_core_items.php';
require_post();

/*
 * B-52 S1: the team chooses the result of a topic item (open or done). URL: t, item, card = card key, or empty/missing
 * = back to the automatic result (highest value). Only for an 'agree' deck (deck_aim()). The card is a played one of the
 * item's distribution (for the active item also the running revealed round; also a card without a value, never a
 * control card) or a card of the team's current deck with a numeric_value. Stored with result_auto = 0. A new revealed
 * round of the active item resets the choice.
 * B-151: thin wrapper around core_item_result_set() (api/lib_core_items.php), shared with MCP items set_result.
 * Answer: {ok, item_id, active_id, result_card_key, result_auto}; 400 {error: item|card}, 404 {error: item},
 * 409 {error: perspectives} (deck without single result).
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$card = get_id_param('card', 7);

if ($id === 0) topic_fail(null, 400, 'item');
if ($card === '' && (string)filter_input(INPUT_GET, 'card') !== '') topic_fail(null, 400, 'card');

$link = db_init();
$result = topic_core_call(fn(): array => core_item_result_set($link, ['team_id' => $t], $id, $card === '' ? null : $card));
$link->close();

topic_ok($result);
