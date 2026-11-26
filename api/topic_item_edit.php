<?php
require '../config.php';
require './lib.php';
require './lib_core_items.php';
require_post();

/*
 * B-52 S1: edits a topic item (open or done). URL: t, item. POST body (form encoded): heading, description, ext_id -
 * each only if sent (a missing field stays as it is, an empty description clears it, heading is required).
 * B-150: ext_id is the item key - required (an empty one is refused, except for an old item without a key, which then
 * gets the suggestion), checked and unique per team; a key sent unchanged is kept as it is.
 * URL maturity (optional): 0-3, empty = not set; missing = unchanged.
 * B-150: thin wrapper around core_item_patch() (api/lib_core_items.php); lengths are cut as before, not refused.
 * Answer: {ok, item_id, active_id, ext_id}; 400 {error: item|heading|maturity|ext_id}, 404 {error: item},
 * 409 {error: key_taken}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$heading = get_post_text_param('heading', TOPIC_HEADING_MAX);
$description = get_post_text_param('description', TOPIC_DESCRIPTION_MAX);
$ext_id = get_post_text_param('ext_id', TOPIC_EXT_ID_MAX);

if ($id === 0) topic_fail(null, 400, 'item');
if ($heading === '') topic_fail(null, 400, 'heading');
$maturity = get_maturity_param();
if ($maturity === 'invalid') topic_fail(null, 400, 'maturity');

$fields = array();
if ($heading !== null) $fields['heading'] = $heading;
if ($description !== null) $fields['description'] = $description;
if ($ext_id !== null) $fields['key'] = $ext_id;
if ($maturity !== false) $fields['maturity'] = $maturity;

$link = db_init();
$result = topic_core_call(fn(): array => core_item_patch($link, ['team_id' => $t], $id, $fields));
$link->close();

topic_ok(array('item_id' => $result['item_id'], 'active_id' => $result['active_id'], 'ext_id' => $result['key']));
