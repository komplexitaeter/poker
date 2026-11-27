<?php
/*
 * B-151: the MCP tools that are no REST operation, and the texts of the tools built from routes.php
 * (docs/mcp-concept.md, sections 5 and 7) - data only, the logic is in lib_mcp.php and the core functions.
 * Not reachable by URL (nginx sends /mcp and everything under /api/v1/ to index.php).
 *
 * 'tools': name => tool of its own (listed before the route tools, in this order)
 *   description    English, for the agent (the data hint is added by lib_mcp.php)
 *   identity       none (no team_id/uid/api_key) | key (api_key only: join_team) | seat (team_id + uid or api_key,
 *                  like a route tool: wait_for_change)
 *   params         name => definition as in routes.php without 'in' (type, required, text, min_length, max_length,
 *                  pattern, enum, default, description); 'required' is shown in the schema
 *   handler        mcp_<tool>(mysqli $link, array $params, ?string $key): array ['structured' => ..., 'text' => ...];
 *                  with identity seat the third parameter is the actor (array)
 *   annotations    MCP tool annotations, all five (B-151): title, readOnlyHint, destructiveHint (true where the tool
 *                  can delete or remove), idempotentHint, openWorldHint (always false: only this board)
 *   _meta          optional, passed on in tools/list as is (MCP Apps: the view of show_board, lib_mcp_app.php)
 * 'routes': tool name => description and text view of a tool built from the routes with this 'mcp.tool' (tools/list
 *                  in this order)
 *   description    English, for the agent
 *   params         optional: parameter name => description for the agent (replaces those of the routes)
 *   text           function(array $structured): string, the compact text content of the result
 *   annotations    as for 'tools'; readOnlyHint is only true if every route of the tool is a GET
 *
 * MCP is not versioned (decision 9): names, parameters and results may change at any time.
 */

// B-151: after a seat, ask once whether to follow the table; no wait_for_change loop without a yes
const MCP_ASK_UPDATES = ' Then ASK the user whether they want to be told about changes at the table (you stay with '
    . 'wait_for_change and report changes briefly) or whether you should only act when they ask. Without a yes, do not '
    . 'start a wait_for_change loop. On a yes, call show_board once first: if the chat shows the live board, it keeps '
    . 'itself up to date and you need no wait_for_change loop.';

const MCP_ROLE_PARAM = ['type' => 'string', 'enum' => ['player', 'observer']];

return [
    'tools' => [
        'create_team' => [
            'description' => 'Create a new Agile Poker board (team) and sit down at it. Ask the user first for: the team '
                . 'name, the name to show for them at the table, and whether they join as player (votes with a card) or '
                . 'observer (watches, moderates). Do not choose these yourself. Optionally pass a card set; without it '
                . 'the board starts with Fibonacci (Classic). Show the invite link from the result to the user: '
                . 'everyone with this link can join the board in the browser or with their own AI assistant. Keep '
                . 'team_id and uid for all further calls.' . MCP_ASK_UPDATES,
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
                . 'the result and pass them on every further call. To add a new seat at the same table, call this with '
                . 'the invite link from any result (team.invite_link, "Invite:" in the table block) and without api_key. '
                . 'Either way the result contains the current board: show the user its table block as a code block.'
                . MCP_ASK_UPDATES,
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
        // B-151 PR C (concept 5.3, 8): the wait itself is held by poker-msg, see lib_mcp_wait.php
        'wait_for_change' => [
            'description' => 'Wait until something changes at the table, then return what changed and the new board. '
                . 'Returns at the latest after about 25 seconds with changed=false. While you keep calling it, you '
                . 'count as present at the table (like an open browser tab); when the user is done, call me '
                . 'end_session (like closing the tab) and stop. If the result says ended, the session was ended: stop '
                . 'the loop. '
                . 'Pass the version from your last result (any tool) as since. Typical loop: call, show the user the '
                . 'table block of the text as a code block with at most one short line of your own (no narration), '
                . 'call again with the new version. Not needed while a live board (show_board) is shown. The full '
                . 'list of changes is in changes. If the result says busy, wait retry_after seconds and call again.',
            'identity' => 'seat',
            'params' => [
                'since' => ['type' => 'string', 'required' => true, 'min_length' => 1, 'max_length' => MCP_VERSION_MAX,
                            'pattern' => MCP_VERSION_PATTERN,
                            'description' => 'version from your last result (any tool).'],
                'timeout' => ['type' => 'integer', 'minimum' => 1, 'maximum' => MCP_WAIT_MAX, 'default' => MCP_WAIT_MAX,
                              'description' => 'Maximum seconds to wait.'],
            ],
            'handler' => 'mcp_wait_for_change',
            'annotations' => ['title' => 'Wait for a change at the table', 'readOnlyHint' => true,
                              'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false],
        ],
        // B-151 MCP Apps (concept 13): opens the live board view (ui://agile-poker/board), see lib_mcp_app.php
        'show_board' => [
            'description' => 'Show a live board the user can watch and play on in the chat (if the client supports '
                . 'apps); otherwise like get_board. The live board keeps itself up to date and the user can click a '
                . 'card, so you need no wait_for_change loop. Keep it at the BOTTOM of the conversation: call it again '
                . 'at the end of a reply whenever something changed at the table or the user did something (older '
                . 'boards stop by themselves) - never more than once per reply. Next to a live board write at most one '
                . 'short line, or nothing: the board shows the change. open=next_item opens the board\'s dialog to '
                . 'leave the active item (close with a value, without value, or later) - use it instead of asking in '
                . 'text. If you only get text back and no board appears, follow the table with wait_for_change instead. '
                . 'When the user says stop, bye or stop watching, call me end_session (the board stops, like closing '
                . 'the tab) and do NOT call show_board afterwards.',
            'identity' => 'seat',
            'params' => [
                'open' => ['type' => 'string', 'enum' => ['next_item'],
                           'description' => 'next_item: open the dialog to leave the active item in the live board.'],
            ],
            'handler' => 'mcp_show_board',
            'annotations' => ['title' => 'Show the live board', 'readOnlyHint' => true, 'destructiveHint' => false,
                              'idempotentHint' => true, 'openWorldHint' => false],
            '_meta' => mcp_app_tool_meta(),
        ],
        // B-151 PR F2 (concept 5.3, 8.6): thrown through poker-msg, see lib_mcp_react.php
        'react' => [
            'description' => 'Throw a reaction emoji at someone at the table (or nudge them), like the smiley next to '
                . 'their card on the web. Same limits as the web: each emoji at most once per day (UTC) and person in '
                . 'this team (the fish too), and not more than 3 per second / 10 per minute. The result says sent or '
                . 'why not (used_today, too_fast) and left_today per emoji (not for a nudge). Answer in ONE line, e.g. '
                . '"🐟 landed at Bea." or "Fish used today - back tomorrow."; do not list the other emojis or retry. '
                . 'With a live board, call show_board at the end of the reply. A nudge is anonymous, has no daily limit and makes the other '
                . 'person\'s board ring; use it sparingly, only when the user asks.',
            'identity' => 'seat',
            'params' => [
                'to' => ['type' => 'string', 'required' => true, 'text' => true, 'min_length' => 1, 'max_length' => 20,
                         'description' => 'mkey (preferred) or exact name of a person at the table from get_board '
                             . '(not yourself).'],
                'emoji' => ['type' => 'string', 'required' => true, 'enum' => array_merge(array_keys(MCP_REACT_EMOJI), ['nudge']),
                            'description' => 'cake 🎂, heart ❤️, clap 👏, party 🎉, think 🤔, thumbs 👍, fish 🐟, or '
                                . 'nudge.'],
            ],
            'handler' => 'mcp_react',
            'annotations' => ['title' => 'Throw a reaction', 'readOnlyHint' => false, 'destructiveHint' => false,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
    ],
    'routes' => [
        'get_board' => [
            'description' => 'Read the board as the user sees it in the browser: team, note, active item, who sits at '
                . 'the table (players with "has played" or, after the reveal, their card; observers), who is away, the '
                . 'round state (waiting for N players or revealed with distribution, range and suggested value), '
                . 'timer, card set and settings. Cards of others stay hidden until every player has a card down - '
                . 'exactly like on the web. Use it when the user asks "what\'s going on?"; to follow the table over time use '
                . 'wait_for_change (or the live board, show_board) instead of calling this repeatedly. Show the table '
                . 'block as a code block with at most one short line of your own.',
            'text' => 'mcp_board_text',
            'annotations' => ['title' => 'Read the board', 'readOnlyHint' => true, 'destructiveHint' => false,
                              'idempotentHint' => true, 'openWorldHint' => false],
        ],
        'play_card' => [
            'description' => 'Play or take back your card in the current round (players only). Ask the user which card '
                . '- never pick one for them. card accepts the value as shown on the card ("5", "XL", "☕", "?") or the '
                . 'card key from get_board. You can change your card until everybody has played; after the reveal a '
                . 'change is still possible and is shown as changed if the team uses "See changed cards". Control '
                . 'cards (☕ break, ? question, ! ...) are part of the deck if the team switched them on. Cards of '
                . 'others stay hidden until every player has played. The result shows the board afterwards.',
            'text' => 'mcp_seat_text',
            'annotations' => ['title' => 'Play a card', 'readOnlyHint' => false, 'destructiveHint' => false,
                              'idempotentHint' => true, 'openWorldHint' => false],
        ],
        'round' => [
            'description' => 'Control the round for the whole team. new_round: take all cards back and start over (the '
                . 'board button "New round" / restart) - the revealed result is kept for the active item. '
                . 'remove_player: take a player off the table, e.g. someone who left and holds up the reveal because '
                . 'they have no card (like the trash can on the web; the person can come back). There is no separate '
                . '"reveal" - cards turn over by themselves when every player has played. Confirm with the user before '
                . 'removing someone. The result shows the board afterwards.',
            'text' => 'mcp_seat_text',
            'annotations' => ['title' => 'Control the round', 'readOnlyHint' => false, 'destructiveHint' => true,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
        'me' => [
            'description' => 'The user\'s own seat: rename (max 15 characters), set_role (player or observer; coming back '
                . 'after being removed works the same way), '
                . 'end_session (End session, like closing the tab: use it when the user says stop, bye, end, stop '
                . 'watching or close - you are no longer connected, a player shows as away, an observer drops out of '
                . 'the list, live boards stop; nothing is deleted and the next call of this seat reconnects; call no '
                . 'further tool afterwards and answer in one line), '
                . 'leave (stop playing but stay as observer: no card any more, the others see you watching; the seat '
                . 'can come back with set_role), '
                . 'api_keys (list the user\'s API keys for this team; delete_key removes one, key_id "current" removes '
                . 'the key you are using right now and ends your access - creating keys is only possible in the '
                . 'browser), '
                . 'delete_my_data (erase everything: this person and everything they wrote in ALL teams, irreversible '
                . '- ONLY when the user explicitly asks to delete their data, never for "stop"; confirm first). '
                . 'delete_my_data is NOT possible when you act with an api_key: the key stands for the user\'s browser '
                . 'seat, and deleting it would wipe the user\'s identity in all their teams, including their browser. '
                . 'Explain that to the user and offer instead delete_key with key_id "current" (ends your access). To '
                . 'delete all their data, the user uses "Delete my data" in the You menu of the board in the browser.',
            'text' => 'mcp_seat_text',
            'annotations' => ['title' => 'Your own seat', 'readOnlyHint' => false, 'destructiveHint' => true,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
        // B-151 PR E (concept 5.3)
        'items' => [
            'description' => 'Work with the team\'s items (topics to estimate, e.g. Jira issues). The first open item is the '
                . 'active one - the team estimates it now. Actions: '
                . 'list (open items in order; status=done the finished ones with their results, status=all both), '
                . 'get (one item with its result), '
                . 'add (new item; key is optional, the server suggests one like TIX-005; position 1 makes it active), '
                . 'edit (heading, description, new_key, maturity - only what you pass changes), '
                . 'move (change the order of open items; position 1 makes it the active one), '
                . 'next (leave the active item and start a new round - mode close = done with the agreed value: the '
                . 'value the team chose, else the automatic one (highest card), or pass card to store another one; '
                . 'close_empty = done without a value; later = keep it open and bring it back later at the end of the '
                . 'list; pass the key of the active item so nothing happens if someone else moved on meanwhile), '
                . 'set_result (choose the agreed value of an item from its played cards or a card of the set with a '
                . 'value; empty card = automatic again), '
                . 'reopen (put a done item back at the end of the open list; rounds and votes stay), '
                . 'delete (remove an item for good - ask the user first, it cannot be undone). '
                . 'Results are what the web export shows: agreed value, votes ("5 ×2, 8 ×3"), rounds, dates. Before '
                . 'next: if a live board is shown, call show_board with open=next_item (its dialog asks) instead of '
                . 'asking in text; otherwise ask in ONE short line, e.g. "Close TIX-7 with 5? (or another card / no '
                . 'value)". Only suggest values that were played or exist in the card set; mention consequences only '
                . 'if the user asks. Everybody at the table sees changes at once.',
            'params' => [
                'key' => 'Item key, e.g. "TIX-004". Required for get, edit, move, set_result, reopen, delete; add: '
                    . 'optional (suggested if missing); next: the key of the active item as you see it (recommended).',
                'heading' => 'Short title. Required for add; edit: new title.',
                'description' => 'add, edit: Markdown text; null or "" removes it.',
                'new_key' => 'edit only: rename the key.',
                'maturity' => 'add, edit: how well the item is understood (new, rough, shaping, ready; none = not set).',
                'position' => 'move: new place among the open items, 1 = active (required). add: where to insert '
                    . '(default: end).',
                'mode' => 'next only: close (default) = done with the agreed value; close_empty = done without value; '
                    . 'later = back to the end of the open list.',
                'card' => 'next (mode close) and set_result: card value as shown (e.g. "8") or card key of the agreed '
                    . 'result; missing = automatic.',
                'status' => 'list only: open (default), done or all.',
                'limit' => 'list only: done items per answer (max 100).',
                'offset' => 'list only: done items to skip.',
            ],
            'text' => 'mcp_items_text',
            'annotations' => ['title' => 'Work with items', 'readOnlyHint' => false, 'destructiveHint' => true,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
        'board_settings' => [
            'description' => 'Team-wide settings, the same as the board\'s settings menu: rename (the team), set_note (the '
                . 'text shown above the table, e.g. the sprint goal; Markdown, max 2000 characters, "" clears it), set '
                . '(one or more of: anonymous results - names hidden after the reveal, applies from the next round if '
                . 'cards are down; results_order - by name or by card; show_average; show_tips; show_card_changes - '
                . '"See changed cards" keeps the first card visible when someone changes after the reveal). Everybody '
                . 'at the table sees the change immediately - mention that to the user.',
            'params' => [
                'name' => 'rename: new team name (max 30 characters).',
                'note' => 'set_note: the note (Markdown); "" clears it.',
                'anonymous' => 'set: hide names in the revealed result.',
                'results_order' => 'set: order of the revealed cards, by name or by card.',
                'show_average' => 'set: show the average of the revealed cards.',
                'show_tips' => 'set: show tips under the table.',
                'show_card_changes' => 'set: "See changed cards".',
            ],
            'text' => 'mcp_seat_text',
            'annotations' => ['title' => 'Team settings', 'readOnlyHint' => false, 'destructiveHint' => false,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
        // B-151 PR F2 (concept 5.3)
        'card_sets' => [
            'description' => 'See and change the team\'s card set (deck). list: all predefined sets with their cards and '
                . 'a short explanation (Fibonacci Classic/Short/Pure, Numbers 0-10, T-shirt sizes, Traffic lights, '
                . 'Emotions, Stars, Consent decision, Delegation Poker), the team\'s own custom sets, the control cards '
                . '(☕ break, ? question, ! important, ✋ veto, ¯\_(ツ)_/¯) with on/off, the current set, cards_down, and '
                . 'the symbols, colors and styles for custom cards. Explain the options in a few words when the user is '
                . 'unsure. choose: switch the team to a set, optionally only some of its cards. controls: switch '
                . 'control cards on or off (never starts a new round). create / edit / delete: the team\'s own sets '
                . '(at most custom.max_sets per team and custom.max_cards cards each). A card is a short text (1-6 '
                . 'characters, emoji allowed) or a symbol, with a color and optional heading, description and '
                . 'numeric_value (for range and average). Changing the set while cards are down (cards_down in list) '
                . 'starts a new round - tell the user and confirm first. When the user wants a custom set, propose the '
                . 'cards in a short list and create it only after they agree. Ask before deleting a set. Everybody at '
                . 'the table sees changes at once.',
            'params' => [
                'cards' => 'choose: comma list of card keys from list to use (missing = all cards of the set). '
                    . 'controls (required): comma list of the control card keys that are on, e.g. "break01,qstmrk1" '
                    . '("" = none).',
            ],
            'text' => 'mcp_card_sets_text',
            'annotations' => ['title' => 'Card sets', 'readOnlyHint' => false, 'destructiveHint' => true,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
        'timer' => [
            'description' => 'The team\'s timer, shared by everybody: start, pause, reset; show or hide it on the board; '
                . 'set_mode stopwatch (counts up) or timer (counts down from the timebox); set_timebox in minutes '
                . '(1-240); set_auto_start (off, with every new round, or with every next item). Mode and timebox reset '
                . 'the timer. Tell the user the resulting state in one line (e.g. "Timer running, 5:00 countdown").',
            'text' => 'mcp_seat_text',
            'annotations' => ['title' => 'Timer', 'readOnlyHint' => false, 'destructiveHint' => false,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
        'feedback' => [
            'description' => 'Feedback to the makers of Agile Poker (not to the team): send (a bug, a feature wish or '
                . 'other), roadmap (the public list "Ideas & Bugs" with votes and the user\'s own vote), vote (up, down '
                . 'or none on a roadmap entry). Only send what the user wrote or explicitly agreed to; show the text '
                . 'before sending.',
            'text' => 'mcp_feedback_text',
            'annotations' => ['title' => 'Feedback to the makers', 'readOnlyHint' => false, 'destructiveHint' => false,
                              'idempotentHint' => false, 'openWorldHint' => false],
        ],
    ],
];
