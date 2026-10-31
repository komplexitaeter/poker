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
 */
$link->begin_transaction();
$sql = $link->prepare("select id from pok_teams_tbl where id = ? for update");
$sql->bind_param('s', $t);
$sql->execute();
$sql->get_result();

$sql = $link->prepare("select count(1) players_cnt, count(card_key) cards_cnt from pok_players_tbl
                        where team_id = ? and player_type = 'PLAYER'");
$sql->bind_param('s', $t);
$sql->execute();
$counts = $sql->get_result()->fetch_object();
$revealed = $counts !== null && (int)$counts->players_cnt > 0 && (int)$counts->players_cnt === (int)$counts->cards_cnt;

$sql = $link->prepare("select card_key, original_card_key, player_type from pok_players_tbl
                        where id = ? and team_id = ? for update");
$sql->bind_param('ss', $id, $t);
$sql->execute();
$me = $sql->get_result()->fetch_object();

if ($me !== null) {
    $original = $me->original_card_key;
    if ($new_card !== null && $new_card === $original) {
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
