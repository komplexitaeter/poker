<?php
/*
 * B-98 S4: deletes a custom set of the team (soft delete: deleted = 1, its cards stay for the round history and for
 * cards still on the table). POST ?t=<team>&set=<set id>&id=<player id, optional>, no body.
 * - The set is the team's deck: the team falls back to the default deck (all its cards, control cards unchanged);
 *   if a card is down, a new round starts first (the client asks before, B-98).
 * - 404 {error: 'not_found'}: no set of this team (or already deleted).
 * Answer (JSON): {deck, new_round}
 */
require '../config.php';
require './lib.php';
require './lib_core_deck.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$set_id = get_set_param();
$player_id = get_uid(); // B-152 (UID); B-98 V6: who changes the card set (deleting the active set), optional

$link = db_init();
require_team($t, $link);

if (card_catalog()['default_deck'] === null) custom_fail(400, 'catalog');
if ($set_id === 0) custom_fail(404, 'not_found');

// B-151: the logic is core_custom_set_delete() (lib_core_deck.php), shared with MCP card_sets delete; deadlocks and
// lock wait timeouts are retried, after the last attempt 503; it notifies the team
$actor = ['uid' => $player_id, 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null];
$result = deck_core_call(fn() => core_custom_set_delete($link, $actor, $set_id));
$link->close();

set_header('json');
echo json_encode(array('deck' => $result['deck'], 'new_round' => $result['new_round']), JSON_UNESCAPED_UNICODE);
