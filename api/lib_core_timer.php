<?php
/*
 * B-151 (MCP PR F2): the team's timer (docs/mcp-concept.md, tool timer), shared by api/timer.php (thin wrapper, answers
 * unchanged) and the route timer_set of api/v1/routes.php (MCP). Rules as in api/lib_core_*.php (actor, ApiError, no
 * echo/exit/superglobals, prepared statements); one db_transaction() whose first statement locks the team row (B-155);
 * notify_team() after the commit. Requires api/lib.php. Defines functions only.
 */

const TIMER_ACTIONS = ['start', 'pause', 'reset', 'toggle_visibility', 'set_visibility', 'set_mode', 'set_timebox',
                       'set_auto_restart'];
const TIMER_TIMEBOX_MAX_MINUTES = 240;

/*
 * timer (timer.php): one action of the web timer (B-67, B-130), the same SQL as before.
 *   start: runs on from the paused time (from 0 after a reset) · pause · reset (back to 0, paused)
 *   toggle_visibility · set_visibility ($value 0|1) · set_mode ($value 'STOPWATCH'|'TIMER', resets)
 *   set_timebox ($value minutes 1..240, stored in seconds, resets) · set_auto_restart ($value TIMER_AUTO_*)
 * A wrong action or value -> 400 invalid_param, nothing written; team gone -> 403 not_a_member.
 */
function core_timer(mysqli $link, array $actor, string $action, int|string|null $value = null): void
{
    $t = (string)$actor['team_id'];
    $bad = fn(string $rule) => new ApiError(400, 'invalid_param', 'action', $rule);
    if (!in_array($action, TIMER_ACTIONS, true)) throw $bad('action: one of ' . implode(', ', TIMER_ACTIONS));
    $ok = match ($action) {
        'set_visibility' => in_array($value, [0, 1], true),
        'set_mode' => in_array($value, ['STOPWATCH', 'TIMER'], true),
        'set_timebox' => is_int($value) && $value >= 1 && $value <= TIMER_TIMEBOX_MAX_MINUTES,
        'set_auto_restart' => in_array($value, [TIMER_AUTO_OFF, TIMER_AUTO_NEW_ROUND, TIMER_AUTO_NEXT_ITEM], true),
        default => true,
    };
    if (!$ok) throw $bad('value: not allowed for ' . $action);

    db_transaction($link, function () use ($link, $t, $action, $value): void {
        lock_team_topics_or_throw($link, $t); // team row first (B-155)
        $sql = match ($action) {
            // continue from the paused time: start = now - (pause - start); after a reset (both null) from 0
            'start' => "update pok_teams_tbl t
                           set t.timer_start_time = timestampadd(SECOND, if(isnull(t.timer_pause_time), 0,
                                   timestampdiff(SECOND, t.timer_pause_time, t.timer_start_time)), current_timestamp)
                              ,t.timer_pause_time = null
                         where t.id = ?",
            'pause' => "update pok_teams_tbl t set t.timer_pause_time = current_timestamp where t.id = ?",
            'reset' => "update pok_teams_tbl t set t.timer_start_time = null, t.timer_pause_time = null where t.id = ?",
            'toggle_visibility' => "update pok_teams_tbl t set t.timer_visibility = not t.timer_visibility where t.id = ?",
            'set_visibility' => "update pok_teams_tbl t set t.timer_visibility = ? where t.id = ?",
            'set_mode' => "update pok_teams_tbl t set t.timer_mode = ?, t.timer_start_time = null, t.timer_pause_time = null
                            where t.id = ?",
            'set_timebox' => "update pok_teams_tbl t set t.timer_timebox = ?, t.timer_start_time = null,
                                     t.timer_pause_time = null
                               where t.id = ?",
            'set_auto_restart' => "update pok_teams_tbl t set t.timer_auto_restart = ? where t.id = ?",
        };
        $stmt = $link->prepare($sql);
        if ($action === 'set_mode') {
            $stmt->bind_param('ss', $value, $t);
        } elseif (in_array($action, ['set_visibility', 'set_timebox', 'set_auto_restart'], true)) {
            $number = $action === 'set_timebox' ? (int)$value * 60 : (int)$value;
            $stmt->bind_param('is', $number, $t);
        } else {
            $stmt->bind_param('s', $t);
        }
        $stmt->execute();
        $stmt->close();
    });
    notify_team($t); // B-81
}
