export interface Player {
    name: string;
    mkey: string;
    display_card_key: string;
    player_type: string;
    i: number;
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
    needs_setup: boolean;
    needs_celebration: boolean;
    players_count: number;
    ready_players_count: number;
    players: Player[];
    deck: Deck | null; // R3 (B-98): null without card_catalog.json on the server (fallback: cardset_flags)
}

/* R3 (B-98): the team's deck from card_catalog.json (dao.php, api/update_deck.php) */
interface Deck {
    id: string | null;  // variant id, e.g. 'fib-classic' (null: unknown variant)
    group: string | null; // set group id, e.g. 'fib'
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
