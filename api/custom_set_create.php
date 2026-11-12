<?php
/*
 * B-98 S4: creates a custom set of the team.
 * POST ?t=<team>&id=<player id, optional>, JSON body: {name, style, aim (optional), cards: [card, ...], activate: bool (optional, default false)}
 *   aim (B-52 S1b): 'agree' (default: one agreed value per item) | 'perspectives' (distribution only)
 *   card: {symbol: id of card_catalog.json custom_symbols | text: 1-6 graphemes, emoji allowed, see is_custom_value_text() (exactly one of both),
 *          heading?: <= 16, description?: <= 160, numeric_value?: number | null, color: card_catalog.json custom_colors,
 *          key?: card_key of a catalog group card (template, e.g. 'infin01') or of an active card of another set of
 *          this team that is not deleted (copy of an own set, 'c-...'): then symbol and color of that card are allowed
 *          even if they are not in custom_symbols/custom_colors; the card is a new card (new key)}
 * - at most custom_cards_max() cards (_CUSTOM_CARDS_MAX, default 20), otherwise 400 {error: 'too_many_cards', max}
 * - 400 {error, index?}: malformed body or card (error codes: body, name, style, cards, no_cards, too_many_cards, card,
 *   key, duplicate_key, symbol_or_text, symbol, text, heading, description, numeric_value, color, aim), set_limit (the team
 *   has custom_sets_max() sets already), catalog (no valid card_catalog.json)
 * - activate: the new set becomes the team's deck (a new round starts if cards are down, as in update_deck.php)
 * Answer (JSON): {set: {set_id, deck_id, name, style, aim, rev, cards}, deck, new_round}
 */
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$player_id = get_id_param('id'); // B-98 V6: who changes the card set (activate), optional

$link = db_init();
require_team($t, $link);

$catalog = card_catalog();
if ($catalog['default_deck'] === null) custom_fail(400, 'catalog');
$data = read_json_body();
if ($data === null) custom_fail(400, 'body');
$head = validate_custom_set_head($data, $catalog);
if (isset($head['error'])) custom_fail(400, $head['error']);
$activate = ($data['activate'] ?? false) === true;

$link->begin_transaction();
$team = lock_team_deck($link, $t, $catalog); // the team row lock serializes all changes of the team's sets
if ($team === null) {
    $link->rollback();
    http_response_code(403);
    exit;
}
// cards are validated under the lock: a card may copy an active card of another own set (custom_source_cards())
$checked = validate_custom_cards($data['cards'] ?? null, array(), $catalog, custom_source_cards($team['custom_sets']));
if (isset($checked['error'])) {
    $link->rollback();
    custom_fail(400, $checked['error'], isset($checked['index']) ? array('index' => $checked['index']) : array());
}
if (count($checked['cards']) > custom_cards_max()) {
    $link->rollback();
    custom_fail(400, 'too_many_cards', array('max' => custom_cards_max()));
}
if (count($team['custom_sets']) >= custom_sets_max()) {
    $link->rollback();
    custom_fail(400, 'set_limit', array('max' => custom_sets_max()));
}
$set_id = insert_custom_set($link, $t, $head['name'], $head['style'], $checked['cards'], $head['aim'] ?? 'agree');
$result = array('deck' => $team['deck'], 'new_round' => false);
if ($activate) $result = custom_update_team_deck($link, $t, $team, $catalog, custom_deck_id($set_id), true, $player_id);
$set = load_custom_sets($link, $t, $catalog)[$set_id];
$link->commit();
$link->close();

notify_team($t); // B-81: the deck menus of the team show the new set

set_header('json');
echo json_encode(array('set' => $set, 'deck' => $result['deck'], 'new_round' => $result['new_round']),
                 JSON_UNESCAPED_UNICODE);
