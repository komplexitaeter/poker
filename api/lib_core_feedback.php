<?php
/*
 * B-151 (MCP PR F2): feedback to the makers and the public roadmap (docs/mcp-concept.md, tool feedback), shared by
 * api/feedback.php and api/vote_roadmap.php (thin wrappers, answers unchanged) and the routes feedback_send /
 * roadmap_list / roadmap_vote of api/v1/routes.php (MCP). Not team-related: the person is the user id (UID); nothing
 * of the team goes along (B-57). No board effect, so no notify. Rules as in api/lib_core_*.php. Requires api/lib.php.
 */

const FEEDBACK_TEXT_MAX = 1800;
const FEEDBACK_CONTEXT_MAX = 500;

/*
 * feedback_send (feedback.php): stores one feedback of the user $uid. $type BUG|FEATURE|OTHER (anything else: OTHER);
 * the technical context is only kept for bugs. Text and context are stored raw (trimmed and cut by the callers).
 */
function core_feedback_send(mysqli $link, string $uid, string $type, string $text, int $stars = 0,
                            ?string $context = null): void
{
    if (!in_array($type, FEEDBACK_TYPES, true)) $type = 'OTHER';
    if ($type !== 'BUG' || $context === '') $context = null;
    $sql = $link->prepare("insert into pok_feedback_tbl (id, fb_stars, fb_text, fb_type, fb_context) values (?, ?, ?, ?, ?)");
    $sql->bind_param('sisss', $uid, $stars, $text, $type, $context);
    $sql->execute();
    $sql->close();
}

/*
 * roadmap_vote (vote_roadmap.php): sets (UP, DOWN) or removes (NONE) the reaction of $uid on the visible roadmap entry
 * $item and returns the entry (shape of get_roadmap_items()). Only users who joined a board -> else 403 not_a_member;
 * no visible entry -> 404 entry_not_found. One row per user, entry and phase (see vote_roadmap.php).
 */
function core_roadmap_vote(mysqli $link, string $uid, int $item, string $reaction): array
{
    if (!in_array($reaction, array_merge(ROADMAP_REACTIONS, ['NONE']), true)) {
        throw new ApiError(400, 'invalid_param', 'reaction', 'reaction: up, down or none');
    }
    // only users who joined a board (player or observer), so not every random id can vote
    $sql = $link->prepare("select count(1) cnt from pok_players_tbl where id = ?");
    $sql->bind_param('s', $uid);
    $sql->execute();
    $joined = (int)$sql->get_result()->fetch_object()->cnt > 0;
    $sql->close();
    if (!$joined) throw new ApiError(403, 'not_a_member');

    $items = get_roadmap_items($link, $uid, $item);
    if (count($items) !== 1) {
        throw new ApiError(404, 'entry_not_found', 'entry', 'No roadmap entry with this id: call feedback roadmap.');
    }
    $phase = roadmap_phase($items[0]['status']);
    // creation_date explicitly, in microseconds (see vote_roadmap.php)
    $sql = $link->prepare("insert into pok_roadmap_votes_tbl (item_id, user_id, phase, reaction, creation_date)
                           values (?, ?, ?, ?, current_timestamp(6)) as new
                           on duplicate key update reaction = new.reaction, creation_date = new.creation_date");
    $sql->bind_param('isss', $item, $uid, $phase, $reaction);
    $sql->execute();
    $sql->close();
    return get_roadmap_items($link, $uid, $item)[0];
}
