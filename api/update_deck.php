<?php
/*
 * B-98 S2: chooses the deck of a team: a variant of card_catalog.json (deck) and optionally single cards of its group
 * (cards, comma list; missing = all cards of the variant). The control cards stay as they are (update_controls.php).
 * POST, parameters in the query: t, deck, cards.
 * - 400: unknown variant, a card that is not in the variant's group, no card at all, malformed list.
 * - If the deck changes while at least one card is down, a new round starts in the same request (snapshot with the
 *   old deck, then all cards up); the client asks before. Unchanged deck: no new round, no deck_rev change.
 * - Two parallel changes run one after the other (row lock), the second one never starts a second round.
 * Answer (JSON): {deck: {id, group, cards, controls, rev}, changed: bool, new_round: bool}
 */
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$deck_id = get_id_param('deck', 24);
$cards_param = filter_input(INPUT_GET, 'cards');

$link = db_init();
require_team($t, $link);

$catalog = card_catalog();
$entry = catalog_variants($catalog)[$deck_id] ?? null;
if ($entry === null || $catalog['default_deck'] === null || (isset($cards_param) && !is_string($cards_param))) {
    http_response_code(400);
    exit;
}

$deck_cards = null; // all cards of the variant
if (is_string($cards_param)) {
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
$new = resolve_deck($deck_id, $deck_cards, implode(',', $old['controls']), (int)$team['deck_rev'], $catalog);
$changed = $new['id'] !== $old['id'] || $new['cards'] !== $old['cards'];

$new_round = false;
if ($changed || (int)$team['needs_setup'] === 1 || $team['deck_id'] !== $old['id']) {
    if ($changed && team_has_cards_down($link, $t)) {
        start_new_round($link, $t); // snapshot with the old deck
        $new_round = true;
    }
    store_team_deck($link, $t, $new, $catalog, true);
    $new['rev']++;
    $changed = true;
}
$link->commit();
$link->close();

if ($changed) notify_team($t); // B-81

set_header('json');
echo json_encode(array('deck' => $new, 'changed' => $changed, 'new_round' => $new_round));
