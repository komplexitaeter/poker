<?php
require '../config.php';
require './lib.php';
require './lib_core_items.php';
require_post();

/*
 * B-52 S1: moves an open topic item. URL: t, item, to = new index among the open items (0 = active; larger values
 * mean the end). Answer: {ok, item_id, active_id}; 400 {error: item|to}, 404 {error: item}, 409 {error: not_open}.
 * B-151: thin wrapper around core_item_move() (api/lib_core_items.php), shared with MCP items move.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$to = get_id_param('to', 4);

if ($id === 0) topic_fail(null, 400, 'item');
if (!ctype_digit($to)) topic_fail(null, 400, 'to');

$link = db_init();
$result = topic_core_call(fn(): array => core_item_move($link, ['team_id' => $t], $id, (int)$to));
$link->close();

topic_ok(array('item_id' => $result['item_id'], 'active_id' => $result['active_id']));
