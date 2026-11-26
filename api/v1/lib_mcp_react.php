<?php
/*
 * B-151 PR F2: the MCP tool react (docs/mcp-concept.md 5.3, 8.6) - a reaction like the smiley next to a card on the
 * web board, through poker-msg with exactly its limits (format, 3/s and 10/min per thrower, each emoji once per UTC
 * day and thrower; the nudge only the rate limit). No PHP worker waits and PHP keeps no counters:
 *   1. call: PHP checks the seat and the recipient and answers only
 *      "X-Accel-Redirect: /_mcp_react/<team-hash>/<from-mkey>/<to-mkey>/<code>" (from = the actor's mkey, never taken
 *      from the agent; 0 for the anonymous nudge, like the board);
 *   2. nginx proxies it to poker-msg (127.0.0.1:8445), which checks, distributes to the boards of the team and answers
 *      "X-Accel-Redirect: /_mcp_result/react?r=ok|rate|quota&used=<codes thrown today>";
 *   3. nginx sends the ORIGINAL request to index.php again (phase react): identity checked again, the result built from
 *      r and used. poker-msg unreachable -> @mcp_react_failed (FastCGI parameter POKER_MCP_PHASE=react_down) -> busy.
 * The URI holds only the team hash, mkeys and the code (nothing secret, the error.log may name it).
 * Requires lib_mcp.php and lib_mcp_wait.php (McpWait carries the redirect). Defines functions only.
 */

/* the emojis of the board (script/reactions.js REACT_EMOJI) with their daily quota; 'nudge' has none */
const MCP_REACT_EMOJI = ['cake' => '🎂', 'heart' => '❤️', 'clap' => '👏', 'party' => '🎉', 'think' => '🤔',
                         'thumbs' => '👍', 'fish' => '🐟'];
const MCP_REACT_NUDGE = 'nudge';
const MCP_REACT_DAILY_QUOTA = 1; // poker-msg REACT_DAILY_QUOTA
const MCP_REACT_URI = '/_mcp_react/';

/* location of the throw: /_mcp_react/; a test setup may point a location of its own elsewhere (FastCGI parameter) */
function mcp_react_prefix(): string
{
    $prefix = $_SERVER['POKER_MCP_REACT_PREFIX'] ?? '';
    return is_string($prefix) && preg_match('~^/_[a-z0-9_]+/$~D', $prefix) ? $prefix : MCP_REACT_URI;
}

/*
 * The person $to (mkey, else exact name) among those the board shows with an mkey: players and connected observers.
 * After an anonymous reveal the other players have no mkey there, so they cannot be targeted (as on the web, where the
 * name is hidden). Returns ['mkey' => string, 'name' => string] or null; several people with that name -> invalid_param.
 */
function mcp_react_target(array $board, string $to): ?array
{
    $people = [];
    foreach (array_merge($board['players'], $board['observers']) as $person) {
        if (($person['mkey'] ?? null) !== null) $people[] = ['mkey' => (string)$person['mkey'], 'name' => (string)$person['name']];
    }
    foreach ($people as $person) if ($person['mkey'] === $to) return $person;
    $named = array_values(array_filter($people, fn(array $person): bool => $person['name'] === $to));
    if (count($named) > 1) {
        throw new ApiError(400, 'invalid_param', 'to', 'to: several people have this name - pass the mkey from get_board.');
    }
    return $named[0] ?? null;
}

/* react (tool of mcp_tools.php, identity seat): see the head of this file */
function mcp_react(mysqli $link, array $p, array $actor): array
{
    $phase = mcp_wait_phase()['phase'];
    $board = core_board_get($link, $actor, false);
    $you = $board['you'];
    $code = $p['emoji'];
    if ($phase === 'react') { // thrown already: the recipient only for the text (they may have left meanwhile)
        try {
            $target = mcp_react_target($board, $p['to']);
        } catch (ApiError $e) {
            $target = null;
        }
        return mcp_react_result($code, $target ?? ['mkey' => null, 'name' => $p['to']]);
    }
    $target = mcp_react_target($board, $p['to']);
    if ($phase === 'react_down') {
        throw new ApiError(503, 'busy', null, 'Reactions are not available right now (the live connection of the '
            . 'boards does not answer). Nothing was thrown; try again in a minute.');
    }
    if ($you['role'] === 'removed') {
        throw new ApiError(403, 'role_not_allowed', null, 'You are not at the table. Ask the user whether to come back '
            . '(me, action set_role) before throwing reactions.');
    }
    if ($target === null) {
        throw new ApiError(404, 'player_not_found', 'to', 'Nobody with this mkey or name at the table: use get_board.');
    }
    if ($target['mkey'] === (string)$you['mkey']) {
        throw new ApiError(400, 'invalid_param', 'to', 'to: not yourself - pick someone else at the table.');
    }
    $from = $code === MCP_REACT_NUDGE ? '0' : (string)$you['mkey'];
    if (!preg_match('/^[0-9]{1,10}$/D', $from) || !preg_match('/^[0-9]{1,10}$/D', $target['mkey'])) {
        throw new ApiError(500, 'internal', null, 'Unexpected error on the server.');
    }
    $hash = substr(hash('sha256', (string)$actor['team_id']), 0, 32);
    throw new McpWait(mcp_react_prefix() . $hash . '/' . $from . '/' . $target['mkey'] . '/' . $code);
}

/* the result after poker-msg: r = ok | rate | quota, used = the emojis thrown today (comma list) */
function mcp_react_result(string $code, array $target): array
{
    $r = $_GET['r'] ?? '';
    $used_raw = $_GET['used'] ?? '';
    $used = is_string($used_raw) ? array_flip(array_filter(explode(',', $used_raw),
                                                            fn(string $c): bool => isset(MCP_REACT_EMOJI[$c]))) : [];
    $left = [];
    foreach (MCP_REACT_EMOJI as $emoji => $char) $left[$emoji] = isset($used[$emoji]) ? 0 : MCP_REACT_DAILY_QUOTA;
    $reason = match ($r) { 'ok' => null, 'quota' => 'used_today', default => 'too_fast' };
    $what = $code === MCP_REACT_NUDGE ? 'nudge' : MCP_REACT_EMOJI[$code] . ' ' . $code;
    $name = '"' . str_replace(["\r", "\n"], ' ', $target['name']) . '"';
    $text = match ($reason) {
        null => $code === MCP_REACT_NUDGE ? 'You nudged ' . $name . ' (anonymously).' : 'You threw ' . $what . ' at ' . $name . '.',
        'used_today' => 'Not sent: ' . $what . ' is used up for today. It is back tomorrow (UTC) - do not retry.',
        default => 'Not sent: too fast (at most 3 per second and 10 per minute). Wait a moment before the next one.',
    };
    $left_text = implode(', ', array_map(fn(string $e): string => $e . ' ' . $left[$e], array_keys($left)));
    return ['structured' => ['sent' => $reason === null, 'reason' => $reason, 'emoji' => $code,
                             'to' => $target, 'left_today' => $left],
            'text' => $text . "\nLeft today: " . $left_text . '.'];
}
