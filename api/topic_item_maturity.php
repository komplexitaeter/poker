<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: sets the optional maturity of a topic item. URL: t, item, maturity = 0 new | 1 rough | 2 shaping | 3 ready,
 * empty or missing = not set (null). Also possible with topic_item_edit.php.
 * Answer: {ok, item_id, active_id}; 400 {error: item|maturity}, 404 {error: item}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$maturity = get_maturity_param();

if ($id === 0) topic_fail(null, 400, 'item');
if ($maturity === 'invalid') topic_fail(null, 400, 'maturity');
if ($maturity === false) $maturity = null;

$link = db_init();
lock_team_topics($link, $t);

if (load_topic_item($link, $t, $id) === null) topic_fail($link, 404, 'item');
$sql = $link->prepare("update pok_topic_items_tbl set maturity = ? where id = ? and team_id = ?");
$sql->bind_param('iis', $maturity, $id, $t);
$sql->execute();

$active = active_item_id($link, $t);
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $active));
notify_team($t); // B-81
