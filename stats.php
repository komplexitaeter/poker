<?php
/*
 * Internal statistics and moderation of "Ideas & Bugs" (B-57). Protected by nginx basic auth
 * (docs/stats-basic-auth.md). Moderation actions are POSTs to this page with a session form token
 * (CSRF protection: the browser sends the basic auth credentials with every request automatically),
 * followed by a redirect back (POST/redirect/GET).
 */
require './config.php';
require './api/lib.php';

// Always escape DB values on output (project convention: store raw, escape on output).
function h($value) {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

/* POST form field as text: trimmed, cut to $max_length characters, '' if missing or not a string */
function post_text(string $name, int $max_length): string {
    $value = $_POST[$name] ?? '';
    return is_string($value) ? cut_text(trim($value), $max_length) : '';
}

function reject(int $code, string $message) {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message;
    exit;
}

session_name('pokstats');
session_set_cookie_params(array(
    'path' => $_SERVER['SCRIPT_NAME'] ?? '/stats.php',
    'httponly' => true,
    'samesite' => 'Strict',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'
));
ini_set('session.use_strict_mode', '1');
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
$csrf = $_SESSION['csrf'];
session_write_close();

$fb_filter = filter_input(INPUT_GET, 'fb');
if (!in_array($fb_filter, array('open', 'done', 'all'), true)) $fb_filter = 'open';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf'] ?? '';
    if (!is_string($token) || !hash_equals($csrf, $token)) {
        reject(403, 'Invalid or missing form token - reload stats.php and try again.');
    }

    $action = post_text('action', 20);
    $link = db_init('utf8mb4');

    if ($action === 'feedback_done') {
        // tick off (done=1) or reopen (done=0) one feedback; the first done date is kept
        $fb_id = filter_var($_POST['fb_id'] ?? null, FILTER_VALIDATE_INT, array('options' => array('min_range' => 1)));
        if (!is_int($fb_id)) reject(400, 'Invalid feedback id.');
        $done = post_text('done', 1) === '1' ? 1 : 0;
        $sql = $link->prepare("update pok_feedback_tbl
                                  set done_date = case when ? = 1 then ifnull(done_date, current_timestamp) end
                                where fb_id = ?");
        $sql->bind_param('ii', $done, $fb_id);
        $sql->execute();
        $anchor = 'inbox';

    } else if ($action === 'roadmap_save') {
        // create (no id) or update an entry of the public list
        $id = post_text('id', 10);
        $type = post_text('type', 10);
        $title = post_text('title', 120);
        $description = post_text('description', 600);
        if ($description === '') $description = null;
        $status = post_text('status', 12);
        $sort_order = filter_var($_POST['sort_order'] ?? '0', FILTER_VALIDATE_INT,
            array('options' => array('min_range' => -1000000, 'max_range' => 1000000)));
        $visible = post_text('visible', 1) === '1' ? 1 : 0;

        if (!in_array($type, FEEDBACK_TYPES, true) || !in_array($status, ROADMAP_STATUS, true)
            || $title === '' || !is_int($sort_order) || ($id !== '' && !ctype_digit($id))) {
            reject(400, 'Invalid entry: title is required, type/status/order must be valid.');
        }

        if ($id === '') {
            $sql = $link->prepare("insert into pok_roadmap_tbl (item_type, title, description, status, sort_order, visible)
                                   values (?, ?, ?, ?, ?, ?)");
            $sql->bind_param('ssssii', $type, $title, $description, $status, $sort_order, $visible);
        } else {
            $id = (int)$id;
            $sql = $link->prepare("update pok_roadmap_tbl
                                      set item_type = ?, title = ?, description = ?, status = ?, sort_order = ?, visible = ?
                                    where id = ?");
            $sql->bind_param('ssssiii', $type, $title, $description, $status, $sort_order, $visible, $id);
        }
        $sql->execute();
        $anchor = 'roadmap';

    } else {
        reject(400, 'Unknown action.');
    }

    $link->close();
    header('Location: stats.php?fb=' . $fb_filter . '#' . $anchor, true, 303);
    exit;
}

function select_options(array $values, string $selected): string {
    $html = '';
    foreach ($values as $value) {
        $html .= '<option value="' . h($value) . '"' . ($value === $selected ? ' selected' : '') . '>' . h($value) . '</option>';
    }
    return $html;
}

/* one form per entry of the public list; $item null = form for a new entry */
function roadmap_form(?object $item, string $csrf, string $fb_filter): string {
    $html = '<form class="rm" method="post" action="stats.php?fb=' . h($fb_filter) . '">'
        . '<input type="hidden" name="csrf" value="' . h($csrf) . '">'
        . '<input type="hidden" name="action" value="roadmap_save">'
        . '<input type="hidden" name="id" value="' . h($item->id ?? '') . '">'
        . '<input name="sort_order" type="number" title="order (ascending)" value="' . h($item->sort_order ?? 0) . '">'
        . '<select name="type" title="type">' . select_options(FEEDBACK_TYPES, $item->item_type ?? 'FEATURE') . '</select>'
        . '<input name="title" maxlength="120" required placeholder="title" value="' . h($item->title ?? '') . '">'
        . '<textarea name="description" maxlength="600" rows="2" placeholder="description (optional)">' . h($item->description ?? '') . '</textarea>'
        . '<select name="status" title="status">' . select_options(ROADMAP_STATUS, $item->status ?? 'PLANNED') . '</select>'
        . '<label><input type="checkbox" name="visible" value="1"' . (($item->visible ?? 1) == 1 ? ' checked' : '') . '> visible</label>';
    if ($item !== null) {
        $html .= '<span class="votes" title="reactions per phase (only the current phase is shown in the app)">'
            . 'wanted: &#x1F44D; ' . h($item->want_up_cnt) . ' &#x1F44E; ' . h($item->want_down_cnt)
            . ' &middot; after done: &#x1F44D; ' . h($item->done_up_cnt) . ' &#x1F44E; ' . h($item->done_down_cnt) . '</span>'
            . '<button type="submit">Save</button>';
    } else {
        $html .= '<button type="submit">Add</button>';
    }
    return $html . '</form>';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Agile Poker Cards Online - Statistics</title>
    <link rel="stylesheet" href="style/style.css" media="screen" />
    <style>
        /* moderation (B-57), kept plain on purpose */
        .mod { max-width: 1200px; margin: 2em auto; padding: 0 16px; text-align: left; }
        .mod h2 { margin-top: 1.5em; }
        .mod table { width: 100%; border-collapse: collapse; }
        .mod td, .mod th { vertical-align: top; text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--line); }
        .mod .fb_text { white-space: pre-wrap; max-width: 40em; }
        .mod .fb_context { font-size: 0.8em; color: var(--muted); max-width: 20em; overflow-wrap: anywhere; }
        .mod .done td { opacity: 0.6; }
        .mod .rm { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
        .mod .rm input[name=sort_order] { width: 4em; }
        .mod .rm input[name=title] { width: 18em; }
        .mod .rm textarea { width: 28em; }
        .mod a.active { font-weight: bold; }
    </style>
</head>
<body onload="document.body.style.opacity = '1';">

    <table>
        <tr class="table_header">
            <th>date</th>
            <th>team registrations</th>
            <th>new round clicks</th>
            <th>average players</th>
            <th>board on load (mobile)</th>
            <th>open info box</th>
            <th>link simulation infos</th>
            <th>link simulation login</th>
            <th>open feedback box</th>
            <th>open setup box</th>
            <th>use color switch</th>
            <th>use stopwatch switch</th>
            <th>topic saved</th>
        </tr>


<?php
$sql = "select /*+ MAX_EXECUTION_TIME(30000) */ d.day
     ,ifnull(p.team_registrations_cnt, 0) as team_registrations_cnt
     ,ifnull(r.new_round_cnt, 0) as new_round_cnt
     ,ifnull(round(r.new_round_players_avg, 2), 0) as new_round_players_avg
     ,ifnull(e.board_on_load, 0) as board_on_load
     ,ifnull(e.board_on_load_mobile, 0) as board_on_load_mobile
     ,ifnull(e.open_info_box, 0) as open_info_box
     ,ifnull(e.link_simulation_infos, 0) as link_simulation_infos
     ,ifnull(e.link_simulation_login, 0) as link_simulation_login
     ,ifnull(e.open_feedback_box, 0) as open_feedback_box
     ,ifnull(e.open_setup_box, 0) as open_setup_box
     ,ifnull(e.use_color_switch, 0) as use_color_switch
     ,ifnull(e.toggle_timer, 0) as toggle_timer
     ,ifnull(e.topic_saved, 0) as topic_saved

from (select date_format(timestampadd(DAY,-1*i.n,current_timestamp), '%Y-%m-%d') as day
      from (select 0 as n union select 1 union select 2 union  select 3
            union select 4 union select 5 union select 6 union select 7
            union select 8 union select 9 union select 10 union select 11
            union select 12 union select 13 union select 14) as i) as d
         left outer join (select date_format(creation_date, '%Y-%m-%d') as day
                               ,count(1) team_registrations_cnt
                          from pok_teams_tbl
                          where creation_date >= cast(date(timestampadd(day,-14, current_timestamp)) as datetime)
                          group by day) as p
                         on p.day = d.day
         left outer join (select date_format(creation_date, '%Y-%m-%d') as day
                               ,count(1) new_round_cnt
                               ,avg(players_count) new_round_players_avg
                          from pok_roundstats_tbl
                          where type_code = 'NEW_ROUND'
                            and creation_date >= cast(date(timestampadd(day,-14, current_timestamp)) as datetime)
                          group by day) as r
                         on r.day = d.day
         left outer join (select date_format(creation_date, '%Y-%m-%d') as day
                               ,sum(event_code = 'BOARD_ON_LOAD') as board_on_load
                               ,sum(event_code = 'BOARD_ON_LOAD' and display_type in ('xs','sm')) as board_on_load_mobile
                               ,sum(event_code = 'OPEN_INFO_BOX') as open_info_box
                               ,sum(event_code = 'LINK_SIMULATION_INFOS') as link_simulation_infos
                               ,sum(event_code = 'LINK_SIMULATION_LOGIN') as link_simulation_login
                               ,sum(event_code = 'OPEN_FEEDBACK_BOX') as open_feedback_box
                               ,sum(event_code = 'OPEN_SETUP_BOX') as open_setup_box
                               ,sum(event_code = 'USE_COLOR_SWITCH') as use_color_switch
                               ,sum(event_code = 'TOGGLE_TIMER') as toggle_timer
                               ,sum(event_code = 'TOPIC_SAVED') as topic_saved
                          from pok_analytics_events_tbl
                          where creation_date > timestampadd(day,-14, current_timestamp)
                          group by day) as e
                         on e.day = d.day
order by d.day desc
";

$link = db_init('utf8mb4');

$result = $link->query($sql);
while(  $obj = $result->fetch_object()) {
    echo("<tr>\n");
    echo("<td>" . h($obj->day) . "</td>\n");
    echo("<td>" . h($obj->team_registrations_cnt) . "</td>\n");
    echo("<td>" . h($obj->new_round_cnt) . "</td>\n");
    echo("<td>" . h($obj->new_round_players_avg) . "</td>\n");
    echo("<td>" . h($obj->board_on_load) . " (" . h($obj->board_on_load_mobile) . ")</td>\n");
    echo("<td>" . h($obj->open_info_box) . "</td>\n");
    echo("<td>" . h($obj->link_simulation_infos) . "</td>\n");
    echo("<td>" . h($obj->link_simulation_login) . "</td>\n");
    echo("<td>" . h($obj->open_feedback_box) . "</td>\n");
    echo("<td>" . h($obj->open_setup_box) . "</td>\n");
    echo("<td>" . h($obj->use_color_switch) . "</td>\n");
    echo("<td>" . h($obj->toggle_timer) . "</td>\n");
    echo("<td>" . h($obj->topic_saved) . "</td>\n");
    echo("</tr>\n\n");
}
echo("</table>\n\n");

/* ---------- Ideas & Bugs: inbox (B-57) ---------- */
$where = array('open' => 'where done_date is null', 'done' => 'where done_date is not null', 'all' => '')[$fb_filter];
$result = $link->query("select fb_id, datum, fb_type, fb_stars, fb_text, fb_context, done_date
                          from pok_feedback_tbl " . $where . "
                         order by datum desc, fb_id desc
                         limit 200");
?>
<div class="mod">
    <h2 id="inbox">Ideas &amp; Bugs &ndash; inbox</h2>
    <p>
<?php
foreach (array('open', 'done', 'all') as $filter) {
    echo '<a href="stats.php?fb=' . $filter . '#inbox"' . ($filter === $fb_filter ? ' class="active"' : '') . '>' . $filter . '</a> ';
}
?>
        (newest first, max. 200)
    </p>
    <table>
        <tr><th>date</th><th>type</th><th>text</th><th>context</th><th></th></tr>
<?php
while ($obj = $result->fetch_object()) {
    $done = $obj->done_date !== null;
    echo '<tr class="feedback_row' . ($done ? ' done' : '') . '" data-fb-id="' . h($obj->fb_id) . '">';
    echo '<td>' . h($obj->datum) . '</td>';
    echo '<td>' . h($obj->fb_type ?? '-') . ($obj->fb_stars > 0 ? ' ' . str_repeat('*', min(5, (int)$obj->fb_stars)) : '') . '</td>';
    echo '<td class="fb_text">' . h($obj->fb_text) . '</td>';
    echo '<td class="fb_context">' . h($obj->fb_context) . '</td>';
    echo '<td><form method="post" action="stats.php?fb=' . h($fb_filter) . '">'
        . '<input type="hidden" name="csrf" value="' . h($csrf) . '">'
        . '<input type="hidden" name="action" value="feedback_done">'
        . '<input type="hidden" name="fb_id" value="' . h($obj->fb_id) . '">'
        . '<input type="hidden" name="done" value="' . ($done ? '0' : '1') . '">'
        . '<button type="submit">' . ($done ? 'Reopen' : 'Done') . '</button>'
        . ($done ? '<br><small>' . h($obj->done_date) . '</small>' : '')
        . '</form></td>';
    echo "</tr>\n";
}
?>
    </table>

    <h2 id="roadmap">Ideas &amp; Bugs &ndash; public list</h2>
    <p>Written by us, shown in the app (visible entries only, sorted by status DONE, IN_PROGRESS, PLANNED, then thumbs up minus thumbs down of the current phase, then order, then newest first).</p>
<?php
$result = $link->query("select x.* from (
                            select r.*
                                  ,(select count(1) from pok_roadmap_votes_tbl v where v.item_id = r.id and v.phase = 'WANT' and v.reaction = 'UP') as want_up_cnt
                                  ,(select count(1) from pok_roadmap_votes_tbl v where v.item_id = r.id and v.phase = 'WANT' and v.reaction = 'DOWN') as want_down_cnt
                                  ,(select count(1) from pok_roadmap_votes_tbl v where v.item_id = r.id and v.phase = 'DONE' and v.reaction = 'UP') as done_up_cnt
                                  ,(select count(1) from pok_roadmap_votes_tbl v where v.item_id = r.id and v.phase = 'DONE' and v.reaction = 'DOWN') as done_down_cnt
                              from pok_roadmap_tbl r
                          ) x
                         order by field(x.status, 'DONE', 'IN_PROGRESS', 'PLANNED')
                                 ,case when x.status = 'DONE' then x.done_up_cnt - x.done_down_cnt else x.want_up_cnt - x.want_down_cnt end desc
                                 ,x.sort_order, x.id desc");
while ($obj = $result->fetch_object()) {
    echo roadmap_form($obj, $csrf, $fb_filter) . "\n";
}
?>
    <h3>New entry</h3>
<?php
echo roadmap_form(null, $csrf, $fb_filter) . "\n";
$link->close();
?>
</div>

</body>
</html>
