<?php
require '../config.php';
require './lib.php';

/*
 * B-52 S1b: the topic lists of a team (read only, no notify). The board loads them when topics_rev in dao.php
 * (topic_items.topics_rev) differs from the rev of its last list; the done items only when the menu shows them.
 * GET ?t=<team>&done=1 (optional: with done items)&done_offset=<n> (default 0)&done_limit=<1..100> (default 50)
 * Answer: {topics_rev, open: [all open items in order, open[0] = active], open_count, done_count,
 *          limits: {open, ext_id, heading, description}, with done=1 also done: [newest first], done_offset}
 * Items as in dao.php topic_items.active (script/types.ts TopicItem). 403 unknown team.
 */
set_header('json');

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$with_done = get_id_param('done', 1) === '1';
$offset = get_id_param('done_offset', 6);
$offset = ctype_digit($offset) ? (int)$offset : 0;
$limit = get_id_param('done_limit', 3);
$limit = ctype_digit($limit) ? max(1, min((int)$limit, TOPIC_DONE_PAGE_MAX)) : TOPIC_DONE_PAGE;

$link = db_init();
require_team($t, $link);

$lists = topic_lists($link, $t, card_catalog(), $with_done, $offset, $limit);
$link->close();

echo json_encode($lists, JSON_UNESCAPED_UNICODE);
