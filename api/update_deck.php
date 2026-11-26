<?php
/*
 * B-98 S2: chooses the deck of a team: a variant of card_catalog.json (deck) and optionally single cards of its group
 * (cards, comma list; missing = all cards of the variant). The control cards stay as they are (update_controls.php).
 * POST, parameters in the query: t, deck, cards.
 * - 400: unknown variant, a card that is not in the variant's group, no card at all, malformed list.
 * - If the deck changes while at least one card is down, a new round starts in the same request (snapshot with the
 *   old deck, then all cards up); the client shows a hint before. Unchanged deck: no new round, no deck_rev change.
 * - Two parallel changes run one after the other (row lock), the second one never starts a second round.
 * - B-98 S4: deck = 'c-<set id>' chooses a custom set of the team (without cards: all its cards);
 *   400 for a set of another team, a deleted or empty set.
 * - B-98 (cards on/off): with cards, a custom set gets only these of its active cards (in position order; the set
 *   itself stays unchanged). 400 for a key that is no active card of this set or fewer than CUSTOM_DECK_MIN_CARDS
 *   cards. Switching cards on or off starts a new round if a card is down (any change of the set of cards, as for a
 *   save of the set in the editor, custom_update_team_deck(); a mere change of order starts none).
 * - B-98 V6: id (player id, optional) is remembered as the one who changed the card set if the set group changes.
 * Answer (JSON): {deck: {id, group, cards, controls, rev}, changed: bool, new_round: bool}
 */
require '../config.php';
require './lib.php';
require './lib_core_deck.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$player_id = get_uid(); // B-152 (UID); B-98 V6: who changes the card set ('' = unknown)
$deck_id = get_id_param('deck', 24);
$cards_param = filter_input(INPUT_GET, 'cards');

$link = db_init();
require_team($t, $link);

if (isset($cards_param) && !is_string($cards_param)) {
    http_response_code(400);
    exit;
}
$keys = is_string($cards_param) ? parse_card_keys($cards_param) : null;
if (is_string($cards_param) && $keys === null) {
    http_response_code(400);
    exit;
}

// B-151: the logic is core_deck_set() (lib_core_deck.php), shared with MCP card_sets choose; it notifies the team
$actor = ['uid' => $player_id, 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null];
$result = deck_core_call(fn() => core_deck_set($link, $actor, $deck_id, $keys));
$link->close();

set_header('json');
echo json_encode(array('deck' => $result['deck'], 'changed' => $result['changed'], 'new_round' => $result['new_round']));
