<?php
require '../config.php';
require './lib.php';
require './lib_core_team.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$results_order = filter_input(INPUT_GET, "results_order") ?? '';

$link = db_init();
require_team($t, $link);

/* B-42: only NAME and SEQUENCE; the former in-game choice (CHOOSE, CHOOSE:NAME, CHOOSE:SEQUENCE) is gone */
if (!in_array($results_order, ['NAME', 'SEQUENCE'], true)) {
    $link->close();
    http_response_code(400);
    exit;
}

// B-151: core_team_settings_patch() (lib_core_team.php), shared with MCP board_settings; notifies the team (B-81)
topic_core_call(fn(): array => array(core_team_settings_patch($link, ['team_id' => $t], ['results_order' => $results_order])));
$link->close();
