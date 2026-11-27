<?php
require '../config.php';
require './lib.php';
require './lib_core_member.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$mkey = filter_input(INPUT_GET, "mkey", FILTER_SANITIZE_NUMBER_INT) ?? '';

if (strlen($mkey)>0) {

    $link = db_init();
    require_team($t, $link);

    /* B-110: only players can be removed; observers (and rows already removed) are not touched (Andreas, 2026-11-01).
       The own "Delete user" goes through delete_user.php and is not affected. B-151: core_member_remove()
       (lib_core_member.php), shared with MCP round remove_player; notifies the team (B-81). */
    try {
        // B-151 self leave: the uid (header) tells a removal of the own card (a leave) from one by someone else
        core_member_remove($link, ['uid' => get_uid(), 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null],
                           (int)$mkey);
    } catch (ApiError $e) {
        // no player with this mkey (an observer, removed already, e.g. by a second click at the same time): no notify
        http_response_code(400);
        exit;
    }
    $link->close();

}
