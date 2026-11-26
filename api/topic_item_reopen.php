<?php
require '../config.php';
require './lib.php';
require './lib_core_items.php';
require_post();

/*
 * B-52 S1: opens a done topic item again. URL: t, item, at = end (default) | next (right after the active item; the
 * active one if there is none). Distribution, rounds and a chosen result stay (further rounds add up); an automatic
 * result is computed again from the distribution (dao.php).
 * B-150 PR 4: thin wrapper around core_item_reopen() (api/lib_core_items.php), shared with POST /api/v1/items/{key}/reopen.
 * Answer: {ok, item_id, active_id}; 400 {error: item}, 404 {error: item}, 409 {error: not_done|limit}.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$id = get_item_param();
$at = get_at_param();
if ($id === 0) topic_fail(null, 400, 'item');

$link = db_init();
$result = topic_core_call(fn(): array => core_item_reopen($link, ['team_id' => $t], $id, $at));
$link->close();

if (!$result['reopened']) topic_fail(null, 409, 'not_done'); // open already: nothing written, nobody notified
topic_ok(array('item_id' => $result['item_id'], 'active_id' => $result['active_id']));
