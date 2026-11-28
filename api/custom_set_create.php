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
require './lib_core_deck.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$player_id = get_uid(); // B-152 (UID); B-98 V6: who changes the card set (activate), optional

$link = db_init();
require_team($t, $link);

if (card_catalog()['default_deck'] === null) custom_fail(400, 'catalog');
$data = read_json_body();
if ($data === null) custom_fail(400, 'body');

// B-151: the logic is core_custom_set_create() (lib_core_deck.php), shared with MCP card_sets create; deadlocks and
// lock wait timeouts are retried, after the last attempt 503; it notifies the team
$actor = ['uid' => $player_id, 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null];
$result = deck_core_call(fn() => core_custom_set_create($link, $actor, $data));
$link->close();

set_header('json');
echo json_encode(array('set' => $result['set'], 'deck' => $result['deck'], 'new_round' => $result['new_round']),
                 JSON_UNESCAPED_UNICODE);
