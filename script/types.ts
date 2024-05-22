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
    hide_teaser: number;
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
    needs_celebration: boolean;
    players_count: number;
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