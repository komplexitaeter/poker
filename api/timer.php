<?php
/*
 * The team's timer (B-67, B-130). POST ?t=<team>&action=<action>[&value=<value>]:
 * start, pause, reset, toggle_visibility (old clients), set_visibility (0|1), set_mode (STOPWATCH|TIMER, resets),
 * set_timebox (minutes 1..240, resets), set_auto_restart (0 off, 1 every new round, 2 every next item).
 * B-151: the logic is core_timer() (lib_core_timer.php), shared with MCP timer. Answers as before: 200 empty; a bad
 * value 400; unknown team 403; an unknown action changes nothing (200, the team is notified anyway as before).
 */
require '../config.php';
require './lib.php';
require './lib_core_timer.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL) ?? '', 0, 80);
$action = get_text_param('action', 30);
$raw = filter_input(INPUT_GET, "value") ?? '';

$link = db_init();
require_team($t, $link);

if (!in_array($action, TIMER_ACTIONS, true)) { // B-81: a pull is harmless
    $link->close();
    notify_team($t);
    exit;
}

$value = null;
$valid = true;
if ($action === 'set_visibility' || $action === 'set_auto_restart') {
    $valid = is_string($raw) && in_array($raw, $action === 'set_visibility' ? ['0', '1'] : ['0', '1', '2'], true);
    $value = (int)$raw;
} elseif ($action === 'set_mode') {
    $value = $raw;
} elseif ($action === 'set_timebox') {
    $valid = is_string($raw) && preg_match('/^[0-9]{1,3}$/', $raw) === 1;
    $value = (int)$raw;
}
if (!$valid) {
    $link->close();
    http_response_code(400);
    exit;
}

$actor = ['uid' => '', 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null];
try {
    core_timer($link, $actor, $action, $value); // notifies the team (B-81)
} catch (ApiError $e) {
    $link->close();
    http_response_code($e->status === 403 ? 403 : 400);
    exit;
}
$link->close();
