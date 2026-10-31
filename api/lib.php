<?php
/*
 * Connects with utf8mb4 (B-85), so emojis in names and topics reach the utf8mb4 columns unchanged. Reading the
 * remaining utf8mb3 columns works the same. $charset only for special cases.
 */
function db_init(string $charset = 'utf8mb4') {
    $link = mysqli_init();
    mysqli_real_connect(
        $link,
        _MYSQL_HOST,
        _MYSQL_USER,
        _MYSQL_PWD,
        _MYSQL_DB,
        _MYSQL_PORT
    );
    $link->set_charset($charset);
    return $link;
}

/*
 * Reads a GET parameter as plain text: unchanged apart from trimming and the length limit,
 * '' if missing. Values are stored as entered and escaped on output (textContent in the
 * frontend, json_encode in the API) - never insert them into HTML or SQL directly.
 */
function get_text_param(string $name, int $max_length): string {
    return cut_text(trim((string)filter_input(INPUT_GET, $name)), $max_length);
}

/*
 * Reads an id-like GET parameter (B-88): the value only if it consists of 1 to $max_length characters
 * A-Z, a-z, 0-9, '_' or '-', otherwise ''. Player/user ids (SID) are 16 characters A-Z0-9 at most
 * (script.js), '-1' marks a deleted user. A manipulated id (emoji, HTML characters, too long) thus behaves
 * like an unknown id and never reaches MySQL as a string the utf8mb3 columns cannot hold (HTTP 500).
 */
function get_id_param(string $name, int $max_length = 16): string {
    $value = filter_input(INPUT_GET, $name);
    return is_string($value) && preg_match('/^[A-Za-z0-9_-]{1,' . $max_length . '}$/D', $value) ? $value : '';
}

/*
 * Cuts a UTF-8 string after $max_length characters (not bytes, so umlauts are never split
 * and the limit matches the varchar length). Invalid UTF-8 results in ''. Works without mbstring.
 */
function cut_text(string $value, int $max_length): string {
    return preg_match('/^.{0,' . $max_length . '}/us', $value, $match) ? $match[0] : '';
}

function set_header($content_type) {
    if ($content_type=='json') {
        header('Content-Type: application/json; charset=utf-8');
    }
    else if ($content_type=='event-stream') {
        header("Content-Type: text/event-stream; charset=utf-8");
    }
    else if ($content_type=='svg') {
        header('Content-type: image/svg+xml');
    }
    header('Pragma-directive: no-cache');
    header('Cache-directive: no-cache');
    header('Cache-control: no-cache');
    header('Pragma: no-cache');
    header('Expires: 0');
}

function validate_team($t, $link) {

    $is_valid = false;

    $sql = $link->prepare("SELECT count(1) cnt FROM pok_teams_tbl WHERE id = ?");
    $sql->bind_param('s', $t);
    $sql->execute();

    if ($result = $sql->get_result()) {
        $obj = $result->fetch_object();
        $is_valid = ($obj->cnt == 1);
        $result->close();
    }

    return $is_valid;
}

/*
 * Validates the team id and aborts with HTTP 403 (empty body) when it is invalid.
 * Use this in team-bound writing endpoints instead of `validate_team(...) or exit;`
 * so an invalid team id returns a clear 403 rather than an empty 200.
 */
function require_team($t, $link) {
    if (!validate_team($t, $link)) {
        http_response_code(403);
        exit;
    }
}

/*
 * Rejects any request that is not a POST with HTTP 405 (empty body). Writing endpoints
 * call this right after the requires so that state changes can no longer be triggered by a
 * plain GET (B-11). Parameters stay in the URL query, so the endpoints keep reading them via
 * INPUT_GET / $_GET; only the HTTP method is constrained.
 */
function require_post() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        exit;
    }
}

/*
 * B-81: tells poker-msg that the board of $team_id changed; poker-msg then sends "pull" to every board of that team
 * (including the writer). One UDP datagram "pull:<team_id>" to 127.0.0.1, port _POKER_MSG_NOTIFY_PORT (config.php,
 * default 8444). Fire and forget: no answer, no delivery guarantee, never blocks, never fails the request and never
 * writes a PHP warning (if poker-msg is not running, the datagram is simply lost).
 *
 * Every writing endpoint with an effect on the board calls this at the end, after the team check and the successful
 * write (not on 400/403/early exit). dao.php must NEVER call it: pull -> dao.php -> notify -> pull would loop forever.
 */
function notify_team(string $team_id): void {
    if ($team_id === '') return;
    $port = defined('_POKER_MSG_NOTIFY_PORT') ? (int)constant('_POKER_MSG_NOTIFY_PORT') : 8444;
    try {
        $sock = @stream_socket_client('udp://127.0.0.1:' . $port, $errno, $errstr, 0.05);
        if ($sock === false) return;
        @stream_set_blocking($sock, false);
        @fwrite($sock, 'pull:' . $team_id);
        @fclose($sock);
    } catch (\Throwable $e) {
        // never let the notification break a successful write
    }
}

/* B-81: notify_team() for several teams, each team once (e.g. delete_user.php: all teams of the user). */
function notify_teams(array $team_ids): void {
    foreach (array_unique(array_map('strval', $team_ids)) as $team_id) {
        notify_team($team_id);
    }
}

/*
 * Maps a stored pok_teams_tbl.results_order to the values the app still knows (B-42): NAME or SEQUENCE.
 * Legacy CHOOSE:* values (the removed in-game choice; live data only ever had CHOOSE:SEQUENCE) and anything
 * unexpected become SEQUENCE, the default for new teams.
 */
function normalize_results_order($results_order) {
    return $results_order === 'NAME' ? 'NAME' : 'SEQUENCE';
}

/*
 * Sorts revealed players by their card (sort_order of cards.json and card_catalog.json), players with the same card
 * keep their order (by name). Players with a card key unknown to both files (e.g. custom cards, B-98) are never
 * dropped: they come last, in their incoming order.
 */
function sort_players_by_sequence(array $players): array
{
    $rank = card_rank();
    $unknown = count($rank);
    usort($players, function ($a, $b) use ($rank, $unknown) {
        return ($rank[(string)$a->display_card_key] ?? $unknown) <=> ($rank[(string)$b->display_card_key] ?? $unknown);
    });
    return $players;
}

/* card_key => position when all known cards are ordered by sort_order (ties: cards.json first, then file order) */
function card_rank(): array
{
    static $rank = null;
    if ($rank !== null) return $rank;

    $cards = array();
    $v1 = json_decode((string)file_get_contents(dirname(__DIR__) . '/cards.json'), true);
    foreach ($v1['cards'] ?? array() as $card) $cards[] = $card;
    $catalog = card_catalog();
    foreach ($catalog['groups'] as $group)
        foreach ($group['cards'] as $card) $cards[] = $card;
    foreach ($catalog['controls'] as $card) $cards[] = $card;

    $i = 0;
    foreach ($cards as &$card) $card['pos'] = $i++;
    unset($card);
    usort($cards, function ($a, $b) {
        return [$a['sort_order'], $a['pos']] <=> [$b['sort_order'], $b['pos']];
    });

    $rank = array();
    foreach ($cards as $card)
        if (!isset($rank[$card['card_key']])) $rank[$card['card_key']] = count($rank);
    return $rank;
}

/*
 * B-98: card catalog v2 (card_catalog.json): set groups with variants, their cards and the control cards. Read once
 * per request. legacy_index is the position of a card in the old cardset_flags (cards.json v1).
 */
function card_catalog(): array
{
    static $catalog = null;
    if ($catalog === null) {
        $catalog = json_decode((string)file_get_contents(dirname(__DIR__) . '/card_catalog.json'), true);
        if (!is_array($catalog)) $catalog = array('groups' => array(), 'controls' => array());
    }
    return $catalog;
}

/* B-98: variant id => array('group' => group, 'variant' => variant) */
function catalog_variants(array $catalog): array
{
    $variants = array();
    foreach ($catalog['groups'] as $group)
        foreach ($group['variants'] as $variant)
            $variants[$variant['id']] = array('group' => $group, 'variant' => $variant);
    return $variants;
}

/*
 * B-98: derives the deck of a team from its old cardset_flags (lazy migration in getDao()). Returns the values for
 * pok_teams_tbl.deck_id, deck_cards (null = all cards of the variant) and deck_controls (comma list, '' = none).
 * - Control card bits (☕ ? ! ✋) are taken over as they are (existing teams keep their choice).
 * - The other cards equal a variant exactly -> that variant.
 * - Otherwise they are a subset of a group (first group in catalog order, so Fibonacci wins over Numbers) -> the
 *   first variant containing all of them (else the one sharing the most cards) with these cards switched on.
 * - Otherwise (mixed groups, no card at all, e.g. needs_setup) -> the default deck with all of its cards.
 * Bits at positions without a card (or beyond the string, old teams have shorter strings) count as off.
 */
function deck_from_cardset_flags(?string $flags, array $catalog): array
{
    $flags = (string)$flags;
    $is_on = function (int $index) use ($flags): bool {
        return isset($flags[$index]) && $flags[$index] === '1';
    };

    $controls = array();
    $control_indexes = array();
    foreach ($catalog['controls'] as $control) {
        $control_indexes[$control['legacy_index']] = true;
        if ($is_on($control['legacy_index'])) $controls[] = $control['card_key'];
    }

    $selected = array();
    foreach ($catalog['groups'] as $group)
        foreach ($group['cards'] as $card)
            if ($is_on($card['legacy_index'])) $selected[$card['legacy_index']] = true;
    $selected = array_keys(array_diff_key($selected, $control_indexes));
    sort($selected);

    $result = array('deck_id' => (string)$catalog['default_deck'], 'deck_cards' => null,
                    'deck_controls' => implode(',', $controls));
    if (count($selected) === 0) return $result;

    foreach ($catalog['groups'] as $group) {
        $index_of = array_column($group['cards'], 'legacy_index', 'card_key');
        foreach ($group['variants'] as $variant) {
            $indexes = array_map(function ($key) use ($index_of) { return $index_of[$key]; }, $variant['cards']);
            sort($indexes);
            if ($indexes === $selected) {
                $result['deck_id'] = $variant['id'];
                return $result;
            }
        }
    }

    foreach ($catalog['groups'] as $group) {
        $key_of = array_column($group['cards'], 'card_key', 'legacy_index');
        if (count(array_diff($selected, array_keys($key_of))) > 0) continue;

        $keys = array();
        foreach ($group['cards'] as $card)
            if (in_array($card['legacy_index'], $selected, true)) $keys[] = $card['card_key'];

        $best = null;
        $best_common = -1;
        foreach ($group['variants'] as $variant) {
            $common = count(array_intersect($keys, $variant['cards']));
            if ($common === count($keys)) { $best = $variant; break; }
            if ($common > $best_common) { $best = $variant; $best_common = $common; }
        }
        $result['deck_id'] = $best['id'];
        $result['deck_cards'] = implode(',', $keys);
        return $result;
    }

    return $result;
}

/*
 * B-98: the deck of a team as delivered by dao.php:
 * {id: variant id, group: group id, cards: [active card keys in deck order], controls: [active control card keys], rev}
 * Card data (value, heading, description, numeric value) comes from card_catalog.json. Unknown ids and keys (e.g. after
 * a catalog change) fall back to the default deck and are ignored; at least one card always stays on.
 */
function resolve_deck(?string $deck_id, ?string $deck_cards, ?string $deck_controls, int $deck_rev, array $catalog): array
{
    $variants = catalog_variants($catalog);
    $entry = $variants[(string)$deck_id] ?? $variants[$catalog['default_deck']] ?? null;
    if ($entry === null) return array('id' => null, 'group' => null, 'cards' => array(), 'controls' => array(), 'rev' => $deck_rev);

    $cards = $entry['variant']['cards'];
    if ($deck_cards !== null && $deck_cards !== '' && $entry['variant']['id'] === $deck_id) {
        $wanted = array_flip(explode(',', $deck_cards));
        $subset = array();
        foreach ($entry['group']['cards'] as $card)
            if (isset($wanted[$card['card_key']])) $subset[] = $card['card_key'];
        if (count($subset) > 0) $cards = $subset;
    }

    $controls = array();
    $wanted = array_flip(explode(',', (string)$deck_controls));
    foreach ($catalog['controls'] as $control)
        if (isset($wanted[$control['card_key']])) $controls[] = $control['card_key'];

    return array('id' => $entry['variant']['id'], 'group' => $entry['group']['id'], 'cards' => $cards,
                 'controls' => $controls, 'rev' => $deck_rev);
}

function name2id($name) {
    $id='';
    $mix=array(
        "0" => array('0','O','o'),
        "1" => array('1','I','T'),
        "2" => array('2','Z','z'),
        "3" => array('3','E'),
        "4" => array('4','A'),
        "5" => array('5','F'),
        "6" => array('6','S','G'),
        "7" => array('7','T'),
        "8" => array('8','H'),
        "9" => array('9','g'),
        "a" => array('a','A','4'),
        "b" => array('b','B','3'),
        "c" => array('c','C'),
        "d" => array('d','D','0','O'),
        "e" => array('e','E','3'),
        "f" => array('f','F','1'),
        "g" => array('g','G','6'),
        "h" => array('h','H','8'),
        "i" => array('i','I','J','1'),
        "j" => array('j','J','I'),
        "k" => array('k','K','5'),
        "l" => array('l','L','7'),
        "m" => array('m','M'),
        "n" => array('n','N'),
        "o" => array('o','O','0'),
        "p" => array('p','P'),
        "q" => array('q','Q'),
        "r" => array('r','R'),
        "s" => array('s','S','6','9'),
        "t" => array('t','T','1','7'),
        "u" => array('u','U'),
        "v" => array('v','V','U'),
        "w" => array('w','W'),
        "x" => array('x','X'),
        "y" => array('y','Y'),
        "z" => array('z','Z','2'),
        "." => array('-','_'),
        "-" => array('-','_'),
        "_" => array('-','_'),
        "?" => array('S'),
        " " => array('_'),
        "*" => array('0','1','2','3','4','5','6','7','8','9')
    );
    $null_signs = array('x','X','0','o','O');

    for ($i=0;$i<strlen($name);$i++) {
        if (!isset($mix[strtolower($name[$i])]) or !$signs = $mix[strtolower($name[$i])]) {
            $signs = $null_signs;
        }
        $id.=$signs[rand(0,count($signs)-1)];
    }

    return $id;
}

function get_team_id($name, $link) {

    $sql = $link->prepare("select count(1) cnt from pok_teams_tbl where id=?");
    $id = name2id($name);

    for ($i=0;$i<80;$i++) {
        $sql->bind_param("s", $id);
        $sql->execute();
        $result = $sql->get_result();
        $obj = $result->fetch_object();

        if ($obj->cnt == 0){
            break;
        } else {
            if ($i>(strlen($name)/2)) {
                $id = name2id($id.'*');
            }
        }
    }

    return $id;
}


function getDao($t, $id) {
    $all_players_ready = true;
    $one_ore_more_player_ready = false;
    $name = '';
    $mkey = '';
    $timer_time = null;
    $timer_status = null;
    $timer_visibility = 0;
    $timer_mode = 'STOPWATCH';
    $timer_timebox = 300;
    $timer_auto_restart = 0;
    $card_key = '';
    $player_type = null;
    $cardset_flags = null;
    $deck = null;
    $team_name = null;
    $color_mode = 'dark';
    $hide_teaser = 0;
    $survey = 'NO';
    $topic = null;
    $results_order = 'NAME';
    $show_avg = 0;
    $players=array();
    $anonymous_mode = 0;
    $anonymous_request_toggle = 0;
    $show_tips = 1;
    $needs_setup = false;
    $needs_celebration = true;
    $players_count = 0;
    $ready_players_count = 0;

    if ($id === null || strlen($id) < 10) die();

    $link = db_init();

    /* set last callback of current player */
    $sql = $link->prepare("UPDATE pok_players_tbl
               SET last_callback_time = current_timestamp
             WHERE id = ?
               AND team_id = ?");
    $sql->bind_param('ss', $id, $t);
    $sql->execute();

    $sql = $link->prepare("SELECT t.cardset_flags
                  ,t.name
                  ,if(not isnull(t.timer_start_time) and isnull(t.timer_pause_time)
                      ,'RUNNING'
                      ,'PAUSED') timer_status
                  ,timestampdiff(SECOND
                                ,ifnull(t.timer_start_time, current_timestamp)
                                ,ifnull(t.timer_pause_time, current_timestamp)) timer_time
                  ,t.timer_visibility
                  ,t.timer_mode
                  ,t.timer_timebox
                  ,t.timer_auto_restart
                  ,t.topic
                  ,t.results_order
                  ,t.show_avg
                  ,t.anonymous_mode
                  ,t.anonymous_request_toggle
                  ,t.show_tips
                  ,t.needs_setup
                  ,t.deck_id
                  ,t.deck_cards
                  ,t.deck_controls
                  ,t.deck_rev
            FROM pok_teams_tbl as t
             WHERE t.id = ?");
    $sql->bind_param('s', $t);
    $sql->execute();
    if (($result = $sql->get_result()) && ($obj = $result->fetch_object())) {
        $cardset_flags = $obj->cardset_flags;
        $team_name = $obj->name;
        $timer_status = $obj->timer_status;
        $timer_time = $obj->timer_time;
        $timer_visibility = $obj->timer_visibility;
        $timer_mode = $obj->timer_mode;
        $timer_timebox = $obj->timer_timebox;
        $timer_auto_restart = $obj->timer_auto_restart;
        $topic = $obj->topic;
        /* B-42: CHOOSE:* (in-game choice, removed) is treated as SEQUENCE until the data update has run */
        $results_order = normalize_results_order($obj->results_order);
        $show_avg = (int)$obj->show_avg;
        $anonymous_mode = (int)$obj->anonymous_mode;
        $anonymous_request_toggle = (int)$obj->anonymous_request_toggle;
        $show_tips = (int)$obj->show_tips;
        $needs_setup = (bool)$obj->needs_setup;

        /* B-98: lazy migration - a team without deck_id gets the deck derived from its cardset_flags (also after the
           old deck menu changed them, update_cardset.php resets deck_id). Only if the flags are still the ones read
           here, so a parallel update_cardset.php is never overwritten. No notify_team(): dao.php must never notify. */
        $catalog = card_catalog();
        $deck_id = $obj->deck_id;
        $deck_cards = $obj->deck_cards;
        $deck_controls = $obj->deck_controls;
        if ($deck_id === null) {
            $migrated = deck_from_cardset_flags($obj->cardset_flags, $catalog);
            $deck_id = $migrated['deck_id'];
            $deck_cards = $migrated['deck_cards'];
            $deck_controls = $migrated['deck_controls'];
            $sql_m = $link->prepare("update pok_teams_tbl
                                        set deck_id = ?, deck_cards = ?, deck_controls = ?
                                      where id = ?
                                        and deck_id is null
                                        and cardset_flags <=> ?");
            $sql_m->bind_param('sssss', $deck_id, $deck_cards, $deck_controls, $t, $obj->cardset_flags);
            $sql_m->execute();
        }
        $deck = resolve_deck($deck_id, $deck_cards, $deck_controls, (int)$obj->deck_rev, $catalog);
    }

    $sql = $link->prepare("SELECT p.*
              FROM pok_players_tbl p
             WHERE p.team_id = ?
             ORDER BY p.name");
    $sql->bind_param('s', $t);
    $sql->execute();
    $objs = array();
    if ($result = $sql->get_result()) {

        $previous_card = null;

        while(  $obj = $result->fetch_object()) {

            if ($obj->id == $id) {
                $name=$obj->name;
                // mkey must stay a string in the JSON: the frontend compares it with the DOM card id via ===
                $mkey=(string)$obj->mkey;
                $card_key=$obj->card_key;
                $player_type = $obj->player_type;
            }

            if ($obj->player_type === 'PLAYER') {
                $players_count++;

                if (is_null($obj->card_key)) $all_players_ready = false;
                else {
                    $one_ore_more_player_ready = true;
                    $ready_players_count++;
                }


                if ($players_count > 1 && $previous_card !== $obj->card_key) $needs_celebration = false;
                $previous_card = $obj->card_key;


                $objs[] = $obj;
            }
        }

        if ($players_count<2) $needs_celebration = false;
    }


    $sql = $link->prepare("SELECT count(1) as user_exists
                                     ,max(u.color_mode) as color_mode
                                     ,max(u.survey_id) as survey_id
                                     ,max(u.survey_skipped) as survey_skipped
                                    ,max((select count(1) 
                                            from pok_survey_votes_tbl v 
                                           where v.user_id = u.id 
                                             and v.survey_id = u.survey_id) ) voted
                                    ,max(hide_teaser) as hide_teaser
                                FROM pok_user_tbl u WHERE u.id=?");
    $sql->bind_param('s', $id);
    $sql->execute();
    $result = $sql->get_result();
    if ($obj = $result->fetch_object()) {
        if ($obj->user_exists == 0) {
            $survey_id = get_survey_id($link, $t, $id);
            if ($survey_id != null) $survey = 'LOUD';
            // Idempotent insert: two parallel DAO calls for a fresh SID (loadBoard + WebSocket onopen)
            // both see user_exists == 0 and try to insert the same PRIMARY key. ON DUPLICATE KEY UPDATE id=id
            // lets the first request win and keeps its row unchanged, instead of a duplicate-key fatal (B-21).
            $sql_i = $link->prepare("INSERT INTO pok_user_tbl(id,survey_id) values(?,?) ON DUPLICATE KEY UPDATE id=id");
            $sql_i->bind_param('si', $id, $survey_id);
            $sql_i->execute();
        } else {
            $color_mode = $obj->color_mode;
            $hide_teaser = $obj->hide_teaser;
            if ($obj->survey_id > 0) {
                if ($obj->voted != 0) $survey = 'VOTED';
                elseif ($obj->survey_skipped != 0)  $survey = 'SILENT';
                else $survey = 'LOUD';
            } elseif ($obj->survey_id == -1) {
                $survey_id = get_survey_id($link, $t, $id);
                if ($survey_id != null) {
                    $survey = 'LOUD';
                    $sql_i = $link->prepare("UPDATE pok_user_tbl SET survey_id=? WHERE id=?");
                    $sql_i->bind_param('is', $survey_id, $id);
                } else {
                    $sql_i = $link->prepare("UPDATE pok_user_tbl SET survey_id=null WHERE id=?");
                    $sql_i->bind_param('s',$id);
                }
                $sql_i->execute();
            }
        }
    }

    $link->close();

    foreach($objs as $obj) {

        if ($all_players_ready)
            $display_card_key = $obj->card_key;
        else if (is_null($obj->card_key))
            if ($anonymous_mode == 1) {
                $display_card_key = 'prgrss2';
            } else {
                $display_card_key = 'prgrss1';
            }
        else
            $display_card_key = 'done001';

        $player = (object) array(
            "name"=>$obj->name
        // mkey must stay a string in the JSON: the frontend compares it with the DOM card id via ===
        ,"mkey"=>(string)$obj->mkey
        ,"display_card_key"=>$display_card_key
        ,"i"=>(int)null);
        $players[] = $player;

    }

    if ($all_players_ready and ($results_order === 'SEQUENCE' or $anonymous_mode == 1 ))
        $players = sort_players_by_sequence($players);

    for ($i=0;$i<count($players);$i++) {
        $players[$i]->i= $i;
        if ($anonymous_mode == 1 && $all_players_ready) $players[$i]->name =  '******';
    }
    return array(  "name"=> $name,
        "mkey"=>$mkey,
        "id"=>$id,
        "color_mode"=>(String)$color_mode,
        "hide_teaser"=>(Int)$hide_teaser, // B-57: 1 = feedback panel seen (no red dot)
        "survey"=>$survey,
        "team_name"=>$team_name,
        "cardset_flags"=>$cardset_flags,
        "deck"=>$deck, // B-98: {id, group, cards, controls, rev}, card data in card_catalog.json
        "topic"=>(String)$topic,
        "timer_status"=>$timer_status,
        "timer_time"=>(Int)$timer_time,
        "timer_visibility"=>(Int)$timer_visibility,
        "timer_mode"=>(String)$timer_mode, // B-67: STOPWATCH | TIMER
        "timer_timebox"=>(Int)$timer_timebox, // B-67: seconds, only used in TIMER mode
        "timer_auto_restart"=>(Int)$timer_auto_restart, // B-67: 1 = new/cancelled round restarts the timer
        "results_order"=>$results_order,
        "show_avg"=>$show_avg,
        "anonymous_mode"=>$anonymous_mode,
        "anonymous_request_toggle"=>$anonymous_request_toggle,
        "show_tips"=>$show_tips, // B-96: 1 = show the tips in #round_tip, 0 = hidden for the whole team
        "needs_setup"=>$needs_setup,
        "selected_card_key"=>$card_key,
        "player_type"=>$player_type,
        "all_players_ready"=>$all_players_ready,
        "one_ore_more_player_ready"=>$one_ore_more_player_ready,
        "needs_celebration"=>$needs_celebration,
        "players_count"=>$players_count,
        "ready_players_count"=>$ready_players_count,
        "players"=>$players );
}

/* B-57: allowed values for feedback types, roadmap status and reactions (UP = thumbs up, DOWN = thumbs down) */
const FEEDBACK_TYPES = ['BUG', 'FEATURE', 'OTHER'];
const ROADMAP_STATUS = ['PLANNED', 'IN_PROGRESS', 'DONE'];
const ROADMAP_REACTIONS = ['UP', 'DOWN'];

/*
 * B-57: votes are stored per phase - WANT while an entry is PLANNED or IN_PROGRESS, DONE once it is DONE.
 * So an entry set to DONE starts again at 0 in the public list. Same rule in SQL: roadmap_phase_sql().
 */
function roadmap_phase(string $status): string {
    return $status === 'DONE' ? 'DONE' : 'WANT';
}

function roadmap_phase_sql(string $status_column): string {
    return "case when $status_column = 'DONE' then 'DONE' else 'WANT' end";
}

/*
 * Visible entries of the public list (B-57) with the count per reaction and the reaction of $user_id (null if none),
 * both for the current phase of the entry only. Sorted by status (DONE, IN_PROGRESS, PLANNED), then by
 * (UP - DOWN) descending, then sort_order, then newest first.
 * $item_id limits the result to that entry (empty array if it is not visible).
 */
function get_roadmap_items($link, string $user_id, ?int $item_id = null): array {
    $phase = roadmap_phase_sql('r.status');
    $sql = $link->prepare("select x.* from (
                               select r.id, r.item_type, r.title, r.description, r.status, r.sort_order
                                     ,(select count(1) from pok_roadmap_votes_tbl v where v.item_id = r.id and v.phase = $phase and v.reaction = 'UP') as up_cnt
                                     ,(select count(1) from pok_roadmap_votes_tbl v where v.item_id = r.id and v.phase = $phase and v.reaction = 'DOWN') as down_cnt
                                     ,(select v.reaction from pok_roadmap_votes_tbl v where v.item_id = r.id and v.phase = $phase and v.user_id = ?) as my_reaction
                                 from pok_roadmap_tbl r
                                where r.visible = 1
                                  and (? is null or r.id = ?)
                           ) x
                           order by field(x.status, 'DONE', 'IN_PROGRESS', 'PLANNED'), x.up_cnt - x.down_cnt desc, x.sort_order, x.id desc");
    $sql->bind_param('sii', $user_id, $item_id, $item_id);
    $sql->execute();
    $items = array();
    $result = $sql->get_result();
    while ($obj = $result->fetch_object()) {
        $items[] = array(
            "id" => (int)$obj->id,
            "type" => $obj->item_type,
            "title" => $obj->title,
            "description" => $obj->description,
            "status" => $obj->status,
            "reactions" => array("UP" => (int)$obj->up_cnt, "DOWN" => (int)$obj->down_cnt),
            "my_reaction" => $obj->my_reaction
        );
    }
    return $items;
}

function get_survey_id($link, $team_id, $user_id) {
    $survey_id = null;
    $sql = $link->prepare(" select greatest(team_age, ifnull(related_teams_age, 0)) as approx_team_age
                              from
                            (
                            select t.id, timestampdiff(DAY, t.creation_date, current_timestamp) team_age
                            ,(SELECT max( timestampdiff(DAY, t2.creation_date, current_timestamp) )
                              FROM pok_players_tbl p1, pok_players_tbl p2, pok_teams_tbl t2 where p1.team_id =t.id
                                                                            and p2.id = p1.id
                                                                            and p2.team_id != p1.team_id
                                                                            and t2.id = p2.team_id) related_teams_age
                              from pok_teams_tbl t
                            where t.id = ?
                            ) as x
                            ;");
    $sql->bind_param('s', $team_id);
    $sql->execute();
    $result = $sql->get_result();
    if ($obj = $result->fetch_object()) {
        //if ($obj->approx_team_age >= 30) $survey_id = 1;
        if ($obj->approx_team_age < -110) $survey_id = 1;
    }
    return $survey_id;
}

function add_team($link, $t, $topic=null, $preset_mapping=null): string
{
    $id_val = '';
    $preset_index = 0;
    $needs_setup = 0;

    if (strlen($t) <= 0) {
        $t = 'Team';
    }

    $id = get_team_id($t, $link);

    /* determine preset from cards.json config file */
    $cards_conf = json_decode(file_get_contents(dirname(__DIR__).'/cards.json'), true);
    $cardset_flags = str_pad("", count($cards_conf["cards"]), "0");

    if (strtolower($preset_mapping ?? '') === 'custom') {

        $needs_setup = 1;

    } else {

        if ($preset_mapping !== null) {
            $i = 0;
            foreach ($cards_conf["presets"] as $preset) {
                if ($preset["mapping"] == $preset_mapping) $preset_index = $i;
                $i++;
            }
        }

        foreach ($cards_conf["presets"][$preset_index]["index_list"] as $index) {
            $cardset_flags = substr_replace($cardset_flags, "1", $index, 1);
        }

    }

    /* by default, all flow_control relevant cards should be set as active */
    foreach ($cards_conf["cards"] as $card) {
        if ($card["flow_control"]) {
            $cardset_flags = substr_replace($cardset_flags, "1", $card["index"], 1);
        }
    }


    $sql = $link->prepare("INSERT INTO pok_teams_tbl(id, cardset_flags, name, results_order, topic, needs_setup)
                                VALUES(?,?,?,'SEQUENCE',?,?)");
    $sql->bind_param('ssssi', $id, $cardset_flags, $t, $topic, $needs_setup);

    if ($sql->execute()) {
        $id_val = $id;
    }

    return $id_val;
}