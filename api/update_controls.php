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
require './lib_core_deck.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$controls_param = filter_input(INPUT_GET, 'controls');

$link = db_init();
require_team($t, $link);

$keys = is_string($controls_param) ? parse_card_keys($controls_param) : null;
if ($keys === null) {
    http_response_code(400);
    exit;
}

// B-151: the logic is core_controls_set() (lib_core_deck.php), shared with MCP card_sets controls; it notifies the team
$actor = ['uid' => '', 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null];
$result = deck_core_call(fn() => core_controls_set($link, $actor, $keys));
$link->close();

set_header('json');
echo json_encode(array('deck' => $result['deck'], 'changed' => $result['changed']));
