<?php
/*
 * B-151 PR C: wait_for_change and the version of the board (docs/mcp-concept.md, sections 5.3 and 8).
 *
 * version: a short token (16 hex characters, a hash) of what the agent sees on the board (people with role, played,
 * card after the reveal and away; reveal; active item; counts; deck; note; timer; settings; team name) - short, so a
 * model copies it without mistakes (Andreas, 2026-11-27: a 260-character token came back altered). Every result with a
 * board carries it (mcp_with_version()); the agent passes the last one as since. The states behind the last
 * MCP_STATES_KEEP versions of a seat are kept in pok_players_tbl.mcp_states (deleted with the person), so
 * wait_for_change can list the changes since one of them; an unknown since just gets the whole board ("(full board)").
 * Until the old clients are gone, a long token of the former format (base64url of a deflated JSON) is still read.
 *
 * Waiting (concept 8.2/8.3): no PHP worker waits. Unchanged -> the answer is only the header
 * "X-Accel-Redirect: /_mcp_wait/<team-hash>/<checked>/<deadline>/<hop>"; nginx holds the request against poker-msg
 * (127.0.0.1:8445), which hands it back with "X-Accel-Redirect: /_mcp_result/<deadline>/<hop>?r=pull|timeout|busy" on a
 * pull of the team, at the deadline or when it is full. nginx then sends the ORIGINAL request (body and headers kept,
 * method GET) to index.php again: the identity is checked again and the view computed again. poker-msg unreachable ->
 * nginx error_page -> @mcp_wait_failed with the FastCGI parameter POKER_MCP_PHASE=down. At most MCP_WAIT_HOPS wait
 * rounds per request (nginx allows 10 internal redirects).
 *
 * Requires lib_mcp.php (loaded by it). Defines functions only.
 */

const MCP_WAIT_MAX = 25;           // seconds a wait_for_change lasts at most
const MCP_WAIT_HOPS = 3;           // wait rounds per request: 2 redirects each + the error_page stay below nginx's 10
const MCP_WAIT_RETRY_AFTER = 5;    // seconds, answer busy/down
const MCP_WAIT_URI = '/_mcp_wait/';
const MCP_VERSION_FORMAT = 1;
const MCP_VERSION_MAX = 8192;      // characters of a since: also the former long tokens (transition)
const MCP_VERSION_LENGTH = 16;     // hex characters of a version (64 bits of sha256)
const MCP_STATES_KEEP = 8;         // states of a seat kept for the list of changes (live board and agent share a seat)
const MCP_FULL_BOARD = '(full board)';
const MCP_VERSION_PATTERN = '^[A-Za-z0-9_-]+$';

/* thrown by wait_for_change when nothing changed: mcp_dispatch() answers with the X-Accel-Redirect to poker-msg */
final class McpWait extends Exception
{
    public function __construct(public readonly string $uri)
    {
        parent::__construct('wait');
    }
}

/*
 * The phase of this request: 'call' (POST /mcp), after poker-msg 'pull', 'timeout' or 'busy' (/_mcp_result/<deadline>/
 * <hop>?r=...), or 'down' (@mcp_wait_failed); B-151 PR F2: 'react' or 'react_down' for the tool react
 * (lib_mcp_react.php). deadline and hop only after poker-msg. nginx sets DOCUMENT_URI and the
 * FastCGI parameters, a client cannot (its headers arrive as HTTP_*).
 */
function mcp_wait_phase(): array
{
    if (($_SERVER['POKER_MCP_PHASE'] ?? '') === 'down') return ['phase' => 'down', 'deadline' => 0, 'hop' => MCP_WAIT_HOPS];
    // B-151 PR F2: react (lib_mcp_react.php) after poker-msg (/_mcp_result/react?r=...) or its failure (@mcp_react_failed)
    if (($_SERVER['POKER_MCP_PHASE'] ?? '') === 'react_down') return ['phase' => 'react_down', 'deadline' => 0, 'hop' => 0];
    if ((string)($_SERVER['DOCUMENT_URI'] ?? '') === '/_mcp_result/react') return ['phase' => 'react', 'deadline' => 0, 'hop' => 0];
    if (preg_match('~^/_mcp_result/(\d{10})/([1-3])$~D', (string)($_SERVER['DOCUMENT_URI'] ?? ''), $m)) {
        $r = $_GET['r'] ?? '';
        return ['phase' => in_array($r, ['pull', 'timeout', 'busy'], true) ? $r : 'busy', 'deadline' => (int)$m[1],
                'hop' => (int)$m[2]];
    }
    return ['phase' => 'call', 'deadline' => 0, 'hop' => 0];
}

/* true for the internal steps after poker-msg (or its failure): only wait_for_change may arrive there */
function mcp_wait_internal(): bool
{
    return mcp_wait_phase()['phase'] !== 'call';
}

/* the X-Accel-Redirect of a waiting request: nothing else in the answer */
function mcp_send_wait(McpWait $wait): void
{
    http_response_code(200);
    header('Cache-Control: no-store, private');
    header('X-Accel-Redirect: ' . $wait->uri);
}

/*
 * wait_for_change (tool of mcp_tools.php, identity seat): the board compared with since. Changed -> the result at once.
 * Unchanged -> wait (McpWait) while time and hops are left; at the deadline or after the last hop changed=false;
 * poker-msg full or unreachable -> busy with retry_after.
 */
function mcp_wait_for_change(mysqli $link, array $p, array $actor): array
{
    $phase = mcp_wait_phase();
    $now = microtime(true);
    $checked = (int)floor($now * 1000); // before the view: a write during the computation wakes the wait at once
    // B-151 end session: the seat's session was ended (me end_session, like a closed tab) - stop, read nothing (a
    // board read would mark the seat as connected again). Checked again after $checked (B-159): an end_session
    // between the check in mcp_actor() and $checked would otherwise wake nobody - its pull is older than $checked.
    if (!empty($actor['ended']) || mcp_session_ended($link, $actor['uid'], $actor['team_id'])) {
        return ['structured' => ['changed' => false, 'ended' => true, 'version' => $p['since']],
                'text' => 'Session ended (like a closed browser tab). Stop calling wait_for_change. Any other call of '
                    . 'this seat (e.g. show_board or get_board) reconnects it.'];
    }
    $board = core_board_get($link, $actor, false);
    $version = mcp_board_version($board);
    if ($version !== $p['since']) {
        $old = mcp_since_state($link, $actor, $p['since']); // before storing: since may be the oldest state kept
        mcp_store_state($link, $actor, $board);
        return mcp_wait_result($board, $version, $old, 'changed');
    }

    $hop = $phase['hop'] + 1;
    $deadline = match ($phase['phase']) {
        'call' => (int)ceil($now + $p['timeout']),
        default => min($phase['deadline'], (int)ceil($now + MCP_WAIT_MAX)),
    };
    switch ($phase['phase']) {
        case 'busy':
        case 'down':
            return mcp_wait_result($board, $version, null, 'busy');
        case 'call':
        case 'pull':
            if ($hop <= MCP_WAIT_HOPS && $deadline - $now >= 1) {
                $hash = substr(hash('sha256', (string)$actor['team_id']), 0, 32);
                throw new McpWait(mcp_wait_prefix() . $hash . '/' . $checked . '/' . $deadline . '/' . $hop);
            }
    }
    mcp_store_state($link, $actor, $board);
    return mcp_wait_result($board, $version, null, 'unchanged');
}

/* location of the wait: /_mcp_wait/; a test setup may point a location of its own elsewhere (FastCGI parameter) */
function mcp_wait_prefix(): string
{
    $prefix = $_SERVER['POKER_MCP_WAIT_PREFIX'] ?? '';
    return is_string($prefix) && preg_match('~^/_[a-z0-9_]+/$~D', $prefix) ? $prefix : MCP_WAIT_URI;
}

/* the final answer of wait_for_change: $how changed | unchanged | busy; $old = the state of since (null: unknown) */
function mcp_wait_result(array $board, string $version, ?array $old, string $how): array
{
    if ($how === 'busy') {
        return ['structured' => ['changed' => false, 'busy' => true, 'retry_after' => MCP_WAIT_RETRY_AFTER,
                                 'version' => $version],
                'text' => 'The server cannot wait right now (busy). Wait ' . MCP_WAIT_RETRY_AFTER . ' seconds, then call '
                    . 'wait_for_change again with the same since. Nothing changed at the table so far.'];
    }
    if ($how === 'unchanged') {
        return ['structured' => ['changed' => false, 'version' => $version, 'changes' => [], 'board' => $board],
                'text' => "Nothing changed at the table. Call wait_for_change again with the same since.\n"
                    . mcp_version_line($version)];
    }
    $changes = mcp_board_changes($old, mcp_board_state($board), $board);
    return ['structured' => ['changed' => true, 'version' => $version, 'changes' => $changes, 'board' => $board],
            'text' => mcp_changes_line($changes) . "\n\n" . mcp_board_text($board) . "\n\n" . mcp_version_line($version)];
}

/* B-151 Stufe 1: the changes as one short line above the board block (the full list stays in structuredContent) */
function mcp_changes_line(array $changes): string
{
    $line = implode(' ', $changes);
    $cut = cut_text($line, 120);
    return $cut === $line ? $line : rtrim($cut) . '…';
}

/* ---------- version ---------- */

/* a result with a board (structured is a board, e.g. get_board, or has one under 'board') gets its version; with the
   seat ($actor) its state is kept for a later wait_for_change */
function mcp_with_version(array $out, ?mysqli $link = null, ?array $actor = null): array
{
    $structured = $out['structured'];
    if (!is_array($structured) || array_key_exists('version', $structured)) return $out;
    $board = isset($structured['board']) && is_array($structured['board']) ? $structured['board']
        : (isset($structured['round'], $structured['players'], $structured['you']) ? $structured : null);
    if ($board === null) return $out;
    $version = mcp_board_version($board);
    if ($link !== null && $actor !== null) mcp_store_state($link, $actor, $board);
    $out['structured'] = $structured + ['version' => $version];
    $out['text'] .= "\n\n" . mcp_version_line($version);
    return $out;
}

function mcp_version_line(string $version): string
{
    return 'version (pass it as since to wait_for_change): ' . $version;
}

/* short fingerprint of a text that is compared, not shown again */
function mcp_fp(mixed $value): string
{
    return hash('crc32b', is_string($value) ? $value : (string)json_encode($value, JSON_INVALID_UTF8_SUBSTITUTE));
}

/*
 * What the version compares: everything of the board the agent sees, except what moves on its own (seconds of a
 * running timer) and the list of open items (counts and active item only). Names and cards stay readable for the
 * list of changes; long texts only as fingerprint.
 */
function mcp_board_state(array $board): array
{
    $players = [];
    foreach ($board['players'] as $player) {
        $players[] = [$player['mkey'], $player['name'], $player['played'] ? 1 : 0, $player['card'], $player['away'] ? 1 : 0];
    }
    $item = $board['active_item'];
    $deck = $board['deck'];
    $timer = $board['timer'];
    return [
        'v' => MCP_VERSION_FORMAT,
        'tn' => mcp_fp($board['team']['name']),
        'y' => [$board['you']['mkey'], $board['you']['role'], $board['you']['card']],
        'p' => $players,
        'o' => array_map(fn(array $o): array => [$o['mkey'], $o['name']], $board['observers']),
        'r' => $board['round']['state'] === 'revealed' ? 1 : 0,
        'i' => $item === null ? null : [$item['key'], mcp_fp([$item['heading'], $item['description']]), $item['rounds']],
        'c' => [$board['open_count'], $board['done_count']],
        'd' => $deck === null ? null : [$deck['id'], mcp_fp([$deck['name'], $deck['cards'], $deck['controls']])],
        'n' => mcp_fp($board['note']),
        't' => [$timer['status'], $timer['mode'], $timer['visible'] ? 1 : 0, $timer['timebox_seconds'],
                $timer['auto_start'], $timer['status'] === 'running' ? null : $timer['seconds']],
        's' => $board['settings'],
    ];
}

/* the state as stored (ASCII JSON: the column is ascii, names with emoji stay \u escapes) */
function mcp_state_json(array $state): string
{
    return (string)json_encode($state, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
}

function mcp_board_version(array $board): string
{
    return substr(hash('sha256', mcp_state_json(mcp_board_state($board))), 0, MCP_VERSION_LENGTH);
}

/* the kept states of a seat: [[version, state], ...] newest first; [] without any or without the column
   (seat_states_read() in api/lib.php, which also keeps the mark of a self leave) */
function mcp_load_states(mysqli $link, array $actor): array
{
    return seat_states_read($link, (string)$actor['uid'], (string)$actor['team_id'])['s'];
}

/* keeps the state of this board for the seat (newest first, at most MCP_STATES_KEEP, each version once) */
function mcp_store_state(mysqli $link, array $actor, array $board): void
{
    $state = mcp_board_state($board);
    $version = substr(hash('sha256', mcp_state_json($state)), 0, MCP_VERSION_LENGTH);
    $uid = (string)$actor['uid'];
    $t = (string)$actor['team_id'];
    $states = seat_states_read($link, $uid, $t)['s'];
    if (($states[0][0] ?? null) === $version) return; // nothing new: no write
    $states = array_values(array_filter($states, fn($entry): bool => is_array($entry) && ($entry[0] ?? null) !== $version));
    array_unshift($states, [$version, $state]);
    // only the states: the mark of a self leave stays as it is in the row now (seat_states_store())
    seat_states_store($link, $uid, $t, array_slice($states, 0, MCP_STATES_KEEP));
}

/* the state behind since: a kept version of the seat, or (transition) a long token of the former format; else null */
function mcp_since_state(mysqli $link, array $actor, string $since): ?array
{
    if (strlen($since) !== MCP_VERSION_LENGTH) return mcp_version_state($since);
    foreach (mcp_load_states($link, $actor) as $entry) {
        if (is_array($entry) && ($entry[0] ?? null) === $since && is_array($entry[1] ?? null)) {
            $state = $entry[1];
            foreach (['p', 'o', 'y', 'c', 't', 's'] as $part) if (!is_array($state[$part] ?? null)) return null;
            return $state;
        }
    }
    return null;
}

/* transition: the state in a long token of the former format, null if it is none of ours (wrong format, damaged) */
function mcp_version_state(string $version): ?array
{
    if (strlen($version) > MCP_VERSION_MAX) return null;
    $bin = base64_decode(strtr($version, '-_', '+/'), true);
    if ($bin === false || $bin === '') return null;
    $json = @gzinflate($bin, 65536); // damaged data: false, no warning in the log
    if (!is_string($json)) return null;
    $state = json_decode($json, true, 8);
    if (!is_array($state) || ($state['v'] ?? null) !== MCP_VERSION_FORMAT) return null;
    foreach (['p', 'o', 'y', 'c', 't', 's'] as $part) if (!is_array($state[$part] ?? null)) return null;
    return $state;
}

/* ---------- list of changes ---------- */

/*
 * Short English sentences from the old state (since) to the new board, in the order people read a table: who came,
 * went, played, is away; reveal or new round; item, card set, note, timer, settings. Texts of others in quotes (data).
 */
function mcp_board_changes(?array $old, array $new, array $board): array
{
    if ($old === null) return [MCP_FULL_BOARD];
    // the old state comes from the agent: only scalars count, anything else reads as empty (no warning)
    $str = fn(mixed $v): string => is_scalar($v) ? (string)$v : '';
    $q = fn(mixed $s): string => '"' . str_replace(["\r", "\n"], ' ', cut_text($str($s), 80)) . '"';
    $old['r'] = !empty($old['r']);
    $me = (string)$board['you']['mkey'];
    $out = [];

    if (($old['tn'] ?? null) !== $new['tn']) $out[] = 'Team renamed to ' . $q($board['team']['name']) . '.';

    // people by mkey; after an anonymous reveal the players have no mkey (only the own one): no sentences for them
    $anonymous = ($old['r'] && !empty($old['s']['anonymous'])) || ($new['r'] && $new['s']['anonymous']);
    $people = function (array $state) use ($anonymous, $me, $str): array {
        $list = [];
        foreach ($state['p'] as $p) {
            if (!is_array($p) || !array_is_list($p) || count($p) < 5 || !is_scalar($p[0])) continue;
            if ($anonymous && (string)$p[0] !== $me) continue;
            $list[(string)$p[0]] = ['name' => $str($p[1]), 'role' => 'player', 'played' => (bool)$p[2],
                                    'card' => is_scalar($p[3]) ? (string)$p[3] : null, 'away' => (bool)$p[4]];
        }
        foreach ($state['o'] as $o) {
            if (!is_array($o) || !array_is_list($o) || count($o) < 2 || !is_scalar($o[0])) continue;
            $list[(string)$o[0]] = ['name' => $str($o[1]), 'role' => 'observer', 'played' => false, 'card' => null,
                                    'away' => false];
        }
        return $list;
    };
    $before = $people($old);
    $after = $people($new);
    $who = fn(string $mkey, array $p): string => $mkey === $me ? 'You' : $q($p['name']); // array keys of numeric mkeys are ints: compare as strings
    $new_round = ($old['r'] && !$new['r']);
    if (!$new_round && !$old['r'] && !$new['r']) {
        $taken_back = 0;
        foreach ($after as $mkey => $p) if (($before[$mkey]['played'] ?? false) && !$p['played']) $taken_back++;
        $new_round = $taken_back >= 2; // several cards gone at once: a new round, not people changing their mind
    }

    // B-151 self leave: the own seat went off the table (a removed seat stays in the observers for the others, B-154) -
    // by its own leave or taken off by someone else
    $me_off = ($old['y'][1] ?? null) !== 'removed' && $new['y'][1] === 'removed';
    $me_off_text = !empty($board['you']['left_by_self']) ? 'You left the table.' : 'You are no longer at the table.';
    $played = [];
    foreach ($after as $mkey => $p) {
        $was = $before[$mkey] ?? null;
        if ($was === null) {
            $out[] = $who($mkey, $p) . ' joined as ' . $p['role'] . '.';
            continue;
        }
        if ($was['name'] !== $p['name']) $out[] = $q($was['name']) . ' is now called ' . $q($p['name']) . '.';
        if ($was['role'] !== $p['role'] && !($me_off && (string)$mkey === $me)) {
            $out[] = $who($mkey, $p) . ($p['role'] === 'player' ? ' now play' . ((string)$mkey === $me ? '' : 's') . ' (player).'
                                                                : ' now watch' . ((string)$mkey === $me ? '' : 'es') . ' (observer).');
        }
        if ((string)$mkey !== $me && $p['role'] === 'player' && $was['role'] === 'player') {
            if (!$was['played'] && $p['played']) $played[] = $q($p['name']);
            elseif ($was['played'] && !$p['played'] && !$new_round) $out[] = $q($p['name']) . ' took back their card.';
            elseif ($old['r'] && $new['r'] && $was['card'] !== null && $p['card'] !== $was['card']) {
                $out[] = $q($p['name']) . ' changed their card to ' . $q($p['card']) . '.';
            }
        }
        if ($was['away'] !== $p['away']) $out[] = $who($mkey, $p) . ($p['away'] ? ' is away.' : ' is back.');
    }
    if ($me_off) $out[] = $me_off_text;
    if ($played !== []) $out[] = implode(', ', $played) . (count($played) === 1 ? ' played a card.' : ' played their cards.');
    foreach ($before as $mkey => $p) {
        if (!isset($after[$mkey])) {
            if ((string)$mkey !== $me) $out[] = $q($p['name']) . ' left the table.';
            elseif (!$me_off) $out[] = 'You are no longer at the table.';
        }
    }
    if ($anonymous && count($old['p']) !== count($new['p'])) $out[] = count($new['p']) . ' players at the table.';

    // own card (the agent sees it before the reveal; the board in a browser with the same key may change it)
    if (!$new_round && ($old['y'][2] ?? null) !== $new['y'][2] && ($old['y'][1] ?? null) === $new['y'][1]) {
        $out[] = $new['y'][2] === null ? 'Your card was taken back.' : 'Your card: ' . $q($new['y'][2]) . '.';
    }

    $round = $board['round'];
    if (!$old['r'] && $new['r']) {
        $result = $round['result'];
        $out[] = 'Cards revealed: ' . ($result['text'] !== '' ? $result['text'] : 'no votes')
            . ($result['suggestion'] !== null ? ' (suggestion ' . $q($result['suggestion']) . ')' : '') . '.';
    } elseif ($new_round) {
        $out[] = 'New round started.';
    }
    if (!$new['r'] && $round['waiting_for'] !== [] && ($played !== [] || $new_round)) {
        $out[] = 'Waiting for: ' . implode(', ', array_map($q, $round['waiting_for'])) . '.';
    }

    $item = $board['active_item'];
    $old_item = is_array($old['i'] ?? null) ? $old['i'] : null;
    if ($new['i'] === null && $old_item !== null) {
        $out[] = 'No active item any more.';
    } elseif ($new['i'] !== null && ($old_item === null || ($old_item[0] ?? null) !== $new['i'][0])) {
        $out[] = 'New active item: ' . ($item['key'] !== null && $item['key'] !== '' ? $item['key'] . ' ' : '')
            . $q($item['heading']) . '.';
    } elseif ($new['i'] !== null && ($old_item[1] ?? null) !== $new['i'][1]) {
        $out[] = 'The active item was edited: ' . ($item['key'] ?? '') . ' ' . $q($item['heading']) . '.';
    }
    if (($old['c'] ?? null) !== $new['c']) $out[] = 'Items: ' . $new['c'][0] . ' open, ' . $new['c'][1] . ' done.';

    if (($old['d'] ?? null) !== $new['d'] && $board['deck'] !== null) {
        $out[] = 'Card set changed to ' . $q($board['deck']['name']) . '.';
    }
    if (($old['n'] ?? null) !== $new['n']) {
        $out[] = $board['note'] === '' ? 'Note removed.' : 'Note changed: ' . $q($board['note']) . '.';
    }

    $t_old = $old['t'];
    $t_new = $new['t'];
    if ($t_old !== $t_new) {
        $timer = $board['timer'];
        if (($t_old[2] ?? null) !== $t_new[2]) $out[] = $timer['visible'] ? 'Timer shown.' : 'Timer hidden.';
        if (($t_old[0] ?? null) !== $t_new[0]) {
            $out[] = $timer['status'] === 'running' ? 'Timer started.' : 'Timer paused.';
        } elseif (($t_old[2] ?? null) === $t_new[2]) {
            $out[] = 'Timer changed (' . $timer['mode'] . ($timer['mode'] === 'timer'
                ? ', timebox ' . sprintf('%02d:%02d', intdiv($timer['timebox_seconds'], 60), $timer['timebox_seconds'] % 60) : '')
                . ').';
        }
    }

    $settings = [];
    foreach ($new['s'] as $name => $value) {
        if (($old['s'][$name] ?? null) !== $value) {
            $settings[] = str_replace('_', ' ', (string)$name) . ' ' . (is_bool($value) ? ($value ? 'on' : 'off') : $value);
        }
    }
    if ($settings !== []) $out[] = 'Settings changed: ' . implode(', ', $settings) . '.';

    return $out !== [] ? $out : ['The board changed.'];
}
