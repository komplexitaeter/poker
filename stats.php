<?php
/*
 * Internal statistics and moderation of "Ideas & Bugs" (B-57, B-64). Own login page (B-63): user and
 * password are checked against the nginx htpasswd file (bcrypt entries only, docs/stats-basic-auth.md),
 * "stay logged in" is a signed cookie (30 days). Without a valid cookie the page shows the login form
 * only and runs no query. Moderation actions are POSTs to this page with a valid cookie and a session
 * form token (CSRF protection), followed by a redirect back (POST/redirect/GET).
 *
 * Tabs (B-64, ?tab=): live (default, reloads every 30 s), usage, trends (B-13: long ranges, replaces Grafana),
 * ideas (moderation), tech.
 * Only the queries of the shown tab run. Every query has a time range on an indexed column and a
 * MAX_EXECUTION_TIME hint. Never output a team id: it is the access key of a board.
 *
 * Times are shown in the viewer's time zone: an inline script stores the browser's IANA zone in the cookie
 * stats_tz, PHP and the MySQL session use it (UTC without a valid cookie). MySQL gets the current UTC offset of
 * that zone instead of its name (the MySQL time zone tables may not be loaded), so timestamp columns convert with
 * today's offset: on days before/after a daylight saving change, times and day boundaries are off by one hour.
 */
require './config.php';
require './api/lib.php';

const STATS_TABS = array('live' => 'Live', 'usage' => 'Usage', 'trends' => 'Trends', 'ai' => 'AI & API', 'ideas' => 'Ideas & Bugs', 'tech' => 'Tech');
const ACTIVE_ROUND_MINUTES = 60; // a table counts as active if it started a new round within this many minutes;
                                 // its clients count if their board loaded data within the same time
const LIVE_RELOAD_SEC = 30;
const USAGE_WEEKS = 9;           // weekly users: current week + 8 full weeks
const USAGE_DAYS = 28;           // daily feature usage
const LIVE_DAYS = 28;            // rounds per day in the live tab (today + 27 days)
const AI_DAYS = 28;              // B-160: tab "AI & API" (today, 7 and 28 days)
/* trends tab (B-13): ?range= (start relative to today, null = all data; default granularity if ?gran= is missing)
   and ?gran= (one bar/point per day, ISO week starting Monday or calendar month) */
const TREND_RANGES = array(
    '1w'  => array('label' => '1 week',   'start' => '-6 day',            'gran' => 'day'),
    '4w'  => array('label' => '4 weeks',  'start' => '-27 day',           'gran' => 'day'),
    '6m'  => array('label' => '6 months', 'start' => '-6 month +1 day',   'gran' => 'week'),
    '1y'  => array('label' => '1 year',   'start' => '-1 year +1 day',    'gran' => 'week'),
    '2y'  => array('label' => '2 years',  'start' => '-2 year +1 day',    'gran' => 'month'),
    'all' => array('label' => 'All',      'start' => null,                'gran' => 'month'),
);
const TREND_DEFAULT_RANGE = '4w';
const TREND_GRANS = array('day' => 'Days', 'week' => 'Weeks', 'month' => 'Months');
/* period start of a DATE expression {d} per granularity (constant SQL, the expression is a constant as well) */
const TREND_PERIOD_SQL = array(
    'day'   => '{d}',
    'week'  => '{d} - interval weekday({d}) day',
    'month' => '{d} - interval (dayofmonth({d}) - 1) day',
);
const TREND_ALL_START = '2000-01-01';   // "All": lower bound of the range (keeps the where clause on the index)
/* dates worth marking in the usage charts (live deploys); add a line with every rollout to master */
const MILESTONES = array(
    '2026-10-28' => 'Rollout 1',
    '2026-11-01' => 'Rollout 2',
    '2026-11-06' => 'Rollout 3',
    '2026-11-09' => 'Sidebar, light heartbeat',
    '2026-11-16' => 'Topic list, median, nudge sound; emoji quota, clean-up',
    '2026-11-18' => 'Async start, colour mode kept locally',
    '2026-11-25' => 'script.js split, topic panel fix',
    '2026-11-26' => 'UID from the server, only in a header; removed players as observers; public API v1 (keys, items)',
    '2026-11-28' => 'AI connector (MCP)',
);
/* milestone lines on/off per viewer (localStorage, stats.php only) */
const MS_STORAGE_KEY = 'stats_milestones';
/* login (B-63): htpasswd file of nginx, the only place of the credentials (maintained with htpasswd -B -C 12);
   STATS_COOKIE_SECRET (config.php) is part of the cookie signature key */
define('AUTH_FILE', defined('STATS_HTPASSWD') ? STATS_HTPASSWD : '/etc/nginx/poker-stats.htpasswd');
const AUTH_COOKIE = 'pokstats_auth';
const AUTH_DAYS = 30;
/* time zone of the viewer (IANA name), set by the inline script in <head> */
const TZ_COOKIE = 'stats_tz';
/* analytics events the current app still sends (script/*.js: measureEvent, gMenuSections in script_feedback.js) */
const EVENTS = array(
    'BOARD_ON_LOAD'          => 'Board loaded',
    'INIT_ON_LOAD'           => 'Start page loaded',
    'OPEN_TOPIC_BOX'         => 'Menu: Topic',
    'OPEN_SETUP_BOX'         => 'Menu: Board settings',
    'OPEN_TIMER_BOX'         => 'Menu: Timer',
    'OPEN_USER_SETTINGS_BOX' => 'Menu: You',
    'OPEN_FEEDBACK_BOX'      => 'Menu: Feedback',
    'TOPIC_SAVED'            => 'Topic saved',
    'TOGGLE_TIMER'           => 'Timer switched on/off',
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

/* time zone from the cookie if PHP knows it (incl. old names like Asia/Calcutta that browsers still report), else UTC */
function viewer_time_zone(): string {
    $tz = $_COOKIE[TZ_COOKIE] ?? null;
    return is_string($tz) && in_array($tz, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true) ? $tz : 'UTC';
}

/* UTC offset in seconds as "+HH:MM" */
function utc_offset(int $seconds): string {
    return ($seconds < 0 ? '-' : '+') . sprintf('%02d:%02d', intdiv(abs($seconds), 3600), intdiv(abs($seconds) % 3600, 60));
}

/*
 * Switches the MySQL session to the viewer's current UTC offset (now(), curdate() and timestamp columns then
 * use it). Returns the offset the DB used before: datetime columns written by the event jobs
 * (pok_active_user_stats) hold that DB time and are not converted by MySQL.
 */
function set_db_time_zone($link, string $offset): string {
    $db_offset = utc_offset((int)rows($link, "select timestampdiff(second, utc_timestamp(), now()) as s")[0]['s']);
    $stmt = $link->prepare('set time_zone = ?');
    $stmt->bind_param('s', $offset);
    $stmt->execute();
    $stmt->close();
    return $db_offset;
}

/* percentage of $part in $total, rounded, 0 if $total is 0 */
function pct($part, $total): int {
    return $total > 0 ? (int)round(100 * $part / $total) : 0;
}

/* bar width in % of $max (CSS width), with one decimal */
function bar_width($value, $max): string {
    return $max > 0 ? number_format(100 * $value / $max, 1, '.', '') : '0';
}

/*
 * bcrypt entries of the htpasswd file as user => hash, false if the file is not readable or the cookie
 * secret is missing (login not configured). Other formats (e.g. $apr1$ = MD5) are left out on purpose.
 */
function auth_entries() {
    if (!defined('STATS_COOKIE_SECRET') || strlen((string)STATS_COOKIE_SECRET) < 32) {
        error_log('stats.php: login not configured, STATS_COOKIE_SECRET missing or shorter than 32 chars in config.php');
        return false;
    }
    $lines = is_readable(AUTH_FILE) ? file(AUTH_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : false;
    if ($lines === false) {
        error_log('stats.php: login not configured, cannot read ' . AUTH_FILE . ' (must be readable by the PHP-FPM user)');
        return false;
    }
    $entries = array();
    foreach ($lines as $line) {
        $parts = explode(':', trim($line), 2);
        if (count($parts) !== 2) continue;
        if (preg_match('/^\$2[yb]\$/', $parts[1])) {
            $entries[$parts[0]] = $parts[1];
        } else if (($_POST['user'] ?? null) === $parts[0]) {
            error_log('stats.php: user "' . $parts[0] . '" in ' . AUTH_FILE . ' has no bcrypt hash, re-hash with htpasswd -B -C 12');
        }
    }
    return $entries;
}

/*
 * cookie signature, keyed with the user's hash and the server secret: a new password invalidates all
 * cookies of that user, and the hash alone (e.g. a leaked htpasswd file) is not enough to forge a cookie
 */
function auth_signature(string $payload, string $hash): string {
    return hash_hmac('sha256', $payload, hash_hmac('sha256', $hash, STATS_COOKIE_SECRET));
}

function auth_cookie_options(int $expires): array {
    return array(
        'expires' => $expires,
        'path' => $_SERVER['SCRIPT_NAME'] ?? '/stats.php',
        'httponly' => true,
        'samesite' => 'Strict',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'
    );
}

/* logged in user from the cookie "user|expires|signature" (checked against the current file), else null */
function auth_user(array $entries): ?string {
    $value = $_COOKIE[AUTH_COOKIE] ?? null;
    if (!is_string($value)) return null;
    $parts = explode('|', $value);
    if (count($parts) !== 3 || !ctype_digit($parts[1]) || (int)$parts[1] < time()) return null;
    $user = rawurldecode($parts[0]);
    if (!isset($entries[$user])) return null;
    return hash_equals(auth_signature($parts[0] . '|' . $parts[1], $entries[$user]), $parts[2]) ? $user : null;
}

$time_zone = viewer_time_zone();
date_default_timezone_set($time_zone);
$time_zone_offset = date('P');

$tab = filter_input(INPUT_GET, 'tab');
if (!is_string($tab) || !array_key_exists($tab, STATS_TABS)) $tab = 'live';

$fb_filter = filter_input(INPUT_GET, 'fb');
if (!in_array($fb_filter, array('open', 'done', 'all'), true)) $fb_filter = 'open';

$trend_range = filter_input(INPUT_GET, 'range');
if (!is_string($trend_range) || !array_key_exists($trend_range, TREND_RANGES)) $trend_range = TREND_DEFAULT_RANGE;
$trend_gran_param = filter_input(INPUT_GET, 'gran');   // explicit choice wins over the default of the range
if (!is_string($trend_gran_param) || !array_key_exists($trend_gran_param, TREND_GRANS)) $trend_gran_param = null;
$trend_gran = $trend_gran_param ?? TREND_RANGES[$trend_range]['gran'];

/* this page with the current tab, target of the login form and of the redirect after login/logout */
$self = 'stats.php?tab=' . $tab . ($tab === 'ideas' ? '&fb=' . $fb_filter : '')
    . ($tab === 'trends' ? '&range=' . $trend_range . ($trend_gran_param !== null ? '&gran=' . $trend_gran_param : '') : '');

/* ---------- login (B-63) ---------- */
$entries = auth_entries();
$login_error = null;
if ($entries === false) {
    http_response_code(503);
    $login_error = 'Login not configured (see the PHP log).';
    $entries = array();
}
$auth_user = auth_user($entries);
$post_action = $_SERVER['REQUEST_METHOD'] === 'POST' ? post_text('action', 20) : '';

if ($post_action === 'login' && $login_error === null) {
    // no form token here: a session that expired while the form was open must not block the login
    $user = post_text('user', 100);
    $password = $_POST['password'] ?? '';
    $hash = $entries[$user] ?? null;
    // unknown user: check against an existing hash (same cost), so the timing does not reveal user names
    $check_hash = $hash ?? reset($entries);
    $ok = is_string($password) && strlen($password) <= 200 && is_string($check_hash) && password_verify($password, $check_hash);
    if ($ok && $hash !== null) {
        $expires = time() + AUTH_DAYS * 86400;
        $payload = rawurlencode($user) . '|' . $expires;
        setcookie(AUTH_COOKIE, $payload . '|' . auth_signature($payload, $hash), auth_cookie_options($expires));
        header('Location: ' . $self, true, 303);
        exit;
    }
    sleep(1);   // slows down guessing (plus limit_req in nginx, docs/stats-basic-auth.md)
    $login_error = 'Wrong user or password.';
    $auth_user = null;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $post_action !== 'login' && $auth_user === null) {
    reject(403, 'Not logged in - reload stats.php and log in.');
}

/* form token (CSRF) for logout and moderation; session only when logged in, no session files for anonymous calls */
$csrf = '';
if ($auth_user !== null) {
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
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $post_action !== 'login') {
    $token = $_POST['csrf'] ?? '';
    if (!is_string($token) || !hash_equals($csrf, $token)) {
        reject(403, 'Invalid or missing form token - reload stats.php and try again.');
    }
    if ($post_action === 'logout') {
        setcookie(AUTH_COOKIE, '', auth_cookie_options(1));
        header('Location: ' . $self, true, 303);
        exit;
    }

    $action = $post_action;
    $link = db_init();

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

/* milestone labels of a day (Y-m-d) or of the $days days starting there, '' if none; with the date for longer periods */
function milestone(string $day, int $days = 1): string {
    $labels = array();
    foreach (MILESTONES as $date => $label) {
        if ($date >= $day && $date < date('Y-m-d', strtotime($day . ' +' . $days . ' day'))) $labels[] = $label . ($days > 1 ? ' (' . $date . ')' : '');
    }
    return implode(', ', $labels);
}

/* tooltip suffix of a milestone label ('' if none): " · Milestone: AI connector (MCP)", several: "Milestones: a, b" */
function milestone_tip(string $label): string {
    if ($label === '') return '';
    return ' · Milestone' . (count(array_filter(array_keys(MILESTONES), fn($d) => str_contains($label, '(' . $d . ')'))) > 1 ? 's' : '') . ': ' . $label;
}

/* the switch "Milestones" (tabs with charts): hidden without JS (the lines then simply stay visible); the inline script in
   <head> sets html.no-ms early from localStorage, this one wires the checkbox */
function milestone_toggle(): string {
    return '<label class="ms-toggle" id="ms_toggle_wrap" hidden><input type="checkbox" id="ms_toggle" checked> Milestones</label>'
        . '<script>(function () { var root = document.documentElement, box = document.getElementById(\'ms_toggle\');'
        . ' box.checked = !root.classList.contains(\'no-ms\'); document.getElementById(\'ms_toggle_wrap\').hidden = false;'
        . ' box.addEventListener(\'change\', function () { root.classList.toggle(\'no-ms\', !box.checked);'
        . ' try { localStorage.setItem(\'' . MS_STORAGE_KEY . '\', box.checked ? \'on\' : \'off\'); } catch (e) { /* private mode: not remembered */ } });'
        . ' })();</script>';
}

/*
 * rounds (NEW_ROUND), teams with a round and average players per round per day since $start (Y-m-d):
 * range on the index (type_code, creation_date), cheap enough for the live tab's 30 s reload
 */
function rounds_per_day($link, string $start): array {
    return array_column(rows($link, "select /*+ MAX_EXECUTION_TIME(3000) */
               date(creation_date) as day
              ,count(1) as rounds
              ,count(distinct team_id) as teams
              ,avg(players_count) as avg_players
          from pok_roundstats_tbl
         where type_code = 'NEW_ROUND' and creation_date >= ?
         group by day", 's', array($start)), null, 'day');
}

/* ---------- trends tab (B-13) ---------- */

/* SQL of the period start for a DATE expression (both constants, never request values) */
function trend_period_sql(string $gran, string $date_expr): string {
    return str_replace('{d}', $date_expr, TREND_PERIOD_SQL[$gran]);
}

/* start (Y-m-d) of the period containing $day */
function trend_align(string $day, string $gran): string {
    if ($gran === 'week') return date('Y-m-d', strtotime($day . ' -' . ((int)date('N', strtotime($day)) - 1) . ' day'));
    if ($gran === 'month') return substr($day, 0, 8) . '01';
    return $day;
}

/* all period starts from the period of $first to the period of $today */
function trend_periods(string $first, string $today, string $gran): array {
    $step = array('day' => '+1 day', 'week' => '+1 week', 'month' => '+1 month')[$gran];
    $periods = array();
    $last = trend_align($today, $gran);
    for ($p = trend_align($first, $gran); $p <= $last; $p = date('Y-m-d', strtotime($p . ' ' . $step))) $periods[] = $p;
    return $periods;
}

/* number of days of the period starting at $p */
function trend_days(string $p, string $gran): int {
    return $gran === 'day' ? 1 : ($gran === 'week' ? 7 : (int)date('t', strtotime($p)));
}

/* tooltip text of a period: "Mon 2026-11-23", "W48 2026-11-23 - 2026-11-29", "2026-11"; "(so far)" for the current one */
function trend_period_text(string $p, string $gran, string $current): string {
    $ts = strtotime($p);
    $text = $gran === 'day' ? date('D Y-m-d', $ts)
        : ($gran === 'week' ? 'W' . date('W', $ts) . ' ' . $p . ' - ' . date('Y-m-d', strtotime($p . ' +6 day')) : date('Y-m', $ts));
    return $text . ($p === $current ? ' (so far)' : '');
}

/* x axis ticks as index => label: Mondays, month or year starts, depending on the number of periods; at most 8 */
function trend_ticks(array $periods, string $gran): array {
    $n = count($periods);
    $ticks = array();
    foreach ($periods as $i => $p) {
        $prev = $i > 0 ? $periods[$i - 1] : null;
        $new_month = $prev === null || substr($prev, 0, 7) !== substr($p, 0, 7);
        $new_year = $prev === null || substr($prev, 0, 4) !== substr($p, 0, 4);
        if ($gran === 'day' && $n <= 35) {
            if ((int)date('N', strtotime($p)) === 1) $ticks[$i] = date('m-d', strtotime($p));
        } else if (($gran === 'day' && $n <= 400) || ($gran === 'week' && $n <= 60)) {
            if ($new_month && $i > 0) $ticks[$i] = substr($p, 0, 7);
        } else if ($gran === 'month' && $n <= 13) {
            $ticks[$i] = substr($p, 0, 7);
        } else if ($gran === 'month' && $n <= 40) {
            if (in_array(substr($p, 5, 2), array('01', '04', '07', '10'), true)) $ticks[$i] = substr($p, 0, 7);
        } else if ($new_year && $i > 0) {
            $ticks[$i] = substr($p, 0, 4);
        }
    }
    while (count($ticks) > 8) {
        $keys = array_keys($ticks);
        $ticks = array_intersect_key($ticks, array_flip(array_filter($keys, fn($k) => array_search($k, $keys, true) % 2 === 0)));
    }
    return $ticks;
}

/* x axis below a chart: tick labels at the start of their period (left edge in % of the width) */
function trend_x_axis(array $periods, array $ticks): string {
    $n = count($periods);
    $html = '<div class="trend-x" aria-hidden="true">';
    $k = 0;
    foreach ($ticks as $i => $label) {
        $left = 100 * $i / $n;
        $classes = trim(($left > 88 ? 'end' : '') . (count($ticks) > 4 && $k++ % 2 === 1 ? ' odd' : ''));
        $html .= '<span' . ($classes !== '' ? ' class="' . $classes . '"' : '') . ' style="left: ' . number_format($left, 2, '.', '') . '%">' . h($label) . '</span>';
    }
    return $html . '</div>';
}

/* y axis labels: value => position from the bottom in % */
function trend_y_axis(array $labels): string {
    $html = '<div class="trend-y" aria-hidden="true">';
    foreach ($labels as $label => $bottom) {
        $html .= '<span style="bottom: ' . number_format($bottom, 2, '.', '') . '%">' . h($label) . '</span>';
    }
    return $html . '</div>';
}

/* milestone labels (MILESTONES) within the period starting at $p */
function trend_milestone(string $p, string $gran): string {
    return milestone($p, trend_days($p, $gran));
}

/*
 * Bar chart with CSS bars like "Rounds per day" (one .day per period, stacked .seg from the bottom).
 * $series: list of array('class' => css class, 'name' => legend text, 'values' => period => number).
 */
function trend_bars(string $id, string $label, array $periods, array $series, string $gran, string $current): string {
    $totals = array();
    foreach ($periods as $p) $totals[$p] = array_sum(array_map(fn($s) => (float)($s['values'][$p] ?? 0), $series));
    $max = $totals ? max($totals) : 0;
    $n = count($periods);
    $ticks = trend_ticks($periods, $gran);
    $density = $n > 200 ? ' dense' : ($n > 60 ? ' tight' : '');
    $html = '<div class="chart-box trend-box">' . trend_y_axis(array(fmt_num($max) => 100, '0' => 0))
        . '<div class="chart trend-bars' . $density . '" id="' . h($id) . '" role="img" aria-label="' . h($label . ', peak ' . fmt_num($max)) . '">';
    foreach ($periods as $i => $p) {
        $classes = array('day');
        if ($gran === 'day' && (int)date('N', strtotime($p)) >= 6) $classes[] = 'weekend';
        if (isset($ticks[$i])) $classes[] = 'tick';
        $ms = trend_milestone($p, $gran);
        if ($ms !== '') $classes[] = 'milestone';
        if ($p === $current) $classes[] = 'current';
        $parts = array();
        foreach ($series as $s) $parts[] = $s['name'] . ' ' . fmt_num((float)($s['values'][$p] ?? 0));
        $title = trend_period_text($p, $gran, $current) . ': ' . (count($series) > 1 ? fmt_num($totals[$p]) . ' (' . implode(', ', $parts) . ')' : $parts[0])
            . milestone_tip($ms);
        $html .= '<span class="' . implode(' ', $classes) . '" data-period="' . h($p) . '" data-value="' . h(fmt_num($totals[$p])) . '" title="' . h($title) . '">'
            . '<span class="col" style="height: ' . bar_width($totals[$p], $max) . '%">';
        foreach (array_reverse($series) as $s) {   // first series at the bottom
            $html .= '<span class="seg ' . h($s['class']) . '" style="height: ' . bar_width((float)($s['values'][$p] ?? 0), $totals[$p]) . '%"></span>';
        }
        $html .= '</span></span>';
    }
    return $html . '</div>' . trend_x_axis($periods, $ticks) . '</div>';
}

/*
 * Line chart as inline SVG (x: one unit per period, y: 0..100 from the top, stretched to the box), optionally with a
 * logarithmic y axis (values below 1 drawn as 1). Periods without a value interrupt the line. Every period has a
 * transparent column with all values as tooltip. $series as in trend_bars(), values may be missing (= no data).
 */
function trend_lines(string $id, string $label, array $periods, array $series, string $gran, string $current, bool $log): string {
    $n = count($periods);
    $max = 0;
    foreach ($series as $s) foreach ($s['values'] as $v) $max = max($max, (float)$v);
    if ($log) {
        $top = max(1, (int)ceil(log10(max($max, 1)) - 1e-9));
        $y = fn(float $v) => 100 - 100 * log10(max($v, 1)) / $top;
        $y_labels = array();
        for ($e = $top; $e >= 0; $e--) $y_labels[fmt_num(10 ** $e)] = 100 * $e / $top;
    } else {
        $top = max($max, 1);
        $y = fn(float $v) => 100 - 100 * $v / $top;
        $y_labels = array(fmt_num($max) => 100, '0' => 0);
    }
    $f = fn(float $x) => number_format($x, 2, '.', '');
    $ticks = trend_ticks($periods, $gran);
    $svg = '<svg class="trend-svg" id="' . h($id) . '" viewBox="0 0 ' . $n . ' 100" preserveAspectRatio="none" role="img" aria-label="'
        . h($label . ', peak ' . fmt_num($max)) . '">';
    // background: weekends (day view, if the bars are still wide enough), decades of the log axis, ticks, milestones
    foreach ($periods as $i => $p) {
        if ($gran === 'day' && $n <= 200 && (int)date('N', strtotime($p)) >= 6) $svg .= '<rect class="wk" x="' . $i . '" y="0" width="1" height="100"/>';
    }
    if ($log) {
        for ($e = 1; $e < $top; $e++) $svg .= '<line class="grid" x1="0" x2="' . $n . '" y1="' . $f(100 - 100 * $e / $top) . '" y2="' . $f(100 - 100 * $e / $top) . '"/>';
    }
    foreach ($ticks as $i => $_) $svg .= '<line class="grid" x1="' . $i . '" x2="' . $i . '" y1="0" y2="100"/>';
    foreach ($periods as $i => $p) {
        if (trend_milestone($p, $gran) !== '') $svg .= '<line class="ms" x1="' . $i . '" x2="' . $i . '" y1="0" y2="100"/>';
    }
    // one polyline per run of periods with a value
    foreach ($series as $s) {
        $runs = array();
        $run = array();
        foreach ($periods as $i => $p) {
            if (!isset($s['values'][$p])) {
                if ($run) $runs[] = $run;
                $run = array();
                continue;
            }
            $run[] = array($i, $y((float)$s['values'][$p]));
        }
        if ($run) $runs[] = $run;
        foreach ($runs as $r) {
            // a single point: short horizontal stroke over its period, else from period centre to period centre
            $points = count($r) === 1 ? array(array($r[0][0] + 0.15, $r[0][1]), array($r[0][0] + 0.85, $r[0][1]))
                : array_map(fn($pt) => array($pt[0] + 0.5, $pt[1]), $r);
            $svg .= '<polyline class="line ' . h($s['class']) . '" points="'
                . implode(' ', array_map(fn($pt) => $f($pt[0]) . ',' . $f($pt[1]), $points)) . '"/>';
        }
    }
    foreach ($periods as $i => $p) {
        $parts = array();
        foreach ($series as $s) $parts[] = $s['name'] . ' ' . (isset($s['values'][$p]) ? fmt_num((float)$s['values'][$p]) : '-');
        $ms = trend_milestone($p, $gran);
        $svg .= '<rect class="hov" x="' . $i . '" y="0" width="1" height="100" data-period="' . h($p) . '"><title>'
            . h(trend_period_text($p, $gran, $current) . ': ' . implode(', ', $parts) . milestone_tip($ms)) . '</title></rect>';
    }
    // milestone lines: a wide transparent hit area on top of the hover columns, its own tooltip
    foreach ($periods as $i => $p) {
        $ms = trend_milestone($p, $gran);
        if ($ms !== '') $svg .= '<line class="ms-hit" x1="' . $i . '" x2="' . $i . '" y1="0" y2="100"><title>'
            . h(trend_period_text($p, $gran, $current) . milestone_tip($ms)) . '</title></line>';
    }
    $svg .= '</svg>';
    return '<div class="chart-box trend-box">' . trend_y_axis($y_labels) . '<div class="trend-plot">' . $svg . '</div>'
        . trend_x_axis($periods, $ticks) . '</div>';
}

/* legend line: css class => text */
function trend_legend(array $series): string {
    $html = '<p class="legend note">';
    foreach ($series as $s) $html .= '<span><span class="sw ' . h($s['class']) . '"></span>' . h($s['name']) . '</span> ';
    return $html . '</p>';
}

/* integer with thin space as thousands separator (values of the stats tables are counts) */
function fmt_num(float $v): string {
    return number_format(round($v), 0, '.', ' ');
}

/*
 * select for a per-minute stats table (creation_date = datetime in DB time): rows period => max of each column,
 * since $start_db (DB time). The day is taken in the viewer's offset. [] if the table does not exist (staging).
 */
function trend_minute_max($link, string $table, array $columns, string $gran, string $db_offset, string $tz_offset, string $start_db): array {
    $max = implode(', ', array_map(fn($c) => 'max(' . $c . ') as ' . $c, $columns));
    try {
        return array_column(rows($link, "select /*+ MAX_EXECUTION_TIME(15000) */ " . trend_period_sql($gran, 'x.d') . " as period, " . $max . "
              from (select date(convert_tz(creation_date, ?, ?)) as d, " . implode(', ', $columns) . "
                      from " . $table . "
                     where creation_date >= ?) as x
             group by period", 'sss', array($db_offset, $tz_offset, $start_db)), null, 'period');
    } catch (mysqli_sql_exception $e) {
        if ($e->getCode() !== 1146) throw $e; // 1146: table does not exist
        return array();
    }
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
$db_offset = '+00:00';
$data = array();
$error = null;
$open_feedback_cnt = 0;

if ($auth_user !== null) try {   // not logged in: login form only, no query
    $link = db_init();
    $db_offset = set_db_time_zone($link, $time_zone_offset);
    $open_feedback_cnt = rows($link, "select /*+ MAX_EXECUTION_TIME(2000) */ count(1) as cnt
                                        from pok_feedback_tbl where done_date is null")[0]['cnt'];

    if ($tab === 'live') {
        $data['now'] = rows($link, "select now() as now_time, curdate() as today")[0];

        // active tables: teams with a new round (= a finished round) within ACTIVE_ROUND_MINUTES (range on the index
        // type_code_creation_date), their clients active within the same time (index team_id);
        // the team id is only used for joins inside SQL and never selected
        $active_rounds = "select team_id, max(creation_date) as last_round
                            from pok_roundstats_tbl
                           where type_code = 'NEW_ROUND' and creation_date > now() - interval " . ACTIVE_ROUND_MINUTES . " minute
                           group by team_id";
        $data['tables'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                   t.name, t.cardset_flags, t.needs_setup, t.creation_date >= curdate() as created_today, ar.last_round
                  ,ifnull(a.clients, 0) as clients, ifnull(a.players, 0) as players
                  ,ifnull(a.observers, 0) as observers, ifnull(a.known_users, 0) as known_users
                  ,(select count(1) from pok_players_tbl p
                     where p.team_id = t.id and p.player_type = 'PLAYER') as team_players
                  ,(select count(1) from pok_players_tbl p
                     where p.team_id = t.id and p.player_type = 'PLAYER' and p.card_key is not null) as cards_laid
                  ,ifnull(r.rounds_today, 0) as rounds_today
                  ,case when t.creation_date >= curdate() then t.creation_date else r.first_round end as active_since
              from (" . $active_rounds . ") as ar
              join pok_teams_tbl t on t.id = ar.team_id
              left join (select p.team_id
                          ,count(1) as clients
                          ,sum(p.player_type = 'PLAYER') as players
                          ,sum(p.player_type <> 'PLAYER' and p.player_type <> 'REMOVED') as observers
                          ,sum(u.creation_date < curdate()) as known_users
                      from (" . $active_rounds . ") as ar2
                      join pok_players_tbl p on p.team_id = ar2.team_id
                      left join pok_user_tbl u on u.id = p.id
                     where p.last_callback_time > now() - interval " . ACTIVE_ROUND_MINUTES . " minute
                     group by p.team_id) as a on a.team_id = t.id
              left join (select team_id, count(1) as rounds_today, min(creation_date) as first_round
                           from pok_roundstats_tbl
                          where type_code = 'NEW_ROUND' and creation_date >= curdate()
                          group by team_id) as r on r.team_id = t.id
             order by ar.last_round desc, t.name");

        $data['rounds'] = rows($link, "select /*+ MAX_EXECUTION_TIME(3000) */
                   ifnull(sum(creation_date > now() - interval 1 hour), 0) as last_hour
                  ,count(1) as today
              from pok_roundstats_tbl
             where type_code = 'NEW_ROUND' and creation_date >= curdate()")[0];

        $data['day_start'] = date('Y-m-d', strtotime($data['now']['today'] . ' -' . (LIVE_DAYS - 1) . ' day'));
        $data['round_days'] = rounds_per_day($link, $data['day_start']);

        // course of the day: pok_active_user_stats is filled every minute by the event job (db_jobs_pok.sql);
        // max of "active within the last 10 minutes" per 15-minute slot
        // the table and its job exist only where the event jobs are installed (live, not staging): no chart then
        // creation_date is a datetime in DB time ($db_offset): the start of today is converted in PHP (range on the
        // column stays indexable), the slot is computed from the time converted to the viewer's offset
        $today_db = (new DateTime($data['now']['today'] . ' 00:00:00', new DateTimeZone($time_zone_offset)))->setTimezone(new DateTimeZone($db_offset))->format('Y-m-d H:i:s');
        try {
            $data['history'] = rows($link, "select /*+ MAX_EXECUTION_TIME(3000) */
                       hour(convert_tz(creation_date, ?, ?)) * 4 + floor(minute(convert_tz(creation_date, ?, ?)) / 15) as slot
                      ,max(last_ten_minutes) as clients
                  from pok_active_user_stats
                 where creation_date >= ?
                 group by slot
                 order by slot", 'sssss', array($db_offset, $time_zone_offset, $db_offset, $time_zone_offset, $today_db));
        } catch (mysqli_sql_exception $e) {
            if ($e->getCode() !== 1146) throw $e; // 1146: table does not exist
            $data['history'] = array();
        }


    } else if ($tab === 'usage') {
        // all dates from the DB clock (session time zone = viewer's offset), which the timestamp columns use as well
        $data['today'] = rows($link, "select curdate() as today")[0]['today'];
        $data['this_week'] = date('Y-m-d', strtotime('monday this week', strtotime($data['today'])));
        $data['week_start'] = date('Y-m-d', strtotime($data['this_week'] . ' -' . (USAGE_WEEKS - 1) . ' week'));
        $data['day_start'] = date('Y-m-d', strtotime($data['today'] . ' -' . (USAGE_DAYS - 1) . ' day'));

        // user ids per week from the rounds (pok_roundstat_details_tbl: everyone active in the team when a round
        // was started, removed players excluded). "returning" = user id first seen (pok_user_tbl.creation_date,
        // written on joining a board or storing a setting, until 2026-11 on the first board load) before that week:
        // a primary key lookup per user and week instead of a scan over the whole round history.
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
        $data['round_days'] = rounds_per_day($link, $data['day_start']);

    } else if ($tab === 'trends') {
        // range start in the viewer's time zone (DB clock in the session offset), aligned to the start of its period;
        // "All": every period from the first one with data (per chart)
        $data['today'] = rows($link, "select curdate() as today")[0]['today'];
        $data['current'] = trend_align($data['today'], $trend_gran);
        $start_rel = TREND_RANGES[$trend_range]['start'];
        $data['start'] = $start_rel === null ? null : trend_align(date('Y-m-d', strtotime($data['today'] . ' ' . $start_rel)), $trend_gran);
        $start = $data['start'] ?? TREND_ALL_START;
        // per-minute tables hold DB time ($db_offset): the start converted in PHP keeps the range on the column indexable
        $start_db = (new DateTime($start . ' 00:00:00', new DateTimeZone($time_zone_offset)))->setTimezone(new DateTimeZone($db_offset))->format('Y-m-d H:i:s');

        // teams per period (pok_daily_teams_stats: nightly job, one row per team (id) and day, a DATE of the DB clock):
        // distinct teams, recurring if RECURRING on at least one day of the period. Index (creation_date, id).
        try {
            $data['teams'] = array_column(rows($link, "select /*+ MAX_EXECUTION_TIME(20000) */
                       " . trend_period_sql($trend_gran, 'creation_date') . " as period
                      ,count(distinct id) as teams
                      ,count(distinct case when team_type = 'RECURRING' then id end) as recurring
                  from pok_daily_teams_stats
                 where creation_date >= ?
                 group by period", 's', array($start)), null, 'period');
        } catch (mysqli_sql_exception $e) {
            if ($e->getCode() !== 1146) throw $e; // 1146: table does not exist (staging)
            $data['teams'] = array();
        }

        // new rounds per period: range on the index (type_code, creation_date); timestamp column, so date() is the
        // viewer's day
        $data['rounds'] = array_column(rows($link, "select /*+ MAX_EXECUTION_TIME(20000) */
                   " . trend_period_sql($trend_gran, 'date(creation_date)') . " as period
                  ,count(1) as rounds
              from pok_roundstats_tbl
             where type_code = 'NEW_ROUND' and creation_date >= ?
             group by period", 's', array($start)), null, 'period');

        // per-minute snapshots: highest value per period
        $data['active_use'] = trend_minute_max($link, 'pok_active_use_stats_tbl', array('active_players', 'active_teams'),
            $trend_gran, $db_offset, $time_zone_offset, $start_db);
        $data['peaks'] = trend_minute_max($link, 'pok_active_user_stats',
            array('last_day', 'last_hour', 'last_half_hour', 'last_ten_minutes', 'last_minute'),
            $trend_gran, $db_offset, $time_zone_offset, $start_db);

        // B-160: distinct persons per period using MCP or the API with a key (hashes, pok_api_users_day_tbl; a DATE of
        // the DB clock like pok_daily_teams_stats), range on the primary key (day, ...)
        try {
            $data['ai'] = array();
            foreach (rows($link, "select /*+ MAX_EXECUTION_TIME(10000) */
                       " . trend_period_sql($trend_gran, 'day') . " as period
                      ,channel
                      ,count(distinct user_hash) as persons
                  from pok_api_users_day_tbl
                 where day >= ? and channel in ('mcp', 'rest')
                 group by period, channel", 's', array($start)) as $r) {
                $data['ai'][$r['period']][$r['channel']] = (int)$r['persons'];
            }
        } catch (mysqli_sql_exception $e) {
            if ($e->getCode() !== 1146) throw $e; // 1146: table does not exist (DDL B-160 not applied)
            $data['ai'] = array();
        }

    } else if ($tab === 'ai') {
        // B-160: the day columns hold dates of the DB clock (usage_record(): curdate() of the app connection), so the
        // ranges start from the DB's today, not the viewer's; ranges on the first column of the primary keys
        $data['today'] = (new DateTime('now', new DateTimeZone($db_offset)))->format('Y-m-d');
        $d7 = date('Y-m-d', strtotime($data['today'] . ' -6 day'));
        $d28 = date('Y-m-d', strtotime($data['today'] . ' -' . (AI_DAYS - 1) . ' day'));
        $data['ai_missing'] = false;
        try {
            $data['ai_people'] = array_column(rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                       channel
                      ,count(distinct case when day >= ? then user_hash end) as persons_1
                      ,count(distinct case when day >= ? then user_hash end) as persons_7
                      ,count(distinct user_hash) as persons_28
                      ,count(distinct case when day >= ? then team_hash end) as teams_1
                      ,count(distinct case when day >= ? then team_hash end) as teams_7
                      ,count(distinct team_hash) as teams_28
                  from pok_api_users_day_tbl
                 where day >= ?
                 group by channel", 'sssss', array($data['today'], $d7, $data['today'], $d7, $d28)), null, 'channel');
            $data['ai_calls'] = array_column(rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                       channel
                      ,sum(case when status = 'ok' and day >= ? then calls else 0 end) as calls_1
                      ,sum(case when status = 'ok' and day >= ? then calls else 0 end) as calls_7
                      ,sum(case when status = 'ok' then calls else 0 end) as calls_28
                      ,sum(case when status <> 'ok' and day >= ? then calls else 0 end) as errors_1
                      ,sum(case when status <> 'ok' and day >= ? then calls else 0 end) as errors_7
                      ,sum(case when status <> 'ok' then calls else 0 end) as errors_28
                  from pok_api_usage_stats_tbl
                 where day >= ?
                 group by channel", 'sssss', array($data['today'], $d7, $data['today'], $d7, $d28)), null, 'channel');
            $data['ai_ops'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                       channel, op, sum(calls) as calls
                  from pok_api_usage_stats_tbl
                 where day >= ? and status = 'ok'
                 group by channel, op
                 order by calls desc, op", 's', array($d28));
            $data['ai_errors'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                       channel, op, status, sum(calls) as calls
                  from pok_api_usage_stats_tbl
                 where day >= ? and status <> 'ok'
                 group by channel, op, status
                 order by calls desc, channel, op, status
                 limit 50", 's', array($d28));
        } catch (mysqli_sql_exception $e) {
            if ($e->getCode() !== 1146) throw $e; // 1146: table does not exist (DDL B-160 not applied)
            $data['ai_missing'] = true;
        }
        // seats used through MCP right now: same window as the AI symbol on the board (VIA_AI_SQL, AWAY_AFTER_SEC);
        // the ended marker of end_session (before 1980) is older anyway. No index on mcp_seen_time: a scan of the
        // players table, bounded by the execution time.
        // keys and teams: small scans as well; no names or hints of keys
        try {
            $data['ai_now'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                       count(1) as seats, count(distinct team_id) as teams
                  from pok_players_tbl
                 where mcp_seen_time >= current_timestamp - interval ? second", 'i', array(AWAY_AFTER_SEC))[0];
            $data['ai_keys'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */
                       count(1) as total
                      ,ifnull(sum(last_used_date >= current_timestamp - interval 7 day), 0) as used_7
                      ,ifnull(sum(creation_date >= current_timestamp - interval 7 day), 0) as new_7
                      ,ifnull(sum(creation_date >= current_timestamp - interval " . AI_DAYS . " day), 0) as new_28
                  from pok_api_keys_tbl")[0];
            $data['ai_off'] = rows($link, "select /*+ MAX_EXECUTION_TIME(5000) */ count(1) as cnt
                                             from pok_teams_tbl where allow_ai = 0")[0]['cnt'];
        } catch (mysqli_sql_exception $e) {
            if (!in_array($e->getCode(), array(1054, 1146), true)) throw $e; // DDL of B-150/B-151 missing (staging)
            $data['ai_now'] = null;
        }

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
        $data['db'] = rows($link, "select version() as version, @@global.time_zone as time_zone, @@system_time_zone as system_time_zone
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
    <link rel="icon" href="src/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" href="src/favicon-32.png" sizes="32x32">
<?php if ($tab === 'live' && $auth_user !== null) { ?>
    <meta http-equiv="refresh" content="<?= LIVE_RELOAD_SEC ?>" />
<?php } ?>
    <script>
        /* times in the viewer's time zone: store the browser's zone in a cookie for PHP; on a data page reload once
           if it was missing or changed (only if the cookie could be set, so no reload loop without cookies) */
        (function () {
            try {
                var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (!tz) return;
                var read = function () {
                    var m = document.cookie.match(/(?:^|; )<?= TZ_COOKIE ?>=([^;]*)/);
                    return m ? decodeURIComponent(m[1]) : null;
                };
                if (read() === tz) return;
                document.cookie = '<?= TZ_COOKIE ?>=' + encodeURIComponent(tz) + '; path=' + location.pathname
                    + '; max-age=31536000; samesite=lax' + (location.protocol === 'https:' ? '; secure' : '');
                if (read() === tz && <?= $auth_user !== null ? 'true' : 'false' ?>) location.reload();
            } catch (e) { /* no Intl or no cookies: times stay in UTC */ }
        })();
        /* milestone lines switched off by this viewer (switch "Milestones"): before the first paint */
        try { if (localStorage.getItem('<?= MS_STORAGE_KEY ?>') === 'off') document.documentElement.classList.add('no-ms'); } catch (e) { /* no storage */ }
    </script>
    <title><?= $auth_user === null ? 'Login' : h(STATS_TABS[$tab]) ?> - Agile Poker stats</title>
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

        /* login (B-63) */
        .logout { margin-left: auto; align-self: center; display: flex; align-items: center; gap: 0.75em; white-space: nowrap; }
        .login { display: grid; gap: 0.35rem; max-width: 22rem; margin: 2rem auto; padding: 0 1.25rem 1.25rem;
                 background: var(--bg-3); border: 1px solid var(--line); border-top: 3px solid var(--accent); border-radius: var(--radius-l); }
        .login label { color: var(--muted); font-size: var(--fs-s); margin-top: 0.5rem; }
        .login input { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line-strong);
                       border-radius: var(--radius-m); padding: 0.45em 0.6em; }
        .login button { margin-top: 1rem; }
        .login .note { margin: 0.5rem 0 0; }

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
        html:not(.no-ms) tr.milestone td { background: var(--warn-bg); }
        html:not(.no-ms) tr.milestone td:first-child { box-shadow: inset 3px 0 0 var(--warn); }
        .ms-toggle { display: inline-flex; align-items: center; gap: 0.35em; color: var(--muted); font-size: var(--fs-s); cursor: pointer; }
        .ms-toggle[hidden] { display: none; }
        .ms-toggle input { accent-color: var(--warn); margin: 0; }
        p.ms-bar { margin: 0 0 0.75rem; }
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
        .chart-x > span { width: 0; display: flex; justify-content: center; white-space: nowrap; }

        /* rounds per day: one column per day (.day > .col), gridline before each Monday, value label on every day (today and the peak highlighted) */
        .chart.days { gap: 3px; background: none; }
        .chart .day.monday { box-shadow: -2px 0 0 var(--line); }
        .chart .day { position: relative; flex: 1 1 0; display: flex; align-items: flex-end; height: 100%; }
        .chart .day.weekend .col { background: var(--line-strong); }
        .chart .day.today .col { background: var(--link); }
        html:not(.no-ms) .chart .day.milestone { box-shadow: -2px 0 0 var(--warn); }
        .chart .day:hover .col { background: var(--link); }
        .chart .col-val { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); padding-bottom: 0.15em;
                          color: var(--text); font-size: var(--fs-xs); line-height: 1; white-space: nowrap; }
        .chart .day .col { position: relative; }
        .chart .col-val.minor { color: var(--muted); }
        .chart-x.days { gap: 3px; }
        .chart-x.days .wd { margin-right: 0.5ch; }
        @media (max-width: 900px) { .chart .col-val.minor { display: none; } }  /* 3-digit values would collide */
        .chart-x.days > span { flex: 1 1 0; min-width: 0; width: auto; justify-content: flex-start; overflow: visible; }
        .chart-x.days > span:last-child { justify-content: flex-end; }

        /* trends (B-13): CSS bars like "Rounds per day" (stacked .seg) and inline SVG lines; y labels and x ticks
           positioned in % of the plot, thin bars without gaps for long ranges */
        .trend-box { margin-bottom: 0.4rem; }
        .trend-y { position: relative; height: 10rem; min-width: 3.2em; color: var(--muted); font-size: var(--fs-xs); line-height: 1; }
        .trend-y > span { position: absolute; right: 0; transform: translateY(50%); white-space: nowrap; }
        .chart.trend-bars { gap: 2px; background: none; }
        .chart.trend-bars.tight { gap: 1px; }
        .chart.trend-bars.dense { gap: 0; }
        .trend-bars .day { position: relative; flex: 1 1 0; min-width: 0; display: flex; align-items: flex-end; height: 100%; }
        .trend-bars .col { display: flex; flex-direction: column; width: 100%; min-width: 0; background: none; border-radius: 1px 1px 0 0; overflow: hidden; }
        .trend-bars .seg { display: block; width: 100%; flex: none; }
        .trend-bars .seg.rec, .trend-bars .seg.rounds, .legend .sw.rec { background: var(--accent); }
        .trend-bars .seg.exp, .legend .sw.exp { background: var(--link); }
        .trend-bars .day.weekend .col { opacity: 0.45; }
        .trend-bars .day.tick { box-shadow: -1px 0 0 var(--line); }
        html:not(.no-ms) .trend-bars .day.milestone { box-shadow: -2px 0 0 var(--warn); }
        .trend-bars .day:hover .col { opacity: 1; outline: 1px solid var(--text); }
        .trend-bars .day.current .col { opacity: 0.7; }
        .trend-plot { position: relative; height: 10rem; border-top: 1px dashed var(--line); border-bottom: 1px solid var(--line-strong); }
        .trend-svg { display: block; width: 100%; height: 100%; overflow: visible; }
        .trend-svg .wk { fill: var(--bg-4); opacity: 0.6; }
        .trend-svg .grid { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
        .trend-svg .ms { stroke: var(--warn); stroke-width: 2; vector-effect: non-scaling-stroke; }
        .trend-svg .ms-hit { stroke: transparent; stroke-width: 12; vector-effect: non-scaling-stroke; pointer-events: stroke; }
        html.no-ms .trend-svg .ms, html.no-ms .trend-svg .ms-hit { display: none; }
        .trend-svg .line { fill: none; stroke-width: 1.5; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
        .trend-svg .hov { fill: transparent; }
        .trend-svg .hov:hover { fill: var(--row-hover); }
        .trend-svg .s0, .legend .sw.s0 { stroke: var(--accent); background: var(--accent); }
        .trend-svg .s1, .legend .sw.s1 { stroke: var(--link); background: var(--link); }
        .trend-svg .s2, .legend .sw.s2 { stroke: var(--ok); background: var(--ok); }
        .trend-svg .s3, .legend .sw.s3 { stroke: var(--warn); background: var(--warn); }
        .trend-svg .s4, .legend .sw.s4 { stroke: var(--danger); background: var(--danger); }
        .legend .sw { display: inline-block; width: 0.8em; height: 0.8em; margin-right: 0.4em; vertical-align: -0.05em; border-radius: 1px; }
        .legend { flex-wrap: wrap; }
        .trend-x { grid-column: 2; position: relative; height: 1.4em; margin-top: 0.3em; color: var(--muted); font-size: var(--fs-xs); }
        .trend-x > span { position: absolute; top: 0; padding-left: 0.2em; white-space: nowrap; border-left: 1px solid var(--line-strong); }
        .trend-x > span.end { transform: translateX(-100%); padding: 0 0.2em 0 0; border-left: 0; border-right: 1px solid var(--line-strong); }
        .trend-controls { margin: 0 0 0.75rem; }
        .trend-controls .seg-ctrl { flex-wrap: wrap; }

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
            .chart-x > span:nth-child(even) { visibility: hidden; }
            .chart-x.days > span:nth-child(even) { visibility: visible; }
            .chart.days, .chart-x.days { gap: 1px; }
            /* rounds per day too narrow: dates without weekday, no "today"
               label (the bar is highlighted) */
            .chart-x.days .wd { display: none; }
            .chart-x.days > span:last-child { visibility: hidden; }
            .trend-x > span.odd { visibility: hidden; }   /* narrow: every second tick label */
            .rm { grid-template-columns: 5em 1fr 1fr;
                  grid-template-areas: "order type status" "title title title" "desc desc desc" "visible visible save" "votes votes votes"; }
            dl.facts { grid-template-columns: 1fr; gap: 0 0; }
            dl.facts dd { margin-bottom: 0.5em; }
        }
    </style>
</head>
<body class="stats stats-<?= $auth_user === null ? 'login' : h($tab) ?>">
<header class="stats-header">
    <h1>poker stats</h1>
<?php if ($auth_user !== null) { ?>
    <nav aria-label="Sections">
        <ul class="tabs">
<?php foreach (STATS_TABS as $key => $label) { ?>
            <li><a href="stats.php?tab=<?= h($key) ?>"<?= $key === $tab ? ' aria-current="page"' : '' ?>><?= h($label) ?><?php
                if ($key === 'ideas' && $open_feedback_cnt > 0) { ?><span class="badge" title="open messages"><?= h($open_feedback_cnt) ?></span><?php } ?></a></li>
<?php } ?>
        </ul>
    </nav>
    <form class="logout" method="post" action="<?= h($self) ?>">
        <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
        <span class="muted"><?= h($auth_user) ?></span>
        <button type="submit" name="action" value="logout">Log out</button>
    </form>
<?php } ?>
</header>
<main>
<?php if ($auth_user === null) { ?>
    <form class="login" method="post" action="<?= h($self) ?>">
        <h2>Login</h2>
<?php if ($login_error !== null) { ?>
        <p class="error" role="alert"><?= h($login_error) ?></p>
<?php } ?>
        <label for="login_user">user</label>
        <input id="login_user" name="user" autocomplete="username" required autofocus>
        <label for="login_password">password</label>
        <input id="login_password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit" name="action" value="login">Log in</button>
        <p class="note">Stays logged in for <?= AUTH_DAYS ?> days in this browser.</p>
    </form>
<?php } else if ($error !== null) { ?>
    <p class="error">Query failed: <?= h($error) ?></p>
<?php } else if ($tab === 'live') {
    echo '<p class="ms-bar">' . milestone_toggle() . '</p>';
    $tables = $data['tables'];
    $clients = array_sum(array_column($tables, 'clients'));
    $players = array_sum(array_column($tables, 'players'));
    $observers = array_sum(array_column($tables, 'observers'));
?>
    <section class="live" aria-labelledby="live_h">
        <h2 id="live_h">Right now</h2>
        <p class="note statusline"><span><span class="pulse" aria-hidden="true"></span><strong>live</strong> as of <?= h(hm($data['now']['now_time'])) ?> <span class="muted"><?= h($time_zone) ?></span>, reloads every <?= LIVE_RELOAD_SEC ?> s</span>
            <span>active table = started a new round (finished one) within the last <?= ACTIVE_ROUND_MINUTES ?> minutes; clients = its players and observers whose board loaded data within the same <?= ACTIVE_ROUND_MINUTES ?> minutes (may include some who already left)</span></p>
        <dl class="kpis">
            <div class="kpi"><dt>active tables</dt><dd id="kpi_teams"><?= h(count($tables)) ?></dd></div>
            <div class="kpi"><dt>active clients</dt><dd id="kpi_clients"><?= h($clients) ?> <small><?= h($players) ?> players, <?= h($observers) ?> observers</small></dd></div>
            <div class="kpi"><dt>rounds last hour</dt><dd id="kpi_rounds_hour"><?= h($data['rounds']['last_hour']) ?></dd></div>
            <div class="kpi"><dt>rounds today</dt><dd id="kpi_rounds_today"><?= h($data['rounds']['today']) ?></dd></div>
        </dl>

<?php
    $max_rounds = $data['round_days'] ? max(array_column($data['round_days'], 'rounds')) : 0;
?>
        <h2>Rounds per day</h2>
        <p class="note">New rounds per day (pok_roundstats_tbl, NEW_ROUND), last <?= LIVE_DAYS ?> days; weekends dimmed. Teams and &#x2300; players per round in the tooltip.</p>
        <div class="chart-box">
        <div class="chart-y" aria-hidden="true"><span><?= h($max_rounds) ?></span><span>0</span></div>
        <div class="chart days" role="img" aria-label="Rounds per day, last <?= LIVE_DAYS ?> days, peak <?= h($max_rounds) ?>, today <?= h($data['round_days'][$data['now']['today']]['rounds'] ?? 0) ?>">
<?php
    $peak_shown = false;
    for ($i = LIVE_DAYS - 1; $i >= 0; $i--) {
        $day = date('Y-m-d', strtotime($data['now']['today'] . ' -' . $i . ' day'));
        $r = $data['round_days'][$day] ?? array('rounds' => 0, 'teams' => 0, 'avg_players' => null);
        $label = milestone($day);
        $classes = array('day');
        $weekday = (int)date('N', strtotime($day));
        if ($weekday === 1) $classes[] = 'monday';
        if ($weekday >= 6) $classes[] = 'weekend';
        if ($label !== '') $classes[] = 'milestone';
        if ($i === 0) $classes[] = 'today';
        // value label above the column for today and the (first) peak day
        $show_value = $i === 0 || (!$peak_shown && $max_rounds > 0 && $r['rounds'] == $max_rounds);
        if ($i !== 0 && $show_value) $peak_shown = true;
        $title = date('D Y-m-d', strtotime($day)) . ($i === 0 ? ' (so far)' : '') . ': ' . $r['rounds'] . ' rounds, ' . $r['teams'] . ' teams'
            . ($r['avg_players'] === null ? '' : ', ' . number_format((float)$r['avg_players'], 1, '.', '') . ' players per round')
            . milestone_tip($label);
?>
            <span class="<?= h(implode(' ', $classes)) ?>" data-day="<?= h($day) ?>" data-rounds="<?= h($r['rounds']) ?>" title="<?= h($title) ?>"><span class="col" style="height: <?= bar_width($r['rounds'], $max_rounds) ?>%"><?php if ($r['rounds'] > 0) { ?><span class="col-val<?= $show_value ? '' : ' minor' ?>"><?= h($r['rounds']) ?></span><?php } ?></span></span>
<?php } ?>
        </div>
        <div class="chart-x days" aria-hidden="true"><?php for ($i = LIVE_DAYS - 1; $i >= 0; $i--) {
            $day = date('Y-m-d', strtotime($data['now']['today'] . ' -' . $i . ' day'));
            ?><span><?= $i === 0 ? 'today' : ((int)date('N', strtotime($day)) === 1 ? '<span class="wd">Mon </span>' . h(date('m-d', strtotime($day))) : '') ?></span><?php } ?></div>
        </div>

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
                <th title="first round today (or creation of a team created today); &quot;no round yet&quot;: team from an earlier day without a round today">active since</th>
                <th title="last new round (within the last <?= ACTIVE_ROUND_MINUTES ?> minutes)">last round</th><th>cards</th>
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
                <td class="nowrap"><?= $row['active_since'] === null ? '<span class="muted">no round yet</span>' : h(hm($row['active_since'])) ?></td>
                <td class="nowrap last-round"><?= h(hm($row['last_round'])) ?></td>
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
    echo '<p class="ms-bar">' . milestone_toggle() . '</p>';
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
            Returning = the user id was first seen (pok_user_tbl: joined a board or stored a setting) before that week; new = first seen in that week.
            Teams, rounds and active use over longer ranges: tab Trends.</p>
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
                <td class="nowrap"<?= $label !== '' ? ' title="' . h($w['week_start'] . milestone_tip($label)) . '"' : '' ?>><?= h($w['week_start']) ?> <span class="muted">W<?= h(date('W', strtotime($w['week_start']))) ?></span><?= $w['week_start'] === $this_week ? ' <span class="muted">(so far)</span>' : '' ?></td>
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
            <thead><tr><th>day</th><th class="num">rounds</th><th class="num" title="teams that started at least one round">teams</th>
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
                <td class="nowrap"<?= $label !== '' ? ' title="' . h($day . milestone_tip($label)) . '"' : '' ?>><?= h(date('D Y-m-d', strtotime($day))) ?></td>
                <td class="num"><?= h($data['round_days'][$day]['rounds'] ?? 0) ?></td>
                <td class="num"><?= h($data['round_days'][$day]['teams'] ?? 0) ?></td>
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

<?php } else if ($tab === 'trends') {
    $gran = $trend_gran;
    $current = $data['current'];
    /* periods of a chart: the selected range, for "All" from the first period with data of this chart; [] = no data */
    $periods_of = function (array $rows) use ($data, $gran) {
        if (!$rows) return array();
        return trend_periods($data['start'] ?? min(array_keys($rows)), $data['today'], $gran);
    };
    $per = array('day' => 'day', 'week' => 'week', 'month' => 'month')[$gran];
    $range_link = fn(string $r) => 'stats.php?tab=trends&range=' . $r . ($trend_gran_param !== null ? '&gran=' . $trend_gran_param : '');
    $gran_link = fn(string $g) => 'stats.php?tab=trends&range=' . $trend_range . '&gran=' . $g;
    $no_data = '<p class="muted no-data">No data.</p>';
?>
    <section class="trends" aria-labelledby="trends_h">
        <h2 id="trends_h">Trends</h2>
        <p class="filters trend-controls">
            <?= milestone_toggle() ?>
            <span class="muted">range</span>
            <span class="seg-ctrl" id="trend_range"><?php foreach (TREND_RANGES as $key => $r) { ?><a href="<?= h($range_link($key)) ?>"<?= $key === $trend_range ? ' class="active" aria-current="true"' : '' ?>><?= h($r['label']) ?></a><?php } ?></span>
            <span class="muted">per</span>
            <span class="seg-ctrl" id="trend_gran"><?php foreach (TREND_GRANS as $key => $label) { ?><a href="<?= h($gran_link($key)) ?>"<?= $key === $gran ? ' class="active" aria-current="true"' : '' ?>><?= h($label) ?></a><?php } ?></span>
        </p>
        <p class="note">Since <?= h($data['start'] ?? 'the first data') ?>, one bar/point per <?= h(array('day' => 'day', 'week' => 'ISO week (from Monday)', 'month' => 'calendar month')[$gran]) ?>; the current <?= h($per) ?> is counted so far.
            Times in <?= h($time_zone) ?>. Yellow lines: rollouts (hover for the name, switch them off with Milestones). Hover a bar or point for its values.</p>

        <h3>Daily teams</h3>
<?php
    $periods = $periods_of($data['teams']);
    if (!$periods) { echo $no_data; } else {
        $recurring = array_map(fn($r) => (int)$r['recurring'], $data['teams']);
        $exploring = array_map(fn($r) => (int)$r['teams'] - (int)$r['recurring'], $data['teams']);
        $series = array(
            array('class' => 'rec', 'name' => 'recurring', 'values' => $recurring),
            array('class' => 'exp', 'name' => 'exploring', 'values' => $exploring),
        );
        echo trend_legend($series);
        echo trend_bars('trend_teams', 'Teams per ' . $per, $periods, $series, $gran, $current);
    } ?>
        <p class="note">Teams with an active player that day (pok_daily_teams_stats, nightly job; recurring = more than 2 active players that day, exploring = at most 2 and created that day).
            <?= $gran === 'day' ? 'Per day: the teams of that day.' : 'Per ' . h($per) . ': distinct teams in the ' . h($per) . ' (not the sum of the days); a team counts as recurring if it was recurring on at least one day.' ?>
            Days of the DB clock.</p>

        <h3>New rounds</h3>
<?php
    $periods = $periods_of($data['rounds']);
    if (!$periods) { echo $no_data; } else {
        echo trend_bars('trend_rounds', 'New rounds per ' . $per, $periods,
            array(array('class' => 'rounds', 'name' => 'rounds', 'values' => array_map(fn($r) => (int)$r['rounds'], $data['rounds']))), $gran, $current);
    } ?>
        <p class="note">New rounds (pok_roundstats_tbl, NEW_ROUND), sum per <?= h($per) ?>, weekends included<?= $gran === 'day' ? ' (dimmed)' : '' ?>.</p>

        <h3>Active use</h3>
<?php
    $periods = $periods_of($data['active_use']);
    if (!$periods) { ?>
        <p class="muted no-data">No data (pok_active_use_stats_tbl is filled by the event job pok_active_use_evt, see db_jobs_pok.sql; it is disabled on live).</p>
<?php } else {
        $series = array(
            array('class' => 's0', 'name' => 'players', 'values' => array_column($data['active_use'], 'active_players', 'period')),
            array('class' => 's1', 'name' => 'teams', 'values' => array_column($data['active_use'], 'active_teams', 'period')),
        );
        echo trend_legend($series);
        echo trend_lines('trend_active_use', 'Active players and teams, highest value per ' . $per, $periods, $series, $gran, $current, false);
    } ?>
        <p class="note">Players and teams active within 15 minutes, taken every minute (pok_active_use_stats_tbl); highest value per <?= h($per) ?>.</p>

        <h3>Peak usage</h3>
<?php
    $periods = $periods_of($data['peaks']);
    if (!$periods) { ?>
        <p class="muted no-data">No data (pok_active_user_stats is filled by the event job pok_active_users_evt, see db_jobs_pok.sql).</p>
<?php } else {
        $series = array();
        foreach (array('last_day' => 'day', 'last_hour' => 'hour', 'last_half_hour' => '30 min', 'last_ten_minutes' => '10 min', 'last_minute' => '1 min') as $col => $name) {
            $series[] = array('class' => 's' . count($series), 'name' => $name, 'values' => array_column($data['peaks'], $col, 'period'));
        }
        echo trend_legend($series);
        echo trend_lines('trend_peaks', 'Clients active within a day, hour, 30, 10 and 1 minutes, highest value per ' . $per . ', logarithmic', $periods, $series, $gran, $current, true);
    } ?>
        <p class="note">Clients active within the last day / hour / 30 / 10 / 1 minutes, taken every minute (pok_active_user_stats); highest value per <?= h($per) ?>. Logarithmic axis.</p>

        <h3>AI &amp; API</h3>
<?php
    $periods = $periods_of($data['ai']);
    if (!$periods) { ?>
        <p class="muted no-data">No data yet (counted since the rollout of B-160; without its DDL nothing is counted).</p>
<?php } else {
        // a line from the first period with data on (no line before the counting started), missing periods = 0
        $first = min(array_keys($data['ai']));
        $series = array();
        foreach (array('mcp' => 'MCP persons', 'rest' => 'API persons') as $channel => $name) {
            $values = array();
            foreach ($periods as $p) if ($p >= $first) $values[$p] = $data['ai'][$p][$channel] ?? 0;
            $series[] = array('class' => 's' . count($series), 'name' => $name, 'values' => $values);
        }
        echo trend_legend($series);
        echo trend_lines('trend_ai', 'Distinct persons using MCP and the API per ' . $per, $periods, $series, $gran, $current, false);
    } ?>
        <p class="note">Distinct persons per <?= h($per) ?> with at least one successful call (pok_api_users_day_tbl, only hashes): MCP = tool calls of an AI assistant, API = /api/v1 with an API key (without the browser mode of the board). Days of the DB clock. Details: tab AI &amp; API.</p>
    </section>

<?php } else if ($tab === 'ai') {
    $people = $data['ai_people'] ?? array();
    $calls = $data['ai_calls'] ?? array();
    $metric_rows = array(
        array('mcp', 'persons', 'MCP persons', 'seats (UIDs or keys) that made an MCP tool call'),
        array('mcp', 'teams', 'MCP teams', 'teams of these seats'),
        array('mcp', 'calls', 'MCP calls', 'successful tool calls (wait_for_change once per call)'),
        array('mcp', 'errors', 'MCP failed calls', 'tool calls of a known tool answered with an error'),
        array('rest', 'persons', 'API persons', 'persons calling /api/v1 with an API key'),
        array('rest', 'teams', 'API teams', 'teams of these persons'),
        array('rest', 'calls', 'API calls', 'successful calls with a key, plus team create/join without auth'),
        array('rest', 'errors', 'API failed calls', 'calls of a known operation answered with an error, incl. wrong or missing auth'),
        array('web', 'persons', 'browser-mode persons', '/api/v1 with X-Poker-User (the board\'s key dialog, scripts with a UID)'),
        array('web', 'calls', 'browser-mode calls', ''),
        array('web', 'errors', 'browser-mode failed calls', ''),
    );
    $ops = array('mcp' => array(), 'rest' => array());
    foreach ($data['ai_ops'] ?? array() as $r) $ops[$r['channel'] === 'mcp' ? 'mcp' : 'rest'][] = $r;
?>
    <section class="ai" aria-labelledby="ai_h">
        <h2 id="ai_h">AI assistants (MCP) and public API</h2>
        <p class="note">Counted per call since B-160 (pok_api_usage_stats_tbl, pok_api_users_day_tbl). Persons and teams are stored only as hashes, never their ids.
            Days of the DB clock (today = <?= h($data['today']) ?>).</p>
<?php if ($data['ai_now'] !== null) { ?>
        <h3>Right now</h3>
        <dl class="kpis">
            <div class="kpi"><dt>MCP seats active</dt><dd id="ai_now_seats"><?= h($data['ai_now']['seats']) ?> <small>tool call within <?= AWAY_AFTER_SEC ?> s (AI symbol on the board)</small></dd></div>
            <div class="kpi"><dt>teams with MCP seats</dt><dd id="ai_now_teams"><?= h($data['ai_now']['teams']) ?></dd></div>
        </dl>
<?php } ?>

        <h3>Persons, teams and calls</h3>
<?php if ($data['ai_missing']) { ?>
        <p class="muted no-data">No data yet (DDL B-160 not applied).</p>
<?php } else { ?>
        <div class="table-wrap">
        <table class="ai-usage">
            <thead><tr><th>metric</th><th class="num">today</th><th class="num">7 days</th><th class="num"><?= AI_DAYS ?> days</th></tr></thead>
            <tbody>
<?php foreach ($metric_rows as $m) {
        [$channel, $metric, $label, $hint] = $m;
        $src = in_array($metric, array('calls', 'errors'), true) ? ($calls[$channel] ?? array()) : ($people[$channel] ?? array());
?>
            <tr>
                <td<?= $hint !== '' ? ' title="' . h($hint) . '"' : '' ?>><?= h($label) ?></td>
<?php   foreach (array('1', '7', '28') as $range) { ?>
                <td class="num" id="ai_<?= h($channel . '_' . $metric . '_' . $range) ?>"><?= h(fmt_num((float)($src[$metric . '_' . $range] ?? 0))) ?></td>
<?php   } ?>
            </tr>
<?php } ?>
            </tbody>
        </table>
        </div>
        <p class="note">Persons and teams: distinct per range (not the sum of the days). Browser mode: /api/v1 with the board's headers, including the board's own API key dialog.</p>
<?php } ?>

<?php if ($data['ai_now'] !== null) { ?>
        <h3>API keys and settings</h3>
        <dl class="kpis">
            <div class="kpi"><dt>API keys</dt><dd id="ai_keys_total"><?= h($data['ai_keys']['total']) ?></dd></div>
            <div class="kpi"><dt>keys used in 7 days</dt><dd id="ai_keys_used_7"><?= h($data['ai_keys']['used_7']) ?></dd></div>
            <div class="kpi"><dt>keys created</dt><dd id="ai_keys_new"><?= h($data['ai_keys']['new_7']) ?> <small>in 7 days, <?= h($data['ai_keys']['new_28']) ?> in <?= AI_DAYS ?> days</small></dd></div>
            <div class="kpi"><dt>teams with AI off</dt><dd id="ai_teams_off"><?= h($data['ai_off']) ?> <small>"Allow AI assistants" switched off</small></dd></div>
        </dl>
        <p class="note">pok_api_keys_tbl (last use is updated at most once an hour) and pok_teams_tbl.allow_ai.</p>
<?php } else { ?>
        <p class="muted no-data">No data on keys and seats (DDL of B-150/B-151 not applied).</p>
<?php } ?>

<?php if (!$data['ai_missing']) {
    foreach (array('mcp' => array('Top MCP tools', 'tool[:action]', 'ai_ops_mcp'), 'rest' => array('Top API operations', 'operation id', 'ai_ops_rest')) as $channel => $t) {
        $max = $ops[$channel] ? max(array_map(fn($r) => (int)$r['calls'], $ops[$channel])) : 0;
?>
        <h3><?= h($t[0]) ?>, last <?= AI_DAYS ?> days</h3>
<?php   if (!$ops[$channel]) { ?>
        <p class="muted no-data">No calls.</p>
<?php   } else { ?>
        <div class="table-wrap">
        <table class="ai-ops" id="<?= h($t[2]) ?>">
            <thead><tr><th><?= h($t[1]) ?></th><?php if ($channel === 'rest') { ?><th>via</th><?php } ?><th class="num">calls</th><th class="bar-cell"><span class="bar-scale"><span>0</span><span><?= h($max) ?></span></span></th></tr></thead>
            <tbody>
<?php       foreach ($ops[$channel] as $r) { ?>
            <tr>
                <td class="op"><?= h($r['op']) ?></td>
<?php           if ($channel === 'rest') { ?>
                <td><?= h($r['channel'] === 'web' ? 'browser' : 'key or none') ?></td>
<?php           } ?>
                <td class="num"><?= h($r['calls']) ?></td>
                <td class="bar-cell"><span class="bar-line"><span class="bar"><span class="seg" style="width: <?= bar_width($r['calls'], $max) ?>%"></span></span><span class="bar-val"><?= h($r['calls']) ?></span></span></td>
            </tr>
<?php       } ?>
            </tbody>
        </table>
        </div>
<?php   }
    }
    $errors = $data['ai_errors'] ?? array();
?>
        <h3>Top errors, last <?= AI_DAYS ?> days</h3>
<?php if (!$errors) { ?>
        <p class="muted no-data">No failed calls.</p>
<?php } else { ?>
        <div class="table-wrap">
        <table class="ai-errors" id="ai_errors">
            <thead><tr><th>channel</th><th>operation / tool</th><th>error code</th><th class="num">calls</th></tr></thead>
            <tbody>
<?php   foreach ($errors as $r) { ?>
            <tr>
                <td><?= h(array('mcp' => 'MCP', 'rest' => 'API (key)', 'web' => 'API (browser)')[$r['channel']] ?? $r['channel']) ?></td>
                <td class="op"><?= h($r['op']) ?></td>
                <td class="op"><?= h($r['status']) ?></td>
                <td class="num"><?= h($r['calls']) ?></td>
            </tr>
<?php   } ?>
            </tbody>
        </table>
        </div>
<?php } ?>
        <p class="note">Error code = the code of the answer (error of /api/v1, structuredContent.error of a tool result); error = unexpected server error, busy = the database stayed locked, (unknown) = no operation matched after the database was opened (the path sent is never stored). Not counted: unknown paths and tools, malformed requests and calls while the database is down.</p>
<?php } ?>
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
            <dt>DB time</dt><dd><?= h($data['db']['now_time']) ?> <span class="muted">(times shown in <span id="stats_tz"><?= h($time_zone) ?></span>, UTC<?= h($time_zone_offset) ?>; DB time zone <?= h($data['db']['time_zone']) ?>, system <?= h($data['db']['system_time_zone']) ?>, UTC<?= h($db_offset) ?>)</span></dd>
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
