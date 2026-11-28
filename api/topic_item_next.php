<?php
require '../config.php';
require './lib.php';
require './lib_core_items.php';
require_post();

/*
 * B-52: leaving the active topic item and starting a new round, in one transaction (the same lock as newround.php, so
 * it cannot interleave with "New round", a card or a deck change). URL: t, item = id of the active item as the board
 * shows it (two people clicking at the same time act once only: the second gets 409), mode (S1c), card (optional).
 * mode (S1c "leave the item", Andreas 2026-11-12):
 * - close (default, also if mode is missing): the item is done. card = the result to store (same check as
 *   topic_item_result.php, only for an 'agree' deck: 409 perspectives otherwise); without card the current estimate:
 *   the card chosen by the team (result_auto 0) or the automatic one (highest value). 'perspectives': no result.
 * - close_empty: the item is done without a value (result_card_key null, result_auto 0 = deliberately empty).
 * - later: "Bring it back later" - the item stays open (rounds, distribution, rounds_cnt, last_round_date stay, a chosen
 *   result is reset) and goes to the end of the open order; the next open item is active (the item itself if it is
 *   the only open one).
 * In every mode: cards down -> start_new_round() first, as newround.php (snapshot with the note and topic_item_id = this
 * item; the revealed round goes to the item: distribution, rounds_cnt, last_round_date; then all cards up).
 * B-130: with timer auto-start "New round" or "Next item" (timer_auto_restart 1/2) a visible timer restarts in every
 * mode, with or without cards down (leaving an item always starts a new round for the team, Andreas 2026-11-12).
 * Only "Next item" and no open item left (the last one finished): the timer is reset and paused instead.
 * Answer: {ok, item_id, active_id (new active or null), result_card_key, result_auto} (later: the open item's stored
 * result, null/1); 400 {error: item|mode|card}, 409 {error: not_active, active_id}, 409 {error: perspectives}.
 * B-151: thin wrapper around core_item_next() (api/lib_core_items.php), shared with MCP items next.
 */
const NEXT_MODES = array('close', 'close_empty', 'later');

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$mode = filter_has_var(INPUT_GET, 'mode') ? get_id_param('mode', 11) : 'close';
$card = get_id_param('card', 7);

if ($id === 0) topic_fail(null, 400, 'item');
if (!in_array($mode, NEXT_MODES, true)) topic_fail(null, 400, 'mode');
$card_given = (string)filter_input(INPUT_GET, 'card') !== '';
if ($card_given && ($card === '' || $mode !== 'close')) topic_fail(null, 400, 'card');

$link = db_init();
$result = topic_core_call(function () use ($link, $t, $id, $mode, $card_given, $card): array {
    try {
        return core_item_next($link, ['team_id' => $t], $id, $mode, $card_given ? $card : null);
    } catch (ItemNotActiveError $e) {
        topic_fail(null, 409, 'not_active', array('active_id' => $e->active_id));
    }
});
$link->close();

topic_ok($result);
