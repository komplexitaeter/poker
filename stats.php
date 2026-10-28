<?php
/*
 * Internal statistics and moderation of "Ideas & Bugs" (B-57, B-64). Protected by nginx basic auth
 * (docs/stats-basic-auth.md). Moderation actions are POSTs to this page with a session form token
 * (CSRF protection: the browser sends the basic auth credentials with every request automatically),
 * followed by a redirect back (POST/redirect/GET).
 *
 * Tabs (B-64, ?tab=): live (default, reloads every 30 s), usage, ideas (moderation), tech.
 * Only the queries of the shown tab run. Every query has a time range on an indexed column and a
 * MAX_EXECUTION_TIME hint. Never output a team id: it is the access key of a board.
 */
require './config.php';
require './api/lib.php';

const STATS_TABS = array('live' => 'Live', 'usage' => 'Usage', 'ideas' => 'Ideas & Bugs', 'tech' => 'Tech');
const LIVE_MINUTES = 5;          // a client counts as active if its board loaded data within this many minutes
const LIVE_RELOAD_SEC = 30;
const USAGE_WEEKS = 9;           // weekly users: current week + 8 full weeks
const USAGE_DAYS = 28;           // daily feature usage
/* dates worth marking in the usage charts */
const MILESTONES = array('2026-10-28' => 'Rollout 1');
/* analytics events the current app still sends (script/*.js: measureEvent, gMenuSections in script_feedback.js) */
const EVENTS = array(
    'BOARD_ON_LOAD'          => 'Board loaded',
    'INIT_ON_LOAD'           => 'Start page loaded',
    'OPEN_TOPIC_BOX'         => 'Menu: Topic',
    'OPEN_SETUP_BOX'         => 'Menu: Board settings',
    'OPEN_USER_SETTINGS_BOX' => 'Menu: You',
    'OPEN_FEEDBACK_BOX'      => 'Menu: Feedback',
    'TOPIC_SAVED'            => 'Topic saved',
    'TOGGLE_TIMER'           => 'Stopwatch toggled',
    'USE_COLOR_SWITCH'       => 'Color mode switched',
);

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

/* runs a (prepared) select and returns all rows as associative arrays */
function rows($link, string $sql, string $types = '', array $params = array()): array {
    $stmt = $link->prepare($sql);
    if ($types !== '') $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $result;
}

/* percentage of $part in $total, rounded, 0 if $total is 0 */
function pct($part, $total): int {
    return $total > 0 ? (int)round(100 * $part / $total) : 0;
}

/* bar width in % of $max (CSS width), with one decimal */
function bar_width($value, $max): string {
    return $max > 0 ? number_format(100 * $value / $max, 1, '.', '') : '0';
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

$tab = filter_input(INPUT_GET, 'tab');
if (!is_string($tab) || !array_key_exists($tab, STATS_TABS)) $tab = 'live';

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
    // moderation happens in the "Ideas & Bugs" tab only, so the redirect always leads back there
    header('Location: stats.php?tab=ideas&fb=' . $fb_filter . '#' . $anchor, true, 303);
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
    $html = '<form class="rm" method="post" action="stats.php?tab=ideas&amp;fb=' . h($fb_filter) . '">'
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

/*
 * Name of the deck of a team: the preset of cards.json whose cards are exactly the selected ones
 * (flow control cards like "need a break" are always on and ignored), otherwise "custom (n cards)".
 */
function deck_name(?string $cardset_flags, bool $needs_setup, array $cards_conf): string {
    if ($needs_setup) return 'not set up yet';
    $flags = str_pad((string)$cardset_flags, count($cards_conf['cards']), '0');
    $selected = array();
    foreach ($cards_conf['cards'] as $card) {
        if (!$card['flow_control'] && ($flags[$card['index']] ?? '0') === '1') $selected[] = $card['index'];
    }
    sort($selected);
    foreach ($cards_conf['presets'] as $preset) {
        $list = $preset['index_list'];
        sort($list);
        if ($list === $selected) return $preset['description'];
    }
    return 'custom (' . count($selected) . ' cards)';
}

/* "HH:MM" of a MySQL datetime string, '' for null */
function hm(?string $datetime): string {
    return $datetime === null ? '' : substr($datetime, 11, 5);
}

/* milestone label of a day (Y-m-d) or of the week starting at a Monday (Y-m-d), '' if none */
function milestone(string $day, int $days = 1): string {
    $labels = array();
    foreach (MILESTONES as $date => $label) {
        if ($date >= $day && $date < date('Y-m-d', strtotime($day . ' +' . $days . ' day'))) $labels[] = $label . ' (' . $date . ')';
    }
    return implode(', ', $labels);
}

/* release information: asset versions from board.html, git branch/commit and last pull (if .git is readable) */
function release_info(): array {
    $info = array();
    $board = is_readable(__DIR__ . '/board.html') ? (string)file_get_contents(__DIR__ . '/board.html') : '';
    if (preg_match_all('~(?:script|style)/([\w.]+\.(?:js|css))\?v=([\d.]+)~', $board, $m, PREG_SET_ORDER)) {
        $info['Asset versions (board.html)'] = implode(', ', array_map(fn($x) => $x[1] . ' ' . $x[2], $m));
    }
    $git_dir = __DIR__ . '/.git';
    if (is_file($git_dir) && preg_match('~^gitdir: (.+)$~m', (string)file_get_contents($git_dir), $m)) {
        $git_dir = trim($m[1]);   // worktree
    }
    $head_file = $git_dir . '/HEAD';
    if (is_readable($head_file)) {
        $head = trim((string)file_get_contents($head_file));
        if (str_starts_with($head, 'ref: ')) {
            $ref = substr($head, 5);
            $info['Git branch'] = preg_replace('~^refs/heads/~', '', $ref);
            $commit = is_readable($git_dir . '/' . $ref) ? trim((string)file_get_contents($git_dir . '/' . $ref)) : '';
            if ($commit === '' && is_readable($git_dir . '/packed-refs')
                && preg_match('~^([0-9a-f]{40}) ' . preg_quote($ref, '~') . '$~m', (string)file_get_contents($git_dir . '/packed-refs'), $m)) {
                $commit = $m[1];
            }
            if ($commit !== '') $info['Git commit'] = substr($commit, 0, 10);
        } else {
            $info['Git commit'] = substr($head, 0, 10) . ' (detached)';
        }
        // last line of the reflog: time and action of the last checkout/pull (no author shown)
        $log_file = $git_dir . '/logs/HEAD';
        if (is_readable($log_file) && ($size = filesize($log_file)) > 0 && ($fh = fopen($log_file, 'r')) !== false) {
            fseek($fh, max(0, $size - 4096));
            $lines = preg_split('~\R~', trim((string)stream_get_contents($fh)));
            fclose($fh);
            // only the action name (pull, checkout, ...): the rest may hold a remote URL with credentials
            if (preg_match('~ (\d{9,}) [+-]\d{4}\t([a-z-]+)~', (string)end($lines), $m)) {
                $info['Last git action'] = date('Y-m-d H:i', (int)$m[1]) . ' – ' . $m[2];
            }
        }
    }
    if (!isset($info['Git commit'])) $info['Git'] = 'not readable';
    return $info;
}

/* ---------- data of the shown tab (queries first, so an error never leaves half a page) ---------- */
$link = null;
$data = array();
$error = null;
$open_feedback_cnt = 0;

try {
    $link = db_init('utf8mb4');
    $open_feedback_cnt = rows($link, "select /*+ MAX_EXECUTION_TIME(2000) */ count(1) as cnt
                                        from pok_feedback_tbl where done_date is null")[0]['cnt'];

    if ($tab === 'live') {
        $data['now'] = rows($link, "select now() as now_time, curdate() as today")[0];

        // active tables: aggregate over the clients active within LIVE_MINUTES (range on last_callback_time);
        // the team id is only used for joins inside SQL and never selected
        $data['tables'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                   t.name, t.cardset_flags, t.needs_setup, t.creation_date >= curdate() as created_today
                  ,a.clients, a.players, a.observers, a.known_users
                  ,(select count(1) from pok_players_tbl p
                     where p.team_id = t.id and p.player_type = 'PLAYER') as team_players
                  ,(select count(1) from pok_players_tbl p
                     where p.team_id = t.id and p.player_type = 'PLAYER' and p.card_key is not null) as cards_laid
                  ,ifnull(r.rounds_today, 0) as rounds_today
                  ,case when t.creation_date >= curdate() then t.creation_date else r.first_round end as active_since
              from (select p.team_id
                          ,count(1) as clients
                          ,sum(p.player_type = 'PLAYER') as players
                          ,sum(p.player_type <> 'PLAYER' and p.player_type <> 'REMOVED') as observers
                          ,sum(u.creation_date < curdate()) as known_users
                      from pok_players_tbl p
                      left join pok_user_tbl u on u.id = p.id
                     where p.last_callback_time > now() - interval " . LIVE_MINUTES . " minute
                     group by p.team_id) as a
              join pok_teams_tbl t on t.id = a.team_id
              left join (select team_id, count(1) as rounds_today, min(creation_date) as first_round
                           from pok_roundstats_tbl
                          where type_code = 'NEW_ROUND' and creation_date >= curdate()
                          group by team_id) as r on r.team_id = t.id
             order by a.clients desc, t.name");

        $data['rounds'] = rows($link, "select /*+ MAX_EXECUTION_TIME(3000) */
                   ifnull(sum(creation_date > now() - interval 1 hour), 0) as last_hour
                  ,count(1) as today
              from pok_roundstats_tbl
             where type_code = 'NEW_ROUND' and creation_date >= curdate()")[0];

        // course of the day: pok_active_user_stats is filled every minute by the event job (db_jobs_pok.sql);
        // max of "active within the last 10 minutes" per 15-minute slot
        // the table and its job exist only where the event jobs are installed (live, not staging): no chart then
        try {
            $data['history'] = rows($link, "select /*+ MAX_EXECUTION_TIME(3000) */
                       hour(creation_date) * 4 + floor(minute(creation_date) / 15) as slot
                      ,max(last_ten_minutes) as clients
                  from pok_active_user_stats
                 where creation_date >= curdate()
                 group by slot
                 order by slot");
        } catch (mysqli_sql_exception $e) {
            if ($e->getCode() !== 1146) throw $e; // 1146: table does not exist
            $data['history'] = array();
        }


    } else if ($tab === 'usage') {
        // all dates from the DB clock, which the stored timestamps use as well
        $data['today'] = rows($link, "select curdate() as today")[0]['today'];
        $data['this_week'] = date('Y-m-d', strtotime('monday this week', strtotime($data['today'])));
        $data['week_start'] = date('Y-m-d', strtotime($data['this_week'] . ' -' . (USAGE_WEEKS - 1) . ' week'));
        $data['day_start'] = date('Y-m-d', strtotime($data['today'] . ' -' . (USAGE_DAYS - 1) . ' day'));

        // user ids per week from the rounds (pok_roundstat_details_tbl: everyone active in the team when a round
        // was started, removed players excluded). "returning" = user id first seen (pok_user_tbl.creation_date,
        // written on the first board load) before that week: a primary key lookup per user and week instead of
        // a scan over the whole round history.
        $data['weeks'] = rows($link, "select /*+ MAX_EXECUTION_TIME(30000) */
                   x.week_start
                  ,count(1) as users
                  ,sum(ifnull(u.creation_date < x.week_start, 0)) as returning_users
              from (select distinct d.player_id
                          ,date(r.creation_date) - interval weekday(r.creation_date) day as week_start
                      from pok_roundstats_tbl r
                      join pok_roundstat_details_tbl d on d.roundstat_id = r.id
                     where r.type_code = 'NEW_ROUND'
                       and r.creation_date >= ?
                       and (d.player_type is null or d.player_type <> 'REMOVED')) as x
              left join pok_user_tbl u on u.id = x.player_id
             group by x.week_start
             order by x.week_start", 's', array($data['week_start']));

        $teams = rows($link, "select /*+ MAX_EXECUTION_TIME(10000) */
                   date(creation_date) - interval weekday(creation_date) day as week_start
                  ,count(distinct team_id) as teams
              from pok_roundstats_tbl
             where type_code = 'NEW_ROUND' and creation_date >= ?
             group by week_start", 's', array($data['week_start']));
        $data['week_teams'] = array_column($teams, 'teams', 'week_start');

        // feature usage: only events the current app sends; the index (creation_date, event_code, display_type)
        // covers the daily query
        $codes = array_keys(EVENTS);
        $in = implode(',', array_fill(0, count($codes), '?'));
        $types = 's' . str_repeat('s', count($codes));
        $params = array_merge(array($data['day_start']), $codes);
        $data['events'] = rows($link, "select /*+ MAX_EXECUTION_TIME(20000) */
                   event_code
                  ,count(1) as cnt
                  ,count(distinct player_id) as users
                  ,sum(display_type = 'xs') as mobile
              from pok_analytics_events_tbl
             where creation_date >= ? and event_code in ($in)
             group by event_code", $types, $params);
        $data['event_days'] = rows($link, "select /*+ MAX_EXECUTION_TIME(20000) */
                   date(creation_date) as day
                  ,event_code
                  ,count(1) as cnt
                  ,sum(display_type = 'xs') as mobile
              from pok_analytics_events_tbl
             where creation_date >= ? and event_code in ($in)
             group by day, event_code", $types, $params);

    } else if ($tab === 'ideas') {
        $where = array('open' => 'where done_date is null', 'done' => 'where done_date is not null', 'all' => '')[$fb_filter];
        $data['feedback'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                   fb_id, datum, fb_type, fb_stars, fb_text, fb_context, done_date
              from pok_feedback_tbl " . $where . "
             order by datum desc, fb_id desc
             limit 200");
        $data['roadmap'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */ x.* from (
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

    } else if ($tab === 'tech') {
        $data['tables'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                   table_name as name, table_rows as row_estimate, data_length as data_bytes, index_length as index_bytes
              from information_schema.tables
             where table_schema = database()
             order by data_length + index_length desc");
        $data['db'] = rows($link, "select version() as version, @@time_zone as time_zone, @@system_time_zone as system_time_zone
                                         ,now() as now_time")[0];
        // oldest event: min() over the index on creation_date reads a single index entry
        $data['oldest_event'] = rows($link, "select /*+ MAX_EXECUTION_TIME(2000) */ min(creation_date) as oldest
                                               from pok_analytics_events_tbl")[0]['oldest'];
    }
} catch (mysqli_sql_exception $e) {
    // details only in the PHP log, the page shows the error code
    error_log('stats.php: ' . $e->getMessage());
    $error = 'error ' . $e->getCode() . ' (details in the PHP log)';
}
if ($link) $link->close();

$cards_conf = $tab === 'live' ? json_decode((string)file_get_contents(__DIR__ . '/cards.json'), true) : null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
<?php if ($tab === 'live') { ?>
    <meta http-equiv="refresh" content="<?= LIVE_RELOAD_SEC ?>" />
<?php } ?>
    <title><?= h(STATS_TABS[$tab]) ?> - Agile Poker stats</title>
    <style>
        /* B-64: console look of the app (tokens from style/style.css), dark by default, light per OS setting */
        :root {
            --bg: #0c0e12; --bg-2: #13161c; --bg-3: #1b1f27; --bg-4: #262b35;
            --line: #2a303b; --line-strong: #586174;
            --text: #d9dee8; --muted: #8b94a5; --accent: #84cbff; --on-accent: #0c0e12; --link: #ff5fd7;
            --ok: #5af78e; --warn: #f7d15a; --danger: #ff6b66;
            --warn-bg: rgba(247, 209, 90, 0.08); --row-hover: rgba(132, 203, 255, 0.05);
            --focus-ring: rgba(132, 203, 255, 0.6);
            --font: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
            --fs-xs: 0.6875rem; --fs-s: 0.8125rem; --fs-m: 0.875rem;
            --radius-s: 3px; --radius-m: 4px; --radius-l: 6px;
            color-scheme: dark;
        }
        @media (prefers-color-scheme: light) {
            :root {
                --bg: #f7f6f1; --bg-2: #eeede6; --bg-3: #e4e3db; --bg-4: #dad9d0;
                --line: #d3d2c8; --line-strong: #8e8d85;
                --text: #1d2027; --muted: #5b606b; --accent: #0a62b3; --on-accent: #ffffff; --link: #b1009d;
                --ok: #1b7a37; --warn: #8a6100; --danger: #c0262d;
                --warn-bg: rgba(138, 97, 0, 0.08); --row-hover: rgba(10, 98, 179, 0.05);
                --focus-ring: rgba(10, 98, 179, 0.5);
                color-scheme: light;
            }
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--text); font: var(--fs-m)/1.5 var(--font);
               font-variant-numeric: tabular-nums; }
        a { color: var(--link); }
        :focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
        h1 { font-size: 1rem; margin: 0; white-space: nowrap; }
        h2 { font-size: 0.95rem; margin: 2.25rem 0 0.5rem; color: var(--accent); }
        h2::before { content: "# "; color: var(--muted); }
        h3 { font-size: var(--fs-m); margin: 1.75rem 0 0.5rem; }
        h3::before { content: "## "; color: var(--muted); }
        section > h2:first-child { margin-top: 1.25rem; }
        .muted { color: var(--muted); }
        .note { color: var(--muted); font-size: var(--fs-s); max-width: 70em; margin: 0 0 0.75rem; }
        .note strong { color: var(--text); }
        .error { color: var(--danger); border: 1px solid var(--danger); border-radius: var(--radius-m); padding: 0.5em 1em; }

        /* header with tabs (sticky, scrolls sideways on narrow screens) */
        .stats-header { position: sticky; top: 0; z-index: 10; display: flex; align-items: flex-end; gap: 0 2rem;
                        padding: 0 16px; background: var(--bg-2); border-bottom: 1px solid var(--line); }
        .stats-header h1 { padding: 0.8rem 0; }
        .stats-header h1::before { content: "$ "; color: var(--ok); }
        .stats-header nav { overflow-x: auto; scrollbar-width: none; }
        .tabs { display: flex; gap: 0.25rem; margin: 0; padding: 0; list-style: none; }
        .tabs a { display: flex; align-items: center; gap: 0.5em; padding: 0.8rem 0.9rem 0.65rem; white-space: nowrap;
                  color: var(--muted); text-decoration: none; border-bottom: 3px solid transparent; }
        .tabs a:hover { color: var(--text); border-bottom-color: var(--line-strong); }
        .tabs a[aria-current="page"] { color: var(--text); font-weight: bold; border-bottom-color: var(--accent); }
        .badge { display: inline-block; min-width: 1.6em; padding: 0 0.45em; border-radius: 1em; font-weight: bold;
                 background: var(--danger); color: var(--on-accent); font-size: var(--fs-xs); line-height: 1.6; text-align: center; }

        main { max-width: 1280px; margin: 0 auto; padding: 0.5rem 16px 4rem; }

        /* live status line */
        .statusline { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25em 1.25em; }
        .pulse { display: inline-block; width: 0.6em; height: 0.6em; margin-right: 0.4em; border-radius: 50%;
                 background: var(--ok); box-shadow: 0 0 0 0 var(--ok); animation: pulse 2s ease-out infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(90, 247, 142, 0.5); } 100% { box-shadow: 0 0 0 0.6em rgba(90, 247, 142, 0); } }
        @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }

        /* KPI tiles */
        .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.75rem; margin: 0; }
        .kpi { margin: 0; padding: 0.9rem 1.1rem 1rem; background: var(--bg-3); border: 1px solid var(--line);
               border-top: 3px solid var(--accent); border-radius: var(--radius-l); }
        .kpi dt { color: var(--muted); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.06em; }
        .kpi dd { margin: 0.2rem 0 0; font-size: 2.5rem; line-height: 1.1; font-weight: bold; }
        .kpi dd small { display: block; margin-top: 0.3rem; font-size: var(--fs-s); font-weight: normal; color: var(--muted); }

        /* tables */
        .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-l); background: var(--bg-2); }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; vertical-align: top; padding: 0.45em 0.75em; border-bottom: 1px solid var(--line); }
        tbody tr:last-child td { border-bottom: 0; }
        thead th { position: sticky; top: 0; background: var(--bg-3); color: var(--muted); font-weight: normal;
                   font-size: var(--fs-s); white-space: nowrap; vertical-align: bottom; }
        tbody tr:hover td { background: var(--row-hover); }
        td.num, th.num { text-align: right; white-space: nowrap; }
        .nowrap { white-space: nowrap; }
        tr.milestone td { background: var(--warn-bg); }
        tr.milestone td:first-child { box-shadow: inset 3px 0 0 var(--warn); }
        .milestone-label { display: inline-block; margin-top: 0.15em; color: var(--warn); font-size: var(--fs-xs); white-space: nowrap; }
        .milestone-label::before { content: "\25B8 "; }
        tr.weekend td { color: var(--muted); opacity: 0.7; }
        tr.current td:first-child { color: var(--accent); }
        .chip { display: inline-block; padding: 0 0.5em; border: 1px solid var(--line-strong); border-radius: var(--radius-s);
                font-size: var(--fs-xs); line-height: 1.6; color: var(--muted); white-space: nowrap; }
        .chip.new { border-color: var(--ok); color: var(--ok); }
        .chip.bug { border-color: var(--danger); color: var(--danger); }
        td.team-name { min-width: 11em; }
        .state-revealed { color: var(--ok); white-space: nowrap; }
        .state-revealed::before { content: "\25CF"; margin-right: 0.5em; }
        .state-voting { white-space: nowrap; }
        /* small progress bar in the "cards" column (cards laid of players) */
        .mini-bar { display: inline-block; width: 4em; height: 0.45em; margin-right: 0.6em; vertical-align: middle;
                    background: var(--bg-4); border-radius: 1px; overflow: hidden; }
        .mini-bar > span { display: block; height: 100%; background: var(--accent); }

        /* horizontal bars: .bar > .seg (width inline in %), value right of the bar */
        .bar-cell { width: 34%; min-width: 14em; }
        .bar-line { display: flex; align-items: center; gap: 0.6em; min-height: 1.5em; }
        .bar { display: flex; flex: 1 1 auto; height: 0.75em; min-width: 8em; background: var(--bg-4); border-radius: 2px; overflow: hidden; }
        .bar .seg { display: block; height: 100%; background: var(--accent); }
        .bar .seg.new { background: var(--link); }
        .bar .seg.idx { background: var(--line-strong); }
        .bar-val { min-width: 3.5em; text-align: right; color: var(--muted); font-size: var(--fs-s); }
        .bar-scale { display: flex; justify-content: space-between; gap: 1em; padding-right: 4.1em; }
        .legend { display: flex; gap: 1.25em; align-items: center; }
        .legend .ret, .legend .new { display: inline-block; width: 0.8em; height: 0.8em; margin-right: 0.4em;
                                     vertical-align: -0.05em; border-radius: 1px; }
        .legend .ret { background: var(--accent); }
        .legend .new { background: var(--link); }
        .legend .idx { display: inline-block; width: 0.8em; height: 0.8em; margin-right: 0.4em; vertical-align: -0.05em;
                       border-radius: 1px; background: var(--line-strong); }

        /* course of the day: .chart > .col (height inline in %), 00:00-24:00 with a gridline every 3 h */
        .chart-box { display: grid; grid-template-columns: auto 1fr; gap: 0 0.5em; padding: 1rem 1.5rem 0.75rem 1rem;
                     background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-l); }
        .chart-y { display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end;
                   height: 10rem; color: var(--muted); font-size: var(--fs-xs); line-height: 1; }
        .chart { position: relative; display: flex; align-items: flex-end; gap: 1px; height: 10rem;
                 border-top: 1px dashed var(--line); border-bottom: 1px solid var(--line-strong);
                 background: repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px 12.5%); }
        .chart .col { flex: 1 1 0; min-width: 1px; background: var(--accent); border-radius: 1px 1px 0 0; }
        .chart .col:hover { background: var(--link); }
        .chart .col.empty, .chart .col.future { background: transparent; }
        .chart-x { grid-column: 2; display: flex; justify-content: space-between; margin-top: 0.3em;
                   color: var(--muted); font-size: var(--fs-xs); }
        .chart-x span { width: 0; display: flex; justify-content: center; white-space: nowrap; }

        /* Ideas & Bugs moderation (B-57) */
        .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5em 1em; }
        .filters .seg-ctrl { display: inline-flex; border: 1px solid var(--line-strong); border-radius: var(--radius-m); overflow: hidden; }
        .filters .seg-ctrl a { padding: 0.25em 0.9em; color: var(--muted); text-decoration: none; }
        .filters .seg-ctrl a + a { border-left: 1px solid var(--line-strong); }
        .filters .seg-ctrl a:hover { color: var(--text); }
        .filters .seg-ctrl a.active { background: var(--accent); color: var(--on-accent); font-weight: bold; }
        .event-days thead th { white-space: normal; min-width: 5.5em; }
        .event-days thead th:first-child { min-width: 0; }
        .inbox td:first-child { white-space: nowrap; color: var(--muted); font-size: var(--fs-s); }
        .fb_text { white-space: pre-wrap; min-width: 16em; max-width: 44em; }
        .fb_context { font-size: var(--fs-xs); color: var(--muted); max-width: 22em; overflow-wrap: anywhere; }
        .inbox td:last-child { white-space: nowrap; text-align: right; }
        .inbox td:last-child small { color: var(--muted); }
        tr.done td { opacity: 0.55; }

        /* one card per entry of the public list; status as colored left edge, hidden entries dimmed */
        .rm { display: grid; gap: 0.5rem; align-items: center; margin: 0 0 0.6rem; padding: 0.75rem;
              grid-template-columns: 5.5em 8.5em 9.5em minmax(10em, 1fr) auto;
              grid-template-areas: "order type status title visible" "desc desc desc desc desc" "votes votes votes votes save";
              background: var(--bg-2); border: 1px solid var(--line); border-left: 3px solid var(--line-strong);
              border-radius: var(--radius-l); }
        .rm:has(select[name=status] option[value="DONE"]:checked) { border-left-color: var(--ok); }
        .rm:has(select[name=status] option[value="IN_PROGRESS"]:checked) { border-left-color: var(--accent); }
        .rm:has(input[name=visible]:not(:checked)) { opacity: 0.6; }
        .rm:last-child { border-style: dashed; border-left-style: solid; }
        .rm input[name=sort_order] { grid-area: order; width: 100%; }
        .rm select[name=type] { grid-area: type; }
        .rm select[name=status] { grid-area: status; }
        .rm input[name=title] { grid-area: title; width: 100%; }
        .rm label { grid-area: visible; white-space: nowrap; color: var(--muted); }
        .rm textarea { grid-area: desc; width: 100%; resize: vertical; }
        .rm .votes { grid-area: votes; color: var(--muted); font-size: var(--fs-s); }
        .rm button { grid-area: save; justify-self: end; }
        input, select, textarea, button { font: inherit; color: var(--text); background: var(--bg);
                                          border: 1px solid var(--line-strong); border-radius: var(--radius-m); padding: 0.3em 0.5em; }
        input[type=checkbox] { accent-color: var(--accent); }
        input:focus, select:focus, textarea:focus { border-color: var(--accent); }
        button { cursor: pointer; padding: 0.3em 1em; background: var(--bg-3); }
        button:hover { border-color: var(--accent); color: var(--accent); }

        /* Tech */
        dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.4em 1.5em; margin: 0; padding: 0.9rem 1.1rem;
                   background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-l); }
        dl.facts dt { color: var(--muted); }
        dl.facts dd { margin: 0; overflow-wrap: anywhere; }

        @media (max-width: 900px) {
            .stats-header { flex-direction: column; align-items: stretch; }
            .stats-header h1 { padding: 0.6rem 0 0.1rem; }
            .tabs a { padding: 0.6rem 0.75rem 0.5rem; }
            .kpi dd { font-size: 2rem; }
            .bar-cell { min-width: 12em; }
            th, td { padding: 0.45em 0.5em; }
        }
        @media (max-width: 640px) {
            .kpis { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
            .kpi { padding: 0.7rem 0.8rem; }
            .chart-box { padding: 0.75rem 0.5rem 0.5rem; }
            .chart-x span:nth-child(even) { visibility: hidden; }
            .rm { grid-template-columns: 5em 1fr 1fr;
                  grid-template-areas: "order type status" "title title title" "desc desc desc" "visible visible save" "votes votes votes"; }
            dl.facts { grid-template-columns: 1fr; gap: 0 0; }
            dl.facts dd { margin-bottom: 0.5em; }
        }
    </style>
</head>
<body class="stats stats-<?= h($tab) ?>">
<header class="stats-header">
    <h1>poker stats</h1>
    <nav aria-label="Sections">
        <ul class="tabs">
<?php foreach (STATS_TABS as $key => $label) { ?>
            <li><a href="stats.php?tab=<?= h($key) ?>"<?= $key === $tab ? ' aria-current="page"' : '' ?>><?= h($label) ?><?php
                if ($key === 'ideas' && $open_feedback_cnt > 0) { ?><span class="badge" title="open messages"><?= h($open_feedback_cnt) ?></span><?php } ?></a></li>
<?php } ?>
        </ul>
    </nav>
</header>
<main>
<?php if ($error !== null) { ?>
    <p class="error">Query failed: <?= h($error) ?></p>
<?php } else if ($tab === 'live') {
    $tables = $data['tables'];
    $clients = array_sum(array_column($tables, 'clients'));
    $players = array_sum(array_column($tables, 'players'));
    $observers = array_sum(array_column($tables, 'observers'));
?>
    <section class="live" aria-labelledby="live_h">
        <h2 id="live_h">Right now</h2>
        <p class="note statusline"><span><span class="pulse" aria-hidden="true"></span><strong>live</strong> as of <?= h(hm($data['now']['now_time'])) ?>, reloads every <?= LIVE_RELOAD_SEC ?> s</span>
            <span>active = board loaded data within the last <?= LIVE_MINUTES ?> minutes (happens on every action in the team)</span></p>
        <dl class="kpis">
            <div class="kpi"><dt>active tables</dt><dd id="kpi_teams"><?= h(count($tables)) ?></dd></div>
            <div class="kpi"><dt>active clients</dt><dd id="kpi_clients"><?= h($clients) ?> <small><?= h($players) ?> players, <?= h($observers) ?> observers</small></dd></div>
            <div class="kpi"><dt>rounds last hour</dt><dd id="kpi_rounds_hour"><?= h($data['rounds']['last_hour']) ?></dd></div>
            <div class="kpi"><dt>rounds today</dt><dd id="kpi_rounds_today"><?= h($data['rounds']['today']) ?></dd></div>
        </dl>

        <h2>Active tables</h2>
<?php if (count($tables) === 0) { ?>
        <p class="muted">No active table.</p>
<?php } else { ?>
        <div class="table-wrap">
        <table class="live-tables">
            <thead><tr>
                <th>team</th><th class="num">players</th><th class="num">observers</th>
                <th class="num" title="active clients whose user id was first seen before today">known users</th>
                <th>deck</th><th class="num">rounds today</th>
                <th title="first round today (or creation of a team created today)">active since</th><th>cards</th>
            </tr></thead>
            <tbody>
<?php foreach ($tables as $row) {
        $revealed = $row['team_players'] > 0 && $row['cards_laid'] == $row['team_players'];
?>
            <tr class="live-table">
                <td class="team-name"><?= h($row['name']) ?><?= $row['created_today'] ? ' <span class="chip new">new today</span>' : '' ?></td>
                <td class="num"><?= h($row['players']) ?></td>
                <td class="num"><?= h($row['observers']) ?></td>
                <td class="num"><?= h($row['known_users']) ?> / <?= h($row['clients']) ?></td>
                <td class="nowrap"><?= h(deck_name($row['cardset_flags'], (bool)$row['needs_setup'], $cards_conf)) ?></td>
                <td class="num"><?= h($row['rounds_today']) ?></td>
                <td class="nowrap"><?= $row['active_since'] === null ? '<span class="muted">before today</span>' : h(hm($row['active_since'])) ?></td>
                <td class="<?= $revealed ? 'state-revealed' : 'state-voting' ?>"><?= $revealed ? 'revealed' : '<span class="mini-bar" aria-hidden="true"><span style="width: ' . bar_width($row['cards_laid'], $row['team_players']) . '%"></span></span>' . h($row['cards_laid'] . ' of ' . $row['team_players'] . ' laid') ?></td>
            </tr>
<?php } ?>
            </tbody>
        </table>
        </div>
<?php } ?>

        <h2>Active clients today</h2>
<?php
    $history = array_column($data['history'], 'clients', 'slot');
    $max = $history ? max($history) : 0;
    $now_slot = (int)substr($data['now']['now_time'], 11, 2) * 4 + intdiv((int)substr($data['now']['now_time'], 14, 2), 15);
    if ($max == 0) { ?>
        <p class="muted">No data (pok_active_user_stats is filled by the event job pok_active_users_evt, see db_jobs_pok.sql).</p>
<?php } else { ?>
        <p class="note">Clients active within 10 minutes, highest value per 15 minutes (pok_active_user_stats). Peak today: <?= h($max) ?>.</p>
        <div class="chart-box">
        <div class="chart-y" aria-hidden="true"><span><?= h($max) ?></span><span>0</span></div>
        <div class="chart" role="img" aria-label="Active clients today in 15-minute steps, peak <?= h($max) ?>">
<?php for ($slot = 0; $slot < 96; $slot++) {
            $value = $history[$slot] ?? null;
            $label = sprintf('%02d:%02d', intdiv($slot, 4), ($slot % 4) * 15);
            if ($slot > $now_slot) { ?>
            <span class="col future"></span>
<?php       } else if ($value === null) { ?>
            <span class="col empty" title="<?= $label ?>: no data"></span>
<?php       } else { ?>
            <span class="col" style="height: <?= bar_width($value, $max) ?>%" title="<?= $label ?>: <?= h($value) ?>"></span>
<?php       }
        } ?>
        </div>
        <div class="chart-x" aria-hidden="true"><?php for ($hour = 0; $hour <= 24; $hour += 3) { ?><span><?= sprintf('%02d:00', $hour) ?></span><?php } ?></div>
        </div>
<?php } ?>
    </section>

<?php } else if ($tab === 'usage') {
    // one row per week, also for weeks without rounds
    $by_week = array_column($data['weeks'], null, 'week_start');
    $weeks = array();
    for ($i = 0; $i < USAGE_WEEKS; $i++) {
        $week = date('Y-m-d', strtotime($data['week_start'] . ' +' . $i . ' week'));
        $weeks[] = $by_week[$week] ?? array('week_start' => $week, 'users' => 0, 'returning_users' => 0);
    }
    $max_users = max(array_column($weeks, 'users'));
    $this_week = $data['this_week'];
?>
    <section class="usage" aria-labelledby="weeks_h">
        <h2 id="weeks_h">New vs. returning user ids per week</h2>
        <p class="note">User ids (one per browser) that were at a table when a round was started (pok_roundstat_details_tbl).
            Returning = the user id was first seen (pok_user_tbl, first board load) before that week; new = first seen in that week.
            Grafana already shows teams, rounds and active use per day.</p>
        <p class="legend note"><span><span class="ret"></span>returning</span> <span><span class="new"></span>new</span></p>
        <div class="table-wrap">
        <table class="weeks">
            <thead><tr><th>week</th><th class="num">teams</th><th class="num">user ids</th><th class="num">returning</th><th class="num">new</th><th class="num">returning %</th><th class="bar-cell"><span class="bar-scale"><span>0</span><span><?= h($max_users) ?> user ids</span></span></th></tr></thead>
            <tbody>
<?php foreach ($weeks as $w) {
        $new = $w['users'] - $w['returning_users'];
        $label = milestone($w['week_start'], 7);
?>
            <tr<?= $label !== '' ? ' class="milestone"' : '' ?>>
                <td class="nowrap"><?= h($w['week_start']) ?> <span class="muted">W<?= h(date('W', strtotime($w['week_start']))) ?></span><?= $w['week_start'] === $this_week ? ' <span class="muted">(so far)</span>' : '' ?><?php
                    if ($label !== '') { ?><br><span class="milestone-label"><?= h($label) ?></span><?php } ?></td>
                <td class="num"><?= h($data['week_teams'][$w['week_start']] ?? 0) ?></td>
                <td class="num"><?= h($w['users']) ?></td>
                <td class="num"><?= h($w['returning_users']) ?></td>
                <td class="num"><?= h($new) ?></td>
                <td class="num"><?= h(pct($w['returning_users'], $w['users'])) ?> %</td>
                <td class="bar-cell"><span class="bar-line"><span class="bar" title="<?= h($w['returning_users']) ?> returning, <?= h($new) ?> new"><span class="seg ret" style="width: <?= bar_width($w['returning_users'], $max_users) ?>%"></span><span class="seg new" style="width: <?= bar_width($new, $max_users) ?>%"></span></span><span class="bar-val"><?= h($w['users']) ?></span></span></td>
            </tr>
<?php } ?>
            </tbody>
        </table>
        </div>

<?php
    $events = array_column($data['events'], null, 'event_code');
    $loads = (int)($events['BOARD_ON_LOAD']['cnt'] ?? 0);
    $max_cnt = $data['events'] ? max(array_column($data['events'], 'cnt')) : 0;
?>
        <h2>Features and menus, last <?= USAGE_DAYS ?> days</h2>
        <p class="note">From pok_analytics_events_tbl, only events the current app sends. Mobile = screen narrower than 800 px (display_type xs).
            Board loads on mobile: <strong id="mobile_share"><?= h(pct($events['BOARD_ON_LOAD']['mobile'] ?? 0, $loads)) ?> %</strong>.</p>
        <div class="table-wrap">
        <table class="events">
            <thead><tr><th>event</th><th class="num">count</th><th class="num">user ids</th><th class="num">per 100 board loads</th><th class="num">mobile %</th><th class="bar-cell"><span class="bar-scale"><span>0</span><span><?= h($max_cnt) ?></span></span></th></tr></thead>
            <tbody>
<?php foreach (EVENTS as $code => $label) {
        $e = $events[$code] ?? array('cnt' => 0, 'users' => 0, 'mobile' => 0);
?>
            <tr>
                <td title="<?= h($code) ?>"><?= h($label) ?></td>
                <td class="num"><?= h($e['cnt']) ?></td>
                <td class="num"><?= h($e['users']) ?></td>
                <td class="num"><?= $code === 'BOARD_ON_LOAD' ? '' : h(pct($e['cnt'], $loads)) ?></td>
                <td class="num"><?= h(pct($e['mobile'], $e['cnt'])) ?></td>
                <td class="bar-cell"><span class="bar-line"><span class="bar"><span class="seg" style="width: <?= bar_width($e['cnt'], $max_cnt) ?>%"></span></span><span class="bar-val"><?= h($e['cnt']) ?></span></span></td>
            </tr>
<?php } ?>
            </tbody>
        </table>
        </div>

<?php
    $days = array();
    foreach ($data['event_days'] as $r) $days[$r['day']][$r['event_code']] = $r;
?>
        <h3>Per day</h3>
        <div class="table-wrap">
        <table class="event-days">
            <thead><tr><th>day</th>
<?php foreach (EVENTS as $code => $label) { ?>
                <th class="num" title="<?= h($code) ?>"><?= h($label) ?></th>
<?php } ?>
                <th class="num">mobile % of board loads</th>
            </tr></thead>
            <tbody>
<?php for ($i = 0; $i < USAGE_DAYS; $i++) {
        $day = date('Y-m-d', strtotime($data['today'] . ' -' . $i . ' day'));
        $label = milestone($day);
        $classes = array();
        if ((int)date('N', strtotime($day)) >= 6) $classes[] = 'weekend';
        if ($label !== '') $classes[] = 'milestone';
        if ($i === 0) $classes[] = 'current';
?>
            <tr<?= $classes ? ' class="' . h(implode(' ', $classes)) . '"' : '' ?>>
                <td class="nowrap"><?= h(date('D Y-m-d', strtotime($day))) ?><?php if ($label !== '') { ?><br><span class="milestone-label"><?= h($label) ?></span><?php } ?></td>
<?php   foreach (EVENTS as $code => $_) { ?>
                <td class="num"><?= h($days[$day][$code]['cnt'] ?? 0) ?></td>
<?php   } ?>
                <td class="num"><?= h(pct($days[$day]['BOARD_ON_LOAD']['mobile'] ?? 0, $days[$day]['BOARD_ON_LOAD']['cnt'] ?? 0)) ?> %</td>
            </tr>
<?php } ?>
            </tbody>
        </table>
        </div>
    </section>

<?php } else if ($tab === 'ideas') { ?>
    <section class="ideas">
        <h2 id="inbox">Inbox</h2>
        <p class="filters"><span class="seg-ctrl">
<?php foreach (array('open', 'done', 'all') as $filter) { ?>
            <a href="stats.php?tab=ideas&amp;fb=<?= $filter ?>#inbox"<?= $filter === $fb_filter ? ' class="active"' : '' ?>><?= $filter ?></a>
<?php } ?>
            </span><span class="muted">newest first, max. 200</span>
        </p>
        <div class="table-wrap">
        <table class="inbox">
            <thead><tr><th>date</th><th>type</th><th>text</th><th>context</th><th></th></tr></thead>
            <tbody>
<?php foreach ($data['feedback'] as $obj) {
        $obj = (object)$obj;
        $done = $obj->done_date !== null;
        echo '<tr class="feedback_row' . ($done ? ' done' : '') . '" data-fb-id="' . h($obj->fb_id) . '">';
        echo '<td>' . h($obj->datum) . '</td>';
        echo '<td><span class="chip' . ($obj->fb_type === 'BUG' ? ' bug' : '') . '">' . h($obj->fb_type ?? '-') . '</span>' . ($obj->fb_stars > 0 ? ' ' . str_repeat('*', min(5, (int)$obj->fb_stars)) : '') . '</td>';
        echo '<td class="fb_text">' . h($obj->fb_text) . '</td>';
        echo '<td class="fb_context">' . h($obj->fb_context) . '</td>';
        echo '<td><form method="post" action="stats.php?tab=ideas&amp;fb=' . h($fb_filter) . '">'
            . '<input type="hidden" name="csrf" value="' . h($csrf) . '">'
            . '<input type="hidden" name="action" value="feedback_done">'
            . '<input type="hidden" name="fb_id" value="' . h($obj->fb_id) . '">'
            . '<input type="hidden" name="done" value="' . ($done ? '0' : '1') . '">'
            . '<button type="submit">' . ($done ? 'Reopen' : 'Done') . '</button>'
            . ($done ? '<br><small>' . h($obj->done_date) . '</small>' : '')
            . '</form></td>';
        echo "</tr>\n";
} ?>
            </tbody>
        </table>
        </div>

        <h2 id="roadmap">Public list</h2>
        <p class="note">Written by us, shown in the app (visible entries only, sorted by status DONE, IN_PROGRESS, PLANNED, then thumbs up minus thumbs down of the current phase, then order, then newest first).</p>
<?php foreach ($data['roadmap'] as $obj) {
        echo roadmap_form((object)$obj, $csrf, $fb_filter) . "\n";
} ?>
        <h3>New entry</h3>
<?= roadmap_form(null, $csrf, $fb_filter) . "\n" ?>
    </section>

<?php } else if ($tab === 'tech') {
    $mb = fn($bytes) => number_format($bytes / 1048576, 1, '.', '');
    $max_bytes = $data['tables'] ? max(array_map(fn($t) => (float)$t['data_bytes'] + (float)$t['index_bytes'], $data['tables'])) : 0;
?>
    <section class="tech">
        <h2>Release</h2>
        <dl class="facts">
<?php foreach (release_info() as $key => $value) { ?>
            <dt><?= h($key) ?></dt><dd><?= h($value) ?></dd>
<?php } ?>
            <dt>PHP</dt><dd><?= h(PHP_VERSION) ?></dd>
            <dt>MySQL</dt><dd><?= h($data['db']['version']) ?></dd>
            <dt>DB time</dt><dd><?= h($data['db']['now_time']) ?> <span class="muted">(time zone <?= h($data['db']['time_zone']) ?>, system <?= h($data['db']['system_time_zone']) ?>)</span></dd>
            <dt>Oldest analytics event</dt><dd><?= h($data['oldest_event'] ?? '-') ?></dd>
        </dl>

        <h2>Tables</h2>
        <p class="note legend"><span>Row counts are InnoDB estimates (information_schema).</span> <span><span class="ret"></span>data</span> <span><span class="idx"></span>index</span></p>
        <div class="table-wrap">
        <table class="db-tables">
            <thead><tr><th>table</th><th class="num">rows (est.)</th><th class="num">data MB</th><th class="num">index MB</th><th class="bar-cell"><span class="bar-scale"><span>0</span><span><?= h($mb($max_bytes)) ?> MB</span></span></th></tr></thead>
            <tbody>
<?php foreach ($data['tables'] as $t) { ?>
            <tr><td><?= h($t['name']) ?></td><td class="num"><?= h(number_format((float)$t['row_estimate'], 0, '.', ' ')) ?></td>
                <td class="num"><?= h($mb((float)$t['data_bytes'])) ?></td><td class="num"><?= h($mb((float)$t['index_bytes'])) ?></td>
                <td class="bar-cell"><span class="bar-line"><span class="bar" title="data + index"><span class="seg" style="width: <?= bar_width((float)$t['data_bytes'], $max_bytes) ?>%"></span><span class="seg idx" style="width: <?= bar_width((float)$t['index_bytes'], $max_bytes) ?>%"></span></span><span class="bar-val"><?= h($mb((float)$t['data_bytes'] + (float)$t['index_bytes'])) ?></span></span></td></tr>
<?php } ?>
            </tbody>
        </table>
        </div>
    </section>
<?php } ?>
</main>
</body>
</html>
