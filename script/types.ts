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
    results_order: string;
    show_avg: string;
    selected_card_key: string;
    all_players_ready: boolean;
    one_ore_more_player_ready: boolean;
    anonymous_mode: boolean;
    anonymous_request_toggle: boolean;
    needs_setup: boolean;
    needs_celebration: boolean;
    players_count: number;
    ready_players_count: number;
    players: Player[];
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
type RoadmapReaction = 'LOVE' | 'MEH'; // shown as ❤️ / 🙈

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
