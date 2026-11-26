<?php
require '../config.php';
require './lib.php';
require './lib_api_keys.php';
require './lib_core_member.php';
require_post();

$id = get_uid(); // B-152: header X-Poker-User, transitionally body uid or URL id
// a missing or manipulated id must not delete the rows with an empty id of all teams (B-88)
if ($id === '') exit;
$link = db_init();

// B-151: core_user_delete() (lib_core_member.php), shared with MCP me delete_my_data: everything of the person in all
// teams, then every board of those teams reloads (B-81). The board is no API key, so it is never refused here.
core_user_delete($link, ['uid' => $id, 'team_id' => null, 'role' => null, 'via' => 'browser', 'key_id' => null]);

$link->close();
