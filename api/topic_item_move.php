<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: moves an open topic item. URL: t, item, to = new index among the open items (0 = active; larger values
 * mean the end). Answer: {ok, item_id, active_id}; 400 {error: item|to}, 404 {error: item}, 409 {error: not_open}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$to = get_id_param('to', 4);

if ($id === 0) topic_fail(null, 400, 'item');
if (!ctype_digit($to)) topic_fail(null, 400, 'to');

$link = db_init();
lock_team_topics($link, $t);

$item = load_topic_item($link, $t, $id);
if ($item === null) topic_fail($link, 404, 'item');
if ($item['status'] !== 'open') topic_fail($link, 409, 'not_open');

place_open_item($link, $t, $id, (int)$to);
sync_team_topic($link, $t);
$active = active_item_id($link, $t);
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $active));
notify_team($t); // B-81
