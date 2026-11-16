<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: deletes a topic item (open or done) for good. URL: t, item.
 * Answer: {ok, item_id, active_id}; 400 {error: item}, 404 {error: item}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
if ($id === 0) topic_fail(null, 400, 'item');

$link = db_init();
lock_team_topics($link, $t);

if (!delete_topic_item($link, $t, $id)) topic_fail($link, 404, 'item');

$active = active_item_id($link, $t);
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $active));
notify_team($t); // B-81
