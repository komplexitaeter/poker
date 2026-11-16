<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: opens a done topic item again. URL: t, item, at = end (default) | next (right after the active item; the
 * active one if there is none). Distribution, rounds and a chosen result stay (further rounds add up); an automatic
 * result is computed again from the distribution (dao.php).
 * Answer: {ok, item_id, active_id}; 400 {error: item}, 404 {error: item}, 409 {error: not_done|limit}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$at = get_at_param();
if ($id === 0) topic_fail(null, 400, 'item');

$link = db_init();
lock_team_topics($link, $t);

$item = load_topic_item($link, $t, $id);
if ($item === null) topic_fail($link, 404, 'item');
if ($item['status'] !== 'done') topic_fail($link, 409, 'not_done');
$open = topic_item_counts($link, $t)['open'];
if ($open >= TOPIC_ITEMS_OPEN_MAX) topic_fail($link, 409, 'limit');

reopen_topic_item($link, $t, $id, open_index_for($at, $open));

$active = active_item_id($link, $t);
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $active));
notify_team($t); // B-81
