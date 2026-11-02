<?php
/*
 * B-98 S4: deletes a custom set of the team (soft delete: deleted = 1, its cards stay for the round history and for
 * cards still on the table). POST ?t=<team>&set=<set id>, no body.
 * - The set is the team's deck: the team falls back to the default deck (all its cards, control cards unchanged);
 *   if a card is down, a new round starts first (the client asks before, B-98).
 * - 404 {error: 'not_found'}: no set of this team (or already deleted).
 * Answer (JSON): {deck, new_round}
 */
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$set_id = get_set_param();

$link = db_init();
require_team($t, $link);

$catalog = card_catalog();
if ($catalog['default_deck'] === null) custom_fail(400, 'catalog');
if ($set_id === 0) custom_fail(404, 'not_found');

$link->begin_transaction();
$team = lock_team_deck($link, $t, $catalog); // the team row lock serializes all changes of the team's sets
if ($team === null) {
    $link->rollback();
    http_response_code(403);
    exit;
}
if (!isset($team['custom_sets'][$set_id])) {
    $link->rollback();
    custom_fail(404, 'not_found');
}
$sql = $link->prepare("update pok_custom_sets_tbl set deleted = 1, rev = rev + 1 where id = ? and team_id = ?");
$sql->bind_param('is', $set_id, $t);
$sql->execute();

$result = array('deck' => $team['deck'], 'new_round' => false);
if ($team['deck']['id'] === custom_deck_id($set_id))
    $result = custom_update_team_deck($link, $t, $team, $catalog, (string)$catalog['default_deck'], true);
$link->commit();
$link->close();

notify_team($t); // B-81: the deck menus of the team drop the set

set_header('json');
echo json_encode(array('deck' => $result['deck'], 'new_round' => $result['new_round']), JSON_UNESCAPED_UNICODE);
