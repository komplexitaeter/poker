<?php
/*
 * B-98 S2: switches the control cards of a team (☕ ? ! ✋, card_catalog.json "controls"), independent of the deck.
 * POST, parameters in the query: t, controls (comma list of control card keys, '' = none). 400 for a missing
 * parameter or a key that is no control card.
 * Never starts a new round (decided pragmatically, B-98 S2): a control card that is down stays on the table even if it
 * is switched off (the board shows placed cards outside the deck, B-99 F1); ending everybody's estimate because of one
 * coffee card would cost more than it helps. Unchanged controls: no deck_rev change, no notify.
 * Answer (JSON): {deck: {id, group, cards, controls, rev}, changed: bool}
 */
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$controls_param = filter_input(INPUT_GET, 'controls');

$link = db_init();
require_team($t, $link);

$catalog = card_catalog();
$keys = is_string($controls_param) ? parse_card_keys($controls_param) : null;
$control_keys = array_column($catalog['controls'], 'card_key');
if ($keys === null || $catalog['default_deck'] === null || count(array_diff($keys, $control_keys)) > 0) {
    http_response_code(400);
    exit;
}

$link->begin_transaction();
$team = lock_team_deck($link, $t, $catalog);
if ($team === null) {
    $link->rollback();
    http_response_code(403);
    exit;
}
$old = $team['deck'];
$new = resolve_deck($old['id'], implode(',', $old['cards']), implode(',', $keys), (int)$team['deck_rev'], $catalog);
$changed = $new['controls'] !== $old['controls'] || $team['deck_id'] !== $old['id'];
if ($changed) {
    store_team_deck($link, $t, $new, $catalog, false);
    $new['rev']++;
}
$link->commit();
$link->close();

if ($changed) notify_team($t); // B-81

set_header('json');
echo json_encode(array('deck' => $new, 'changed' => $changed));
