<?php
/*
 * B-151: the MCP tools that are no REST operation, and the texts of the tools built from routes.php
 * (docs/mcp-concept.md, sections 5 and 7) - data only, the logic is in lib_mcp.php and the core functions.
 * Not reachable by URL (nginx sends /mcp and everything under /api/v1/ to index.php).
 *
 * 'tools': name => tool of its own (listed before the route tools, in this order)
 *   description    English, for the agent (the data hint is added by lib_mcp.php)
 *   identity       none (no team_id/uid/api_key) | key (api_key only: join_team)
 *   params         name => definition as in routes.php without 'in' (type, required, text, min_length, max_length,
 *                  pattern, enum, default, description); 'required' is shown in the schema
 *   handler        mcp_<tool>(mysqli $link, array $params, ?string $key): array ['structured' => ..., 'text' => ...]
 *   annotations    MCP tool annotations
 * 'routes': tool name => description and text view of a tool built from the routes with this 'mcp.tool'
 *   description    English, for the agent
 *   text           function(array $structured): string, the compact text content of the result
 *
 * MCP is not versioned (decision 9): names, parameters and results may change at any time.
 */

const MCP_ROLE_PARAM = ['type' => 'string', 'enum' => ['player', 'observer']];

return [
    'tools' => [
        'create_team' => [
            'description' => 'Create a new Agile Poker board (team) and sit down at it. Ask the user first for: the team '
                . 'name, the name to show for them at the table, and whether they join as player (votes with a card) or '
                . 'observer (watches, moderates). Do not choose these yourself. Optionally pass a card set; without it '
                . 'the board starts with Fibonacci (Classic). Show the invite link from the result to the user: '
                . 'everyone with this link can join the board in the browser or with their own AI assistant. Keep '
                . 'team_id and uid for all further calls.',
            'identity' => 'none',
            'params' => [
                'name' => ['type' => 'string', 'required' => true, 'text' => true, 'min_length' => 1, 'max_length' => 80,
                           'description' => 'Team name shown on the board, e.g. "Team XYZ".'],
                'member_name' => ['type' => 'string', 'required' => true, 'text' => true, 'min_length' => 1,
                                  'max_length' => 15,
                                  'description' => 'Name shown for the user at the table (first name or nickname).'],
                'role' => MCP_ROLE_PARAM + ['required' => true,
                    'description' => 'player = has a card and votes; observer = watches and moderates, no card.'],
                'card_set' => ['type' => 'string', 'enum' => array_keys(catalog_variants(card_catalog())),
                               'description' => 'Card set (deck) to start with: fib-classic, fib-short, fib-true '
                                   . '(Fibonacci), numbers (0-10), tshirt (T-shirt sizes), traffic (traffic lights), '
                                   . 'emotions, mood, stars, judge (Consent decision), delegation (Delegation Poker). '
                                   . 'Default fib-classic.'],
            ],
            'handler' => 'mcp_create_team',
            'annotations' => ['title' => 'Create a board', 'readOnlyHint' => false, 'destructiveHint' => false,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
        'join_team' => [
            'description' => 'Sit down at a board. Two ways: '
                . '(a) The user gives you an API key (pok_..., created in the board\'s You menu), e.g. "here is my '
                . 'token, join the table": call this with ONLY api_key. No invite link, team id, name or role needed - '
                . 'the key decides the team and the person. You take over the user\'s existing seat (same name, same '
                . 'card), no new person appears. Pass api_key on every further call. '
                . '(b) The user gives you an invite link or team id: first ask for the name to show at the table and '
                . 'whether they join as player or observer, then call this with invite, name and role. This creates a '
                . 'NEW person at the table, so call it only once per conversation and team. Keep team_id and uid from '
                . 'the result and pass them on every further call. '
                . 'Either way the result contains the current board: tell the user in one line where they sit and what '
                . 'is going on (note, active item, who is there).',
            'identity' => 'key',
            'params' => [
                'invite' => ['type' => 'string', 'text' => true, 'min_length' => 1, 'max_length' => 300,
                             'description' => 'Invite link (https://.../?t=...) or bare team id. Only without api_key.'],
                'name' => ['type' => 'string', 'text' => true, 'min_length' => 1, 'max_length' => 15,
                           'description' => 'Name shown at the table. Required with invite, ignored with api_key.'],
                'role' => MCP_ROLE_PARAM + [
                    'description' => 'player = has a card and votes (a player without card holds up the reveal); '
                        . 'observer = watches. Required with invite, ignored with api_key.'],
            ],
            'handler' => 'mcp_join_team',
            'annotations' => ['title' => 'Join a board', 'readOnlyHint' => false, 'destructiveHint' => false,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
    ],
    'routes' => [
        'get_board' => [
            'description' => 'Read the board as the user sees it in the browser: team, note, active item, who sits at '
                . 'the table (players with "has played" or, after the reveal, their card; observers), who is away, the '
                . 'round state (waiting for N players or revealed with distribution, range and suggested value), '
                . 'timer, card set and settings. Cards of others stay hidden until every player has a card down - '
                . 'exactly like on the web. Use it when the user asks "what\'s going on?".',
            'text' => 'mcp_board_text',
            'annotations' => ['title' => 'Read the board'],
        ],
        'play_card' => [
            'description' => 'Play or take back your card in the current round (players only). Ask the user which card '
                . '- never pick one for them. card accepts the value as shown on the card ("5", "XL", "☕", "?") or the '
                . 'card key from get_board. You can change your card until everybody has played; after the reveal a '
                . 'change is still possible and is shown as changed if the team uses "See changed cards". Control '
                . 'cards (☕ break, ? question, ! ...) are part of the deck if the team switched them on. Cards of '
                . 'others stay hidden until every player has played. The result shows the board afterwards.',
            'text' => 'mcp_seat_text',
            'annotations' => ['title' => 'Play a card', 'idempotentHint' => true],
        ],
        'round' => [
            'description' => 'Control the round for the whole team. new_round: take all cards back and start over (the '
                . 'board button "New round" / restart) - the revealed result is kept for the active item. '
                . 'remove_player: take a player off the table, e.g. someone who left and holds up the reveal because '
                . 'they have no card (like the trash can on the web; the person can come back). There is no separate '
                . '"reveal" - cards turn over by themselves when every player has played. Confirm with the user before '
                . 'removing someone. The result shows the board afterwards.',
            'text' => 'mcp_seat_text',
            'annotations' => ['title' => 'Control the round'],
        ],
        'me' => [
            'description' => 'The user\'s own seat: rename (max 15 characters), set_role (player or observer; coming back '
                . 'after being removed works the same way), leave (get up from this table: you disappear from the '
                . 'board, your seat stays and can come back with set_role), api_keys (list the user\'s API keys for '
                . 'this team; delete_key removes one, key_id "current" removes the key you are using right now and ends '
                . 'your access - creating keys is only possible in the browser), delete_my_data (deletes this person '
                . 'and everything they wrote in ALL teams, irreversible - only on the user\'s explicit request, confirm '
                . 'first). '
                . 'delete_my_data is NOT possible when you act with an api_key: the key stands for the user\'s browser '
                . 'seat, and deleting it would wipe the user\'s identity in all their teams, including their browser. '
                . 'Explain that to the user and offer instead: leave (get up from this table) and delete_key with '
                . 'key_id "current" (ends your access). To delete all their data, the user uses "Delete my data" in '
                . 'the You menu of the board in the browser.',
            'text' => 'mcp_seat_text',
            'annotations' => ['title' => 'Your own seat', 'destructiveHint' => true],
        ],
    ],
];
