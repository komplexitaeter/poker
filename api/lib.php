<?php
/*
 * $charset: 'utf8' (= utf8mb3) for the old tables; 'utf8mb4' where texts may contain emojis
 * (pok_feedback_tbl and the roadmap tables, B-57).
 */
function db_init(string $charset = 'utf8') {
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
 * Maps a stored pok_teams_tbl.results_order to the values the app still knows (B-42): NAME or SEQUENCE.
 * Legacy CHOOSE:* values (the removed in-game choice; live data only ever had CHOOSE:SEQUENCE) and anything
 * unexpected become SEQUENCE, the default for new teams.
 */
function normalize_results_order($results_order) {
    return $results_order === 'NAME' ? 'NAME' : 'SEQUENCE';
}

function sort_players_by_sequence(array $players)
{
    $ret_val = array();
    $cards = json_decode(file_get_contents('../cards.json'), true)["cards"];

    usort($cards, function($a, $b) {
        return $a["sort_order"] - $b["sort_order"];
    });

    foreach ($cards as $card)
        foreach ($players as $player)
            if ($card["card_key"] == $player->display_card_key)
                $ret_val[] = $player;

    return $ret_val;
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
    $card_key = '';
    $player_type = null;
    $cardset_flags = null;
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
                  ,t.topic
                  ,t.results_order
                  ,t.show_avg
                  ,t.anonymous_mode
                  ,t.anonymous_request_toggle
                  ,t.needs_setup
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
        $topic = $obj->topic;
        /* B-42: CHOOSE:* (in-game choice, removed) is treated as SEQUENCE until the data update has run */
        $results_order = normalize_results_order($obj->results_order);
        $show_avg = (int)$obj->show_avg;
        $anonymous_mode = (int)$obj->anonymous_mode;
        $anonymous_request_toggle = (int)$obj->anonymous_request_toggle;
        $needs_setup = (bool)$obj->needs_setup;
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
        "hide_teaser"=>(Int)$hide_teaser,
        "survey"=>$survey,
        "team_name"=>$team_name,
        "cardset_flags"=>$cardset_flags,
        "topic"=>(String)$topic,
        "timer_status"=>$timer_status,
        "timer_time"=>(Int)$timer_time,
        "timer_visibility"=>(Int)$timer_visibility,
        "results_order"=>$results_order,
        "show_avg"=>$show_avg,
        "anonymous_mode"=>$anonymous_mode,
        "anonymous_request_toggle"=>$anonymous_request_toggle,
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

/* B-57: allowed values for feedback types, roadmap status and reactions */
const FEEDBACK_TYPES = ['BUG', 'FEATURE', 'OTHER'];
const ROADMAP_STATUS = ['PLANNED', 'IN_PROGRESS', 'DONE'];
const ROADMAP_REACTIONS = ['LOVE', 'MEH'];

/*
 * Visible entries of the public list (B-57), sorted, with the count per reaction and the reaction of $user_id
 * (null if none). $item_id limits the result to that entry (empty array if it is not visible).
 */
function get_roadmap_items($link, string $user_id, ?int $item_id = null): array {
    $sql = $link->prepare("select r.id, r.item_type, r.title, r.description, r.status
                                 ,(select count(1) from pok_roadmap_votes_tbl v where v.item_id = r.id and v.reaction = 'LOVE') as love_cnt
                                 ,(select count(1) from pok_roadmap_votes_tbl v where v.item_id = r.id and v.reaction = 'MEH') as meh_cnt
                                 ,(select v.reaction from pok_roadmap_votes_tbl v where v.item_id = r.id and v.user_id = ?) as my_reaction
                             from pok_roadmap_tbl r
                            where r.visible = 1
                              and (? is null or r.id = ?)
                            order by r.sort_order, r.id desc");
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
            "reactions" => array("LOVE" => (int)$obj->love_cnt, "MEH" => (int)$obj->meh_cnt),
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