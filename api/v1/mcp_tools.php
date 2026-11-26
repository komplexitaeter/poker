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
    ],
];
