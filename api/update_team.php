<?php
require '../config.php';
require './lib.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$name = get_text_param("name", 30);
$anonymous_request_toggle = filter_input(INPUT_GET, "anonymous_request_toggle", FILTER_SANITIZE_NUMBER_INT );
// B-96: team setting "Tips", exactly "0" or "1"; anything else is ignored
$show_tips_param = $_GET['show_tips'] ?? null;
$show_tips = ($show_tips_param === '0' || $show_tips_param === '1') ? (int)$show_tips_param : null;
// B-115: team setting "See changed cards", exactly "0" or "1"; anything else is ignored
$show_card_changes_param = $_GET['show_card_changes'] ?? null;
$show_card_changes = ($show_card_changes_param === '0' || $show_card_changes_param === '1')
    ? (int)$show_card_changes_param : null;

$link = db_init();
require_team($t, $link);
if (strlen($name)>0) {
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.name=?
                                   where t.id=?");
    $sql->bind_param('ss', $name, $t);
    $sql->execute();
}

if ($anonymous_request_toggle != null and $anonymous_request_toggle >= 0 and $anonymous_request_toggle <= 1) {
    $sql = $link->prepare( "update pok_teams_tbl t
                                     set t.anonymous_request_toggle=?
                                        ,t.anonymous_mode = if(
                                            (select count(1)
                                              from pok_players_tbl p2
                                             where p2.team_id = t.id
                                               and card_key is not null
                                               and p2.player_type = 'PLAYER') = 0
                                            ,t.anonymous_request_toggle, t.anonymous_mode
                                        )
                                   where t.id=?");
    $sql->bind_param('is', $anonymous_request_toggle, $t);
    $sql->execute();
}

if ($show_tips !== null) {
    $sql = $link->prepare("update pok_teams_tbl t
                              set t.show_tips=?
                            where t.id=?");
    $sql->bind_param('is', $show_tips, $t);
    $sql->execute();
}

/* B-115: takes effect with the next round (start_new_round() copies it into round_show_card_changes), so nobody sees
   an original card by switching it on afterwards. While no card is down the round has not started: at once, as the
   anonymous mode above. Notify only if something changed. */
$card_changes_changed = false;
if ($show_card_changes !== null) {
    $sql = $link->prepare("update pok_teams_tbl t
                              set t.show_card_changes=?
                                 ,t.round_show_card_changes = if(
                                     (select count(1)
                                        from pok_players_tbl p2
                                       where p2.team_id = t.id
                                         and p2.card_key is not null
                                         and p2.player_type = 'PLAYER') = 0
                                     ,?, t.round_show_card_changes
                                 )
                            where t.id=?");
    $sql->bind_param('iis', $show_card_changes, $show_card_changes, $t);
    $sql->execute();
    $card_changes_changed = $sql->affected_rows > 0;
}

$link->close();

// B-115: a request with only show_card_changes and no change does not reload the boards
if ($show_card_changes !== null && !$card_changes_changed && strlen($name) === 0
    && $anonymous_request_toggle === null && $show_tips === null) exit;

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
