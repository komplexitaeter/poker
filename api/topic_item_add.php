<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: adds a topic item. URL: t, at = end (default) | next (right after the active item), maturity 0-3 (optional).
 * POST body (form encoded): heading (required), description, ext_id (optional).
 * Answer: {ok, item_id, active_id}; 400 {error: heading|maturity}, 409 {error: limit}, 403 unknown team.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$at = get_at_param();
$maturity_raw = get_id_param('maturity', 1);
$heading = (string)get_post_text_param('heading', TOPIC_HEADING_MAX);
$description = null_if_empty(get_post_text_param('description', TOPIC_DESCRIPTION_MAX));
$ext_id = null_if_empty(get_post_text_param('ext_id', TOPIC_EXT_ID_MAX));

if ($heading === '') topic_fail(null, 400, 'heading');
if (filter_has_var(INPUT_GET, 'maturity') && !preg_match('/^[0-' . TOPIC_MATURITY_MAX . ']$/D', $maturity_raw))
    topic_fail(null, 400, 'maturity');
$maturity = (int)$maturity_raw;

$link = db_init();
lock_team_topics($link, $t);

$counts = topic_item_counts($link, $t);
if ($counts['open'] >= TOPIC_ITEMS_OPEN_MAX || $counts['total'] >= TOPIC_ITEMS_TOTAL_MAX) topic_fail($link, 409, 'limit');

$id = insert_topic_item($link, $t, $ext_id, $heading, $description, $maturity, open_index_for($at, $counts['open']));
sync_team_topic($link, $t);
$active = active_item_id($link, $t);
$link->commit();
$link->close();

topic_ok(array('item_id' => $id, 'active_id' => $active));
notify_team($t); // B-81
