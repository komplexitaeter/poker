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
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$player_id = get_id_param('id'); // B-98 V6: who changes the card set ('' = unknown)
$deck_id = get_id_param('deck', 24);
$cards_param = filter_input(INPUT_GET, 'cards');

$link = db_init();
require_team($t, $link);

$catalog = card_catalog();
$set_id = custom_set_id_of($deck_id);
$entry = catalog_variants($catalog)[$deck_id] ?? null;
if ($entry === null && $set_id === null || $catalog['default_deck'] === null
    || (isset($cards_param) && !is_string($cards_param))) {
    http_response_code(400);
    exit;
}

$deck_cards = null; // all cards of the variant (custom set: all its active cards)
if (is_string($cards_param) && $set_id !== null) {
    $keys = parse_card_keys($cards_param);
    if ($keys === null || count($keys) < CUSTOM_DECK_MIN_CARDS) {
        http_response_code(400);
        exit;
    }
    $deck_cards = implode(',', $keys); // checked against the set below (team row lock)
} elseif (is_string($cards_param)) {
    $keys = parse_card_keys($cards_param);
    $group_keys = array_column($entry['group']['cards'], 'card_key');
    if ($keys === null || count($keys) === 0 || count(array_diff($keys, $group_keys)) > 0) {
        http_response_code(400);
        exit;
    }
    $deck_cards = implode(',', $keys);
}

$link->begin_transaction();
$team = lock_team_deck($link, $t, $catalog);
if ($team === null) { // team deleted in between
    $link->rollback();
    http_response_code(403);
    exit;
}
$old = $team['deck'];
if ($set_id !== null && !isset($team['custom_sets'][$set_id]['cards'][0])) { // not a set of this team, deleted or empty
    $link->rollback();
    http_response_code(400);
    exit;
}
if ($set_id !== null && $deck_cards !== null) { // B-98: only active cards of this set, and the list must fit
    $set_keys = array_column($team['custom_sets'][$set_id]['cards'], 'card_key');
    $keys = explode(',', $deck_cards);
    if (count(array_diff($keys, $set_keys)) > 0
        || count($keys) < count($set_keys) && custom_deck_cards($keys) === null) {
        $link->rollback();
        http_response_code(400);
        exit;
    }
}
$new = resolve_deck($deck_id, $deck_cards, implode(',', $old['controls']), (int)$team['deck_rev'], $catalog,
                    $team['custom_sets']);
$changed = $new['id'] !== $old['id'] || $new['cards'] !== $old['cards'];

$new_round = false;
if ($changed || (int)$team['needs_setup'] === 1 || $team['deck_id'] !== $old['id']) {
    if ($changed && team_has_cards_down($link, $t)) {
        start_new_round($link, $t); // snapshot with the old deck
        $new_round = true;
    }
    store_team_deck($link, $t, $new, $catalog, true);
    if (deck_group_key($new) !== deck_group_key($old)) set_deck_changed_by($link, $t, $player_id); // B-98 V6
    $new['rev']++;
    $changed = true;
}
$link->commit();
$link->close();

if ($changed) notify_team($t); // B-81

set_header('json');
echo json_encode(array('deck' => $new, 'changed' => $changed, 'new_round' => $new_round));
