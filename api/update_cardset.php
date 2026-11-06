<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$cardset_flags = filter_input(INPUT_GET, "cardset_flags");
$player_id = get_id_param('id'); // B-98 V6: who changes the card set ('' = unknown)

$link = db_init();
require_team($t, $link);

/* B-98 S2: old deck menu (until R3 F5): only a bitmask of 0/1 is accepted */
if (!is_string($cardset_flags) || !preg_match('/^[01]{1,100}$/D', $cardset_flags)) {
    http_response_code(400);
    exit;
}

/* B-98 V6: the set group before and after (old mixed decks count as a change), under the team row lock */
$link->begin_transaction();
$catalog = card_catalog();
$team = $catalog['default_deck'] !== null ? lock_team_deck($link, $t, $catalog) : null;
$derived = deck_from_cardset_flags($cardset_flags, $catalog);
$new_group = isset($derived['mixed']) ? 'mixed' : (catalog_variants($catalog)[$derived['deck_id']]['group']['id'] ?? null);
$group_changed = $team !== null && $new_group !== deck_group_key($team['deck']);

/* B-98: the deck follows the old deck menu: deck_id = null makes getDao() derive it again from the new flags */
$sql = $link->prepare("update pok_teams_tbl
                          set cardset_flags = ?, needs_setup = 0
                             ,deck_id = null, deck_cards = null, deck_controls = null, deck_rev = deck_rev + 1
                        where id = ?");
$sql->bind_param('ss',$cardset_flags, $t);
$sql->execute();
if ($group_changed) set_deck_changed_by($link, $t, $player_id);
$link->commit();

$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
