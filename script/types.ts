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
    topic: string;
    timer_status: string;
    timer_time: number;
    timer_visibility: number;
    timer_mode: string; // B-67: 'STOPWATCH' | 'TIMER'
    timer_timebox: number; // B-67: seconds; TIMER shows T- (timebox - timer_time) until 0, then T+
    timer_auto_restart: number; // B-67: 1 = New round / Cancel round restart the timer
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
