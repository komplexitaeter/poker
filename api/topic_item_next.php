<?php
require '../config.php';
require './lib.php';
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

$aim = deck_aim($team['deck'], $catalog, $team['custom_sets']);
$item = load_topic_item($link, $t, $id);
if ($card_given) {
    if ($aim !== 'agree') topic_fail($link, 409, 'perspectives');
    if (!result_card_allowed($link, $t, $team, $item, true, $card, $catalog)) topic_fail($link, 400, 'card');
}
$chosen = ((int)$item['result_auto'] === 0) ? $item['result_card_key'] : null; // start_new_round() resets it

if (team_has_cards_down($link, $t)) start_new_round($link, $t);

if ($mode === 'later') {
    postpone_topic_item($link, $t, $id);
    $result = null;
    $auto = 1;
} else {
    if ($mode === 'close_empty') {
        $result = null;
        $auto = 0;
    } elseif ($aim !== 'agree') {
        $result = null; // perspectives: only the distribution
        $auto = 1;
    } elseif ($card_given) {
        $result = $card;
        $auto = 0;
    } elseif ($chosen !== null) {
        $result = $chosen;
        $auto = 0;
    } else {
        $item = load_topic_item($link, $t, $id);
        $distribution = decode_distribution($item['distribution']);
        $infos = card_result_infos($link, $t, array_map('strval', array_keys((array)$distribution)), $catalog);
        $result = auto_result_key($distribution, $infos, $aim);
        $auto = 1;
    }
    finish_topic_item($link, $t, $id, $result, $auto);
}

$next = active_item_id($link, $t);

/* B-130: leaving an item always starts a new round for the team (Andreas, 2026-11-12): auto-start "New round" and
   "Next item" restart the timer in every mode (also "later" as the only open item), with or without cards down.
   With cards down start_new_round() above may have restarted it already; restarting again is the same.
   Exception (Andreas, 2026-11-12): "Next item" and the last open item was finished (close/close_empty, no active
   item left): the timer is reset and paused like a manual reset; it runs again when someone presses play. */
if ($next === null) {
    restart_timer_for_auto_modes($link, $t, array(TIMER_AUTO_NEW_ROUND));
    reset_timer_for_auto_modes($link, $t, array(TIMER_AUTO_NEXT_ITEM));
} else {
    restart_timer_for_auto_modes($link, $t, array(TIMER_AUTO_NEW_ROUND, TIMER_AUTO_NEXT_ITEM));
}
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $next, 'result_card_key' => $result, 'result_auto' => $auto));
notify_team($t); // B-81
