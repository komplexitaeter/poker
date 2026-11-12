export interface Player {
    name: string;
    mkey: string;
    display_card_key: string;
    original_card_key: string | null; // B-104: card of the reveal when changed afterwards; null otherwise and while covered
    player_type: string;
    away: boolean; // B-110: no dao.php load for AWAY_AFTER_SEC (70 s, api/lib.php); never true for the own card
    i: number;
}

/* B-110: a connected observer (observers without connection are not delivered); the own observer row is included */
export interface Observer {
    name: string;
    mkey: string;
}

export interface myJsonType {
    name: string;
    mkey: string;
    id: string;
    color_mode: string;
    hide_teaser: number; // B-57: 1 = feedback panel opened once (no red dot on the feedback menu)
    survey: string;
    team_name: string;
    cardset_flags: string;
    topic: string; // the team's note (B-52 S1b: independent of the topic items, always shown)
    topic_items: TopicItemsSummary | null; // B-52 S1b: null only if the table/columns are missing on the server
    timer_status: string;
    timer_time: number;
    timer_visibility: number;
    timer_mode: string; // B-67: 'STOPWATCH' | 'TIMER'
    timer_timebox: number; // B-67: seconds; TIMER shows T- (timebox - timer_time) until 0, then T+
    timer_auto_restart: 0 | 1 | 2; // B-67/B-130: auto-start 0 = off, 1 = new round (New/Cancel round), 2 = next item (leaving an item; without an active item like 1)
    results_order: string;
    show_avg: string;
    selected_card_key: string;
    all_players_ready: boolean;
    one_ore_more_player_ready: boolean;
    anonymous_mode: boolean;
    anonymous_request_toggle: boolean;
    show_tips: number; // B-96: 1 = show the tips in #round_tip, 0 = hidden for the whole team
    show_card_changes: number; // B-115: team setting, 1 = keep the first card when changed after the reveal (B-104)
    round_show_card_changes: number; // B-115: the running round's copy; 0 = original_card_key is always null
    needs_setup: boolean;
    needs_celebration: boolean;
    players_count: number;
    ready_players_count: number;
    players: Player[];
    observers: Observer[]; // B-110: connected observers, ordered by name
    away_sig: string; // B-127: signature of the away persons (api/lib.php away_sig()), '' = nobody; as in api/seen.php
    deck: Deck | null; // R3 (B-98): null without card_catalog.json on the server (fallback: cardset_flags)
    custom_sets: CustomSet[];          // B-98 S4: the team's own sets (not deleted), in their order
    custom_cards_played: CustomCard[]; // B-98 S4: custom cards on the table that are in no active set any more
    custom_limits: { sets: number; cards: number }; // B-98 S4: sets per team, cards per set (when adding, default 20)
}

/* B-98 S4: an own card set of the team (api/lib_custom.php load_custom_sets()) */
interface CustomSet {
    set_id: number;
    deck_id: string;     // 'c-<set_id>', the deck id when the set is in play
    name: string;        // free text: output with textContent only
    style: string;       // plain | badge | banner | inverted (editor "Style"), the look of its cards
    aim: 'agree' | 'perspectives'; // B-52 S1b: purpose of the set (editor), default agree; custom_set_create/save body "aim"
    rev: number;         // optimistic lock of custom_set_save.php
    cards: CustomCard[]; // active cards in position order
}

/* B-98 S4: a custom card (api/lib_custom.php custom_card_out()); immutable, a change gives a new card_key */
interface CustomCard {
    card_key: string;    // 'c-' + base36(id)
    symbol: string | null; // symbol of the library, null for a text card
    value: string;       // the text, or the catalog value of the symbol
    heading: string | null;
    description: string | null;
    numeric_value: number | null; // spread, average; null: does not count
    color: string;
    sort_order: number;
    set_id: number;
    active: boolean;
    infinite?: boolean;  // symbol s-inf
}

/* R3 (B-98): the team's deck from card_catalog.json (dao.php, api/update_deck.php) */
interface Deck {
    id: string | null;  // variant id, e.g. 'fib-classic' (null: unknown variant)
    group: string | null; // set group id, e.g. 'fib'; B-98 S4: 'custom' for an own set (id 'c-<set id>')
    cards: string[];    // card keys of the group, in the group's order
    controls: string[]; // control card keys (per team)
    rev: number;        // deck_rev, changes with every change of the deck
    // B-52 S1 (api/lib_topics.php deck_aim()): 'agree' = automatic result (highest numeric_value of the played cards,
    // cards without a value ignored) and range; 'perspectives' = only the distribution (catalog group "range": false,
    // custom set: its aim, B-52 S1b)
    aim: 'agree' | 'perspectives';
}

interface Preset {
    id: number;
    description: string;
    index_list: number[];
}

interface Card {
    index: number;
    card_key: string;
    sort_order: number;
    description: string;
    symbol?: string; // short label for non-numeric cards (B-53)
    numeric_value: number | null;
    flow_control: boolean;
}

interface myCardSetup {
    presets: Preset[];
    cards: Card[];
}

interface Survey {
    survey_id: number;
    votes_count: number;
    survey_intro: string;
    vote_options: VoteOption[];
}

interface VoteOption {
    id: number;
    text: string;
    total_count: number;
    votes_percentage: number;
}
/* B-57: public list "Ideas & Bugs" - api/get_roadmap.php ({items}) and api/vote_roadmap.php (one RoadmapItem) */
type RoadmapReaction = 'UP' | 'DOWN'; // shown as 👍 / 👎
// counts and my_reaction belong to the current phase of the entry (WANT while PLANNED/IN_PROGRESS, DONE when DONE);
// the list comes sorted: DONE, IN_PROGRESS, PLANNED, then (UP - DOWN) descending

interface RoadmapItem {
    id: number;
    type: 'BUG' | 'FEATURE' | 'OTHER';
    title: string;
    description: string | null;
    status: 'PLANNED' | 'IN_PROGRESS' | 'DONE';
    reactions: Record<RoadmapReaction, number>;
    my_reaction: RoadmapReaction | null;
}

interface Roadmap {
    items: RoadmapItem[];
}

/* B-127: answer of api/seen.php (light heartbeat of the board) */
export interface SeenJsonType {
    away_sig: string; // same value as myJsonType.away_sig; a change means: load dao.php
}

/* B-52 S1b: dao.php topic_items (api/lib_topics.php topic_items_for_dao()), kept small */
interface TopicItemsSummary {
    active: TopicItem | null;    // the topmost open item; null = none (general mode, only the note)
    open_count: number;          // open items incl. the active one
    done_count: number;
    next_heading: string | null; // heading of the open item after the active one ("next: ..."), null = active is the last
    topics_rev: number;          // changes with every change of any item; load get_topics.php when it differs
}

/* B-52 S1b: api/get_topics.php?t=..[&done=1&done_offset=0&done_limit=50] (api/lib_topics.php topic_lists()) */
export interface TopicListsJsonType {
    topics_rev: number;          // the rev of exactly these lists (one snapshot)
    open: TopicItem[];           // all open items in their order, open[0] is the active one
    open_count: number;
    done_count: number;          // all done items of the team
    limits: { open: number; ext_id: number; heading: number; description: number };
    done?: TopicItem[];          // only with done=1: newest first (done_date), done_limit items from done_offset
    done_offset?: number;        // only with done=1
}

interface TopicItem {
    id: number;
    ext_id: string | null;      // free text, output with textContent only
    heading: string;            // free text
    description: string | null; // markdown like the note (remarkable without HTML)
    maturity: number | null;    // optional: 0 new, 1 rough, 2 shaping, 3 ready; null = not set (show nothing)
    status: 'open' | 'done';
    // open: the chosen card (result_auto 0) or the automatic proposal (result_auto 1); done: the agreed value.
    // null = no single value (deck aim 'perspectives', no vote, or no played card with a value and none chosen)
    result_card_key: string | null;
    result_auto: number;
    // card_key -> count of the last revealed round (no persons); for the active item the running round while revealed
    distribution: { [card_key: string]: number } | null;
    rounds_cnt: number;              // revealed rounds finished while the item was active (the running one not yet)
    // S1c: dates as ISO 8601 in UTC, e.g. '2026-11-12T10:15:00Z' (new Date(value), format in local time)
    last_round_date: string | null;  // B-52 S1b: end of the last revealed round of the item
    done_date: string | null;        // when it was finished ("Next item"/"Finish item"), null while open
}

/* B-52 S1c: answer of api/topic_item_next.php?t=..&item=<active id>&mode=close|close_empty|later[&card=<card_key>]
   mode missing = close. close: card = the result (only deck aim 'agree', else 409 perspectives), without card the
   current estimate; close_empty: done without a value (null, result_auto 0); later: stays open, goes to the end of the
   open list (stays active if it is the only open item), a chosen result is reset.
   Errors: 400 {error: 'item'|'mode'|'card'}, 409 {error: 'not_active', active_id} | {error: 'perspectives'} */
export interface TopicItemNextJsonType {
    ok: true;
    item_id: number;                 // the item that was closed or brought back later
    active_id: number | null;        // the active item now (later + only open item: item_id), null = none
    result_card_key: string | null;  // stored result (later: null)
    result_auto: number;             // 1 automatic, 0 chosen or deliberately empty (close_empty)
}
