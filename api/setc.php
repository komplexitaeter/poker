<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$id = get_id_param("id");
// card keys are up to 7 characters a-z0-9 (cards.json); a manipulated key changes nothing (B-88)
$cardkey = get_id_param("cardkey", 7);
if ($cardkey === '' && (string)filter_input(INPUT_GET, "cardkey") !== '') exit;
// B-102: the system card "joined late" is only set by name.php, never picked
if ($cardkey === LATE_CARD_KEY) {
    http_response_code(400);
    exit;
}


$link = db_init();
require_team($t, $link);

$new_card = strlen($cardkey) > 0 ? $cardkey : null;

/*
 * B-104: a player who changes his card while the cards are revealed (every PLAYER has a card down, as in getDao())
 * keeps the card of the reveal as original_card_key (first change only, intermediate cards are not kept). Back to the
 * original card -> null (no stack). Changes before the reveal and the system card LATE_CARD_KEY as "original" do not
 * count. Same lock order as newround.php/update_deck.php (team row first, then players), so two parallel changes
 * and "New Round" see a consistent table.
 * B-115: only while "See changed cards" is on for the running round (round_show_card_changes, snapshot at the round
 * start), otherwise the change is stored without original card.
 * B-103: a key that is neither in the team's deck nor in its active control cards -> 400, nothing written, no notify.
 */
$link->begin_transaction();
// locks the team row (as before) and reads the team's deck, lazy migration included (B-103)
$catalog = card_catalog();
$team = lock_team_deck($link, $t, $catalog);
if ($team === null) { // team deleted in between
    $link->rollback();
    http_response_code(403);
    exit;
}
// B-103: only cards of the team's deck or its active control cards; taking the card back ('') is always allowed
if ($new_card !== null && !deck_allows_card($team['deck'], $new_card, $catalog)) {
    $link->rollback();
    http_response_code(400);
    exit;
}

$sql = $link->prepare("select count(1) players_cnt, count(card_key) cards_cnt from pok_players_tbl
                        where team_id = ? and player_type = 'PLAYER'");
$sql->bind_param('s', $t);
$sql->execute();
$counts = $sql->get_result()->fetch_object();
// B-115: read with the lock on the team row (lock_team_deck()), so it cannot change during this transaction
$keep_original = (int)$team['round_show_card_changes'] === 1;

$revealed = $keep_original && $counts !== null && (int)$counts->players_cnt > 0 && (int)$counts->players_cnt === (int)$counts->cards_cnt;

$sql = $link->prepare("select card_key, original_card_key, player_type from pok_players_tbl
                        where id = ? and team_id = ? for update");
$sql->bind_param('ss', $id, $t);
$sql->execute();
$me = $sql->get_result()->fetch_object();

if ($me !== null) {
    $original = $me->original_card_key;
    if (!$keep_original) {
        $original = null; // B-115: never an original in a round with "See changed cards" off (no leftover either)
    } else if ($new_card !== null && $new_card === $original) {
        $original = null; // back to the card of the reveal
    } else if ($revealed && $me->player_type === 'PLAYER' && $original === null && $me->card_key !== null
               && $me->card_key !== LATE_CARD_KEY && $new_card !== $me->card_key) {
        $original = $me->card_key; // first change after the reveal (also taking the card back)
    }
    $sql = $link->prepare("update pok_players_tbl set card_key = ?, original_card_key = ? where id = ? and team_id = ?");
    $sql->bind_param('ssss', $new_card, $original, $id, $t);
    $sql->execute();
}
$link->commit();
$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
