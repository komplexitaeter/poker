<?php
require '../config.php';
require './lib.php';
require './lib_core_items.php';
require_post();

/*
 * B-52 S1: sets the optional maturity of a topic item. URL: t, item, maturity = 0 new | 1 rough | 2 shaping | 3 ready,
 * empty or missing = not set (null). Also possible with topic_item_edit.php.
 * B-151: thin wrapper around core_item_patch() (api/lib_core_items.php), like topic_item_edit.php.
 * Answer: {ok, item_id, active_id}; 400 {error: item|maturity}, 404 {error: item}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$maturity = get_maturity_param();

if ($id === 0) topic_fail(null, 400, 'item');
if ($maturity === 'invalid') topic_fail(null, 400, 'maturity');
if ($maturity === false) $maturity = null;

$link = db_init();
$result = topic_core_call(fn(): array => core_item_patch($link, ['team_id' => $t], $id, ['maturity' => $maturity]));
$link->close();

topic_ok(array('item_id' => $result['item_id'], 'active_id' => $result['active_id']));
