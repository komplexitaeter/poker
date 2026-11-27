<?php
/*
 * B-151 (MCP Apps, docs/mcp-concept.md section 13): the live board in the chat. One UI resource
 * (ui://agile-poker/board, text/html;profile=mcp-app) that hosts with MCP Apps show for the tool show_board; hosts
 * without apps just get the board like get_board. The view (mcp_app/board.html) is a self-contained HTML document
 * (inline script and style, no network access of its own): it talks to the host via postMessage and calls our tools
 * (wait_for_change, play_card, get_board) through it.
 * Requires lib_mcp.php. Defines functions only, a direct call does nothing.
 */

const MCP_APP_URI = 'ui://agile-poker/board'; // base; hosts get it with a content version (mcp_app_uri())
const MCP_APP_MIME = 'text/html;profile=mcp-app';
const MCP_APP_FILE = __DIR__ . '/mcp_app/board.html';
/* the whole card symbol sprite as a resource (the view reads it when a later deck needs symbols show_board did not send) */
const MCP_SYMBOLS_URI = 'ui://agile-poker/symbols';
const MCP_SYMBOLS_MIME = 'image/svg+xml';
const MCP_SYMBOLS_FILE = __DIR__ . '/../../src/cards.svg';
/* drawn on the table without a card of the deck (cards.js STATUS_CARDS) */
const MCP_STATUS_SYMBOLS = ['s-check', 's-thought', 's-mask', 's-late'];
/* largest sprite sent inline with show_board (bytes); above it the view reads MCP_SYMBOLS_URI (Fibonacci Classic with
   the two default control cards is about 57 KB, with every control card about 67 KB) */
const MCP_SYMBOLS_INLINE_MAX = 61440;
/* JSON-RPC error of resources/read for an unknown URI (MCP specification: resource not found) */
const MCP_RESOURCE_NOT_FOUND = -32002;

/* the URI of the view with a short hash of its file: hosts may cache a UI resource by its URI, so a new view after a
   deploy needs a new URI (ui://agile-poker/board-<8 hex>) */
function mcp_app_uri(): string
{
    static $uri = null;
    if ($uri === null) {
        $hash = @sha1_file(MCP_APP_FILE);
        $uri = MCP_APP_URI . '-' . substr(is_string($hash) ? $hash : '0', 0, 8);
    }
    return $uri;
}

/* the _meta of a tool that opens the view: current key and (deprecated, still read by some hosts) the flat one */
function mcp_app_tool_meta(): array
{
    return ['ui' => ['resourceUri' => mcp_app_uri()], 'ui/resourceUri' => mcp_app_uri()];
}

/* entry of resources/list */
function mcp_app_resource(): array
{
    return ['uri' => mcp_app_uri(), 'name' => 'board', 'title' => 'Agile Poker live board',
            'description' => 'Live board in the chat: who has played, the revealed result and your own cards to play.',
            'mimeType' => MCP_APP_MIME];
}

/* entry of resources/list for the symbol sprite */
function mcp_symbols_resource(): array
{
    return ['uri' => MCP_SYMBOLS_URI, 'name' => 'symbols', 'title' => 'Agile Poker card symbols',
            'description' => 'SVG sprite with all card symbols (<symbol id="s-...">) for the live board.',
            'mimeType' => MCP_SYMBOLS_MIME];
}

/* the <symbol> elements of src/cards.svg by id (our own generated file, never user data) */
function mcp_symbols_all(): array
{
    static $symbols = null;
    if ($symbols === null) {
        $svg = file_get_contents(MCP_SYMBOLS_FILE);
        if (!is_string($svg)) throw new RuntimeException('src/cards.svg not readable');
        preg_match_all('/<symbol id="([a-z0-9-]+)".*?<\/symbol>/s', $svg, $m, PREG_SET_ORDER);
        $symbols = [];
        foreach ($m as $match) $symbols[$match[1]] = $match[0];
    }
    return $symbols;
}

/* a hidden sprite with only the symbols the board needs: its deck, other cards on the table, the status cards; too
   large (MCP_SYMBOLS_INLINE_MAX): symbols_resource instead, the view reads the whole sprite with resources/read */
function mcp_symbols_for(array $board): array
{
    $deck = $board['deck'] ?? null;
    $ids = MCP_STATUS_SYMBOLS;
    if (is_array($deck)) {
        foreach (array_merge($deck['cards'], $deck['controls'], $deck['other_cards'] ?? []) as $card) {
            if (is_string($card['symbol'] ?? null)) $ids[] = $card['symbol'];
            if (($card['style'] ?? '') === 'inverted' && is_string($card['symbol'] ?? null)) $ids[] = 's-frame-inv';
        }
    }
    $all = mcp_symbols_all();
    $ids = array_values(array_filter(array_unique($ids), fn(string $id): bool => isset($all[$id])));
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'
        . implode('', array_map(fn(string $id): string => $all[$id], $ids)) . '</svg>';
    if (strlen($svg) > MCP_SYMBOLS_INLINE_MAX) return ['symbols_resource' => MCP_SYMBOLS_URI, 'symbol_ids' => $ids];
    return ['symbols' => $svg, 'symbol_ids' => $ids];
}

/* resources/read: the view itself (no csp: default inline only, no network; no domain) or the symbol sprite */
function mcp_app_read(string $uri): ?array
{
    if ($uri === MCP_SYMBOLS_URI) {
        $svg = file_get_contents(MCP_SYMBOLS_FILE);
        if (!is_string($svg)) throw new RuntimeException('src/cards.svg not readable');
        return ['contents' => [['uri' => MCP_SYMBOLS_URI, 'mimeType' => MCP_SYMBOLS_MIME, 'text' => $svg]]];
    }
    // the current versioned URI, the bare one and any older version (an old chat) all get the current view
    if ($uri !== MCP_APP_URI && preg_match('~^' . preg_quote(MCP_APP_URI, '~') . '-[0-9a-f]{8}$~D', $uri) !== 1) return null;
    $html = file_get_contents(MCP_APP_FILE);
    if (!is_string($html)) throw new RuntimeException('mcp_app/board.html not readable');
    return ['contents' => [['uri' => $uri, 'mimeType' => MCP_APP_MIME, 'text' => $html,
                            '_meta' => ['ui' => ['prefersBorder' => true]]]]];
}

/* the answer of resources/list, resources/templates/list and resources/read */
function mcp_app_resources(string|int $id, string $method, array $params): array
{
    if ($method === 'resources/list') return mcp_result_message($id, ['resources' => [mcp_app_resource(), mcp_symbols_resource()]]);
    if ($method === 'resources/templates/list') return mcp_result_message($id, ['resourceTemplates' => []]);
    $uri = $params['uri'] ?? null;
    if (!is_string($uri)) return mcp_error_message($id, MCP_INVALID_PARAMS, 'uri: required');
    $read = mcp_app_read($uri);
    return $read === null ? mcp_error_message($id, MCP_RESOURCE_NOT_FOUND, 'Resource not found.')
                          : mcp_result_message($id, $read);
}

/*
 * show_board: the board like get_board (same route, same text view), plus shown_at (ms): the view of the newest
 * show_board of a seat wins when several copies run in one conversation (supersession). The result _meta carries the
 * card symbols the view needs for this board (symbols: hidden <svg> sprite, symbol_ids).
 */
function mcp_show_board(mysqli $link, array $p, array $actor): array
{
    $board = v1_call($link, 'board_get', [], $actor);
    $text = mcp_table()['routes']['get_board']['text'] ?? null;
    $extra = ['shown_at' => (int)floor(microtime(true) * 1000)];
    if (($p['open'] ?? null) === 'next_item') $extra['open'] = 'next_item'; // the view opens its "leave this item" dialog
    return ['structured' => $board + $extra,
            'text' => is_string($text) ? $text($board) : v1_json($board),
            'meta' => mcp_symbols_for($board)]; // for the view only (result _meta), not for the model
}
