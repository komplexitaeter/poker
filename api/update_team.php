<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
$name = substr( filter_input(INPUT_GET, "name", FILTER_SANITIZE_STRING, FILTER_FLAG_NO_ENCODE_QUOTES	) ,0,30);
$anonymous_request_toggle = filter_input(INPUT_GET, "anonymous_request_toggle", FILTER_SANITIZE_NUMBER_INT );

$link = db_init();
validate_team($t, $link) or exit;
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


$link->close();