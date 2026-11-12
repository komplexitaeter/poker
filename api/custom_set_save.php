<?php
/*
 * B-98 S4: saves a custom set of the team (editor "Save"): name, style and the complete card list in order.
 * POST ?t=<team>&set=<set id>, JSON body: {name, style, aim (optional, missing = unchanged; B-52 S1b), rev,
 *   force: bool (optional), cards: [card, ...]}
 *   card as in custom_set_create.php plus key: the card_key of an existing card of the set (null/missing = new card;
 *   a catalog card_key or the key of an active card of another own set = new card copied from that card, as in
 *   custom_set_create.php).
 * - The server compares the list with the active cards: a card with its key and unchanged symbol, text and numeric
 *   value keeps its key (position, heading, description and colour are updated in place); a change of symbol, text or
 *   value makes a new card (new key), the old one is kept inactive; active cards missing in the list are switched off.
 * - Card limit custom_cards_max() (default 20) only when cards are added: a set with more cards (migrated "Our deck") may
 *   keep them, but not grow.
 * - Optimistic lock: rev must be the rev the editor started from. Otherwise 409 {error: 'conflict', set: current set}
 *   ("Someone else changed this set"); saving again with force: true (or the new rev) overwrites.
 * - The set is the team's deck, a card is down and a card of the deck is gone (removed, or new key after a change of
 *   symbol, text or value): a new round starts (as a deck change). Added cards, heading, description, colour, order,
 *   name and style start none (Andreas 2026-11-03). Any change of the active set raises deck.rev.
 * - B-98 (cards on/off): cards the team switched off stay off (also after a change of symbol, text or value), removed
 *   cards drop out of the deck, added cards are on; fewer than 2 cards on = all cards on again.
 * - 404 {error: 'not_found'}: no set of this team (or deleted). 400 {error, index?} as in custom_set_create.php, plus rev.
 * Answer (JSON): {set, deck, changed, new_round}; nothing changed: changed false, no rev change, no notify.
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
$data = read_json_body();
if ($data === null) custom_fail(400, 'body');
$head = validate_custom_set_head($data, $catalog);
if (isset($head['error'])) custom_fail(400, $head['error']);
$rev = $data['rev'] ?? null;
if (!is_int($rev)) custom_fail(400, 'rev');
$force = ($data['force'] ?? false) === true;

$link->begin_transaction();
$team = lock_team_deck($link, $t, $catalog); // the team row lock serializes all changes of the team's sets
if ($team === null) {
    $link->rollback();
    http_response_code(403);
    exit;
}
$set = $team['custom_sets'][$set_id] ?? null;
if ($set === null) {
    $link->rollback();
    custom_fail(404, 'not_found');
}
if ($rev !== $set['rev'] && !$force) {
    $link->rollback();
    custom_fail(409, 'conflict', array('set' => $set));
}

$checked = validate_custom_cards($data['cards'] ?? null, load_set_cards_by_key($link, $set_id, $catalog), $catalog,
                                 custom_source_cards($team['custom_sets'], $set_id));
if (isset($checked['error'])) {
    $link->rollback();
    custom_fail(400, $checked['error'], isset($checked['index']) ? array('index' => $checked['index']) : array());
}
if (count($checked['cards']) > max(custom_cards_max(), count($set['cards']))) {
    $link->rollback();
    custom_fail(400, 'too_many_cards', array('max' => max(custom_cards_max(), count($set['cards']))));
}

$active = array();
foreach ($set['cards'] as $card) $active[$card['card_key']] = $card;
$stored = store_custom_cards($link, $set_id, $active, $checked['cards']);
$aim = $head['aim'] ?? $set['aim'];
$changed = $stored['changed'] || $head['name'] !== $set['name'] || $head['style'] !== $set['style'] || $aim !== $set['aim'];

$result = array('deck' => $team['deck'], 'new_round' => false);
if ($changed) {
    $sql = $link->prepare("update pok_custom_sets_tbl set name = ?, style = ?, aim = ?, rev = rev + 1 where id = ? and team_id = ?");
    $sql->bind_param('sssis', $head['name'], $head['style'], $aim, $set_id, $t);
    $sql->execute();
    if ($team['deck']['id'] === custom_deck_id($set_id))
        $result = custom_update_team_deck($link, $t, $team, $catalog, custom_deck_id($set_id), true, '',
                                          $stored['replaced']);
}
$set = load_custom_sets($link, $t, $catalog)[$set_id];
$link->commit();
$link->close();

if ($changed) notify_team($t); // B-81

set_header('json');
echo json_encode(array('set' => $set, 'deck' => $result['deck'], 'changed' => $changed,
                       'new_round' => $result['new_round']), JSON_UNESCAPED_UNICODE);
