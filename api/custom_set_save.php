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
require './lib_core_deck.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$set_id = get_set_param();

$link = db_init();
require_team($t, $link);

if (card_catalog()['default_deck'] === null) custom_fail(400, 'catalog');
if ($set_id === 0) custom_fail(404, 'not_found');
$data = read_json_body();
if ($data === null) custom_fail(400, 'body');

// B-151: the logic is core_custom_set_save() (lib_core_deck.php), shared with MCP card_sets edit; deadlocks and lock
// wait timeouts are retried, after the last attempt 503; it notifies the team if anything changed
$actor = ['uid' => '', 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null];
$result = deck_core_call(fn() => core_custom_set_save($link, $actor, $set_id, $data));
$link->close();

set_header('json');
echo json_encode(array('set' => $result['set'], 'deck' => $result['deck'], 'changed' => $result['changed'],
                       'new_round' => $result['new_round']), JSON_UNESCAPED_UNICODE);
