<?php
require '../config.php';
require './lib.php';
require_post();

/*
 * B-52 S1: the single topic as before, now the active topic item (the topmost open one). A text edits it (first line
 * = heading, the rest = description, split_topic_text()) or creates it if there is no open item; a changed heading is
 * a new topic, so the round data of the item (distribution, rounds, chosen result) starts again. An empty text deletes
 * the active item. Overwriting never creates a done item. pok_teams_tbl.topic follows the active item.
 */
$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$topic = cut_text(trim((string)filter_input(INPUT_POST, "topic")), TOPIC_TEXT_MAX);

$link = db_init();
lock_team_topics($link, $t);

$active = active_item_id($link, $t);
if ($topic === '') {
    if ($active !== null) {
        $sql = $link->prepare("delete from pok_topic_items_tbl where id = ? and team_id = ?");
        $sql->bind_param('is', $active, $t);
        $sql->execute();
    }
} else {
    $split = split_topic_text($topic);
    if ($active !== null) {
        // compared in PHP: the column collation ignores case and accents
        $same = load_topic_item($link, $t, $active)['heading'] === $split['heading'];
        $sql = $link->prepare($same
            ? "update pok_topic_items_tbl set heading = ?, description = ? where id = ? and team_id = ?"
            : "update pok_topic_items_tbl
                  set heading = ?, description = ?, rounds_cnt = 0, distribution = null
                     ,result_card_key = null, result_auto = 1
                where id = ? and team_id = ?");
        $sql->bind_param('ssis', $split['heading'], $split['description'], $active, $t);
        $sql->execute();
    } else {
        if (topic_item_counts($link, $t)['total'] >= TOPIC_ITEMS_TOTAL_MAX) topic_fail($link, 409, 'limit');
        insert_topic_item($link, $t, null, $split['heading'], $split['description'], 0, 0);
    }
}
sync_team_topic($link, $t);
$link->commit();
$link->close();

// B-81: all boards of the team reload (only reached after the team check and a successful write)
notify_team($t);
