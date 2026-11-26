<?php
require '../config.php';
require './lib.php';
require './lib_core_items.php';
require_post();

/*
 * B-52 S1: adds a topic item (S1b: raises topics_rev). URL: t, at = end (default) | next (right after the active item), maturity 0-3 (optional,
 * missing or empty = not set).
 * POST body (form encoded): heading (required), description, ext_id (B-150: the item key, required in the board;
 * missing or empty -> the server's suggestion, so old cached boards keep working).
 * B-150: thin wrapper around core_item_create() (api/lib_core_items.php); lengths are cut as before, not refused.
 * Answer: {ok, item_id, active_id, ext_id (the stored key)}; 400 {error: heading|maturity|ext_id (invalid key)},
 * 409 {error: limit|key_taken}, 403 unknown team.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$at = get_at_param();
$heading = (string)get_post_text_param('heading', TOPIC_HEADING_MAX);
$description = get_post_text_param('description', TOPIC_DESCRIPTION_MAX);
$ext_id = get_post_text_param('ext_id', TOPIC_EXT_ID_MAX);

if ($heading === '') topic_fail(null, 400, 'heading');
$maturity = get_maturity_param();
if ($maturity === 'invalid') topic_fail(null, 400, 'maturity');
if ($maturity === false) $maturity = null;

$link = db_init();
$result = topic_core_call(fn(): array => core_item_create($link, ['team_id' => $t], [
    'heading' => $heading, 'description' => $description, 'key' => $ext_id, 'maturity' => $maturity, 'at' => $at]));
$link->close();

topic_ok(array('item_id' => $result['item_id'], 'active_id' => $result['active_id'], 'ext_id' => $result['key']));
