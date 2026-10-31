<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$cardset_flags = filter_input(INPUT_GET, "cardset_flags", FILTER_SANITIZE_NUMBER_INT);


$link = db_init();
require_team($t, $link);

/* B-98: the deck follows the old deck menu: deck_id = null makes getDao() derive it again from the new flags */
$sql = $link->prepare("update pok_teams_tbl
                          set cardset_flags = ?, needs_setup = 0
                             ,deck_id = null, deck_cards = null, deck_controls = null, deck_rev = deck_rev + 1
                        where id = ?");
$sql->bind_param('ss',$cardset_flags, $t);
$sql->execute();

$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
