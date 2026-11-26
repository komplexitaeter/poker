<?php
require '../config.php';
require './lib.php';
require './lib_core_items.php';
require_post();

/*
 * B-52 S1: deletes a topic item (open or done) for good. URL: t, item.
 * B-150: thin wrapper around core_item_delete() (api/lib_core_items.php).
 * Answer: {ok, item_id, active_id}; 400 {error: item}, 404 {error: item}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
if ($id === 0) topic_fail(null, 400, 'item');

$link = db_init();
$result = topic_core_call(fn(): array => core_item_delete($link, ['team_id' => $t], $id));
$link->close();

topic_ok(array('item_id' => $result['item_id'], 'active_id' => $result['active_id']));
