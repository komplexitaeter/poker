<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: sets the maturity of a topic item. URL: t, item, maturity = 0 new | 1 rough | 2 shaping | 3 ready.
 * Answer: {ok, item_id, active_id}; 400 {error: item|maturity}, 404 {error: item}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$maturity = get_id_param('maturity', 1);

if ($id === 0) topic_fail(null, 400, 'item');
if (!preg_match('/^[0-' . TOPIC_MATURITY_MAX . ']$/D', $maturity)) topic_fail(null, 400, 'maturity');
$maturity = (int)$maturity;

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
