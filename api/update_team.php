<?php
require '../config.php';
require './lib.php';
require './lib_core_team.php';
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
// B-151: team setting "Allow AI assistants", exactly "0" or "1"; anything else is ignored. Only here (the board), never
// through MCP: switched off, /mcp refuses every call of the team (ai_not_allowed); the notify wakes waiting views
$allow_ai_param = $_GET['allow_ai'] ?? null;
$allow_ai = ($allow_ai_param === '0' || $allow_ai_param === '1') ? (int)$allow_ai_param : null;

$link = db_init();
require_team($t, $link);

/* B-151: the logic is core_team_settings_patch() (lib_core_team.php), shared with MCP board_settings: one transaction,
   team row locked first; anonymous mode and "See changed cards" (B-115) apply at once while no card is down, else
   with the next round. All boards of the team reload if something changed (B-81). Answer as before: 200 empty,
   unknown team 403. */
$fields = array();
if (strlen($name) > 0) $fields['name'] = $name;
if ($anonymous_request_toggle != null and $anonymous_request_toggle >= 0 and $anonymous_request_toggle <= 1) {
    $fields['anonymous'] = (int)$anonymous_request_toggle === 1;
}
if ($show_tips !== null) $fields['show_tips'] = $show_tips === 1;
if ($show_card_changes !== null) $fields['show_card_changes'] = $show_card_changes === 1;
if ($allow_ai !== null) $fields['allow_ai'] = $allow_ai === 1;

topic_core_call(fn(): array => array(core_team_settings_patch($link, ['team_id' => $t], $fields)));
$link->close();
