<?php
/*
 * B-151 (MCP Apps, docs/mcp-concept.md section 13): the live board in the chat. One UI resource
 * (ui://agile-poker/board, text/html;profile=mcp-app) that hosts with MCP Apps show for the tool show_board; hosts
 * without apps just get the board like get_board. The view (mcp_app/board.html) is a self-contained HTML document
 * (inline script and style, no network access of its own): it talks to the host via postMessage and calls our tools
 * (wait_for_change, play_card, get_board) through it.
 * Requires lib_mcp.php. Defines functions only, a direct call does nothing.
 */

const MCP_APP_URI = 'ui://agile-poker/board';
const MCP_APP_MIME = 'text/html;profile=mcp-app';
const MCP_APP_FILE = __DIR__ . '/mcp_app/board.html';
/* the whole card symbol sprite as a resource (the view reads it when a later deck needs symbols show_board did not send) */
const MCP_SYMBOLS_URI = 'ui://agile-poker/symbols';
const MCP_SYMBOLS_MIME = 'image/svg+xml';
const MCP_SYMBOLS_FILE = __DIR__ . '/../../src/cards.svg';
/* drawn on the table without a card of the deck (cards.js STATUS_CARDS) */
const MCP_STATUS_SYMBOLS = ['s-check', 's-thought', 's-mask', 's-late'];
/* JSON-RPC error of resources/read for an unknown URI (MCP specification: resource not found) */
const MCP_RESOURCE_NOT_FOUND = -32002;

/* the _meta of a tool that opens the view: current key and (deprecated, still read by some hosts) the flat one */
function mcp_app_tool_meta(): array
{
    return ['ui' => ['resourceUri' => MCP_APP_URI], 'ui/resourceUri' => MCP_APP_URI];
}

/* entry of resources/list */
function mcp_app_resource(): array
{
    return ['uri' => MCP_APP_URI, 'name' => 'board', 'title' => 'Agile Poker live board',
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

/* a hidden sprite with only the symbols the board needs: its deck, other cards on the table, the status cards */
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
    if ($uri !== MCP_APP_URI) return null;
    $html = file_get_contents(MCP_APP_FILE);
    if (!is_string($html)) throw new RuntimeException('mcp_app/board.html not readable');
    return ['contents' => [['uri' => MCP_APP_URI, 'mimeType' => MCP_APP_MIME, 'text' => $html,
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
