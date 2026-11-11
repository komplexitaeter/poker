<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: edits a topic item (open or done). URL: t, item. POST body (form encoded): heading, description, ext_id -
 * each only if sent (a missing field stays as it is, an empty description/ext_id clears it, heading is required).
 * Answer: {ok, item_id, active_id}; 400 {error: item|heading}, 404 {error: item}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$heading = get_post_text_param('heading', TOPIC_HEADING_MAX);
$description = get_post_text_param('description', TOPIC_DESCRIPTION_MAX);
$ext_id = get_post_text_param('ext_id', TOPIC_EXT_ID_MAX);

if ($id === 0) topic_fail(null, 400, 'item');
if ($heading === '') topic_fail(null, 400, 'heading');

$link = db_init();
lock_team_topics($link, $t);

$item = load_topic_item($link, $t, $id);
if ($item === null) topic_fail($link, 404, 'item');

$heading = $heading ?? $item['heading'];
$description = $description === null ? $item['description'] : null_if_empty($description);
$ext_id = $ext_id === null ? $item['ext_id'] : null_if_empty($ext_id);
$sql = $link->prepare("update pok_topic_items_tbl set heading = ?, description = ?, ext_id = ? where id = ? and team_id = ?");
$sql->bind_param('sssis', $heading, $description, $ext_id, $id, $t);
$sql->execute();

sync_team_topic($link, $t);
$active = active_item_id($link, $t);
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $active));
notify_team($t); // B-81
