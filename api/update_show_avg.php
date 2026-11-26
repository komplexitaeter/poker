<?php
require '../config.php';
require './lib.php';
require './lib_core_team.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$show_avg = filter_input(INPUT_GET, "show_avg", FILTER_SANITIZE_NUMBER_INT);

if ($show_avg == null or $show_avg != 1) $show_avg = 0;

$link = db_init();
require_team($t, $link);

// B-151: core_team_settings_patch() (lib_core_team.php), shared with MCP board_settings; notifies the team (B-81)
topic_core_call(fn(): array => array(core_team_settings_patch($link, ['team_id' => $t], ['show_avg' => (int)$show_avg === 1])));
$link->close();
