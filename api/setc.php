<?php
require '../config.php';
require './lib.php';
require './lib_core_member.php';
require_post();

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);

$id = get_uid(); // B-152: header X-Poker-User, transitionally body uid or URL id
// card keys are up to 7 characters a-z0-9 (cards.json); a manipulated key changes nothing (B-88)
$cardkey = get_id_param("cardkey", 7);
if ($cardkey === '' && (string)filter_input(INPUT_GET, "cardkey") !== '') exit;
// B-102: the system card "joined late" is only set by name.php, never picked
if ($cardkey === LATE_CARD_KEY) {
    http_response_code(400);
    exit;
}

$link = db_init();
require_team($t, $link);

/*
 * B-151: the logic (B-102, B-103, B-104, B-115, B-52 S1d) is core_card_set() in lib_core_member.php, shared with MCP
 * play_card. Answers as before: 200 empty; team deleted in between 403, card not in the team's deck 400 (B-103) -
 * then nothing written, no notify. Until B-152 BE-2 an unknown person changes nothing and an observer is not refused
 * here ($players_only false).
 */
$actor = ['uid' => $id, 'team_id' => $t, 'role' => null, 'via' => 'browser', 'key_id' => null];
try {
    core_card_set($link, $actor, strlen($cardkey) > 0 ? $cardkey : null, false);
} catch (ApiError $e) {
    http_response_code($e->status === 403 ? 403 : 400);
    exit;
}
$link->close();
