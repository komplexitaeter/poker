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

$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
