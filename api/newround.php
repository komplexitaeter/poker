<?php
require '../config.php';
require './lib.php';
require './lib_core_member.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$link = db_init();
require_team($t, $link);

// B-151: core_round_new() (lib_core_member.php), shared with MCP round new_round; notifies the team (B-81).
// Team deleted in between -> 403 as before.
try {
    core_round_new($link, ['uid' => '', 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null]);
} catch (ApiError $e) {
    http_response_code(403);
    exit;
}
$link->close();
