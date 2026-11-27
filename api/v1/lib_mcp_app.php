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

/* resources/read: the view itself; no csp (default: inline only, no network), no domain */
function mcp_app_read(string $uri): ?array
{
    if ($uri !== MCP_APP_URI) return null;
    $html = file_get_contents(MCP_APP_FILE);
    if (!is_string($html)) throw new RuntimeException('mcp_app/board.html not readable');
    return ['contents' => [['uri' => MCP_APP_URI, 'mimeType' => MCP_APP_MIME, 'text' => $html,
                            '_meta' => ['ui' => ['prefersBorder' => true]]]]];
}

/* the answer of resources/list, resources/templates/list and resources/read */
function mcp_app_resources(string|int $id, string $method, array $params): array
{
    if ($method === 'resources/list') return mcp_result_message($id, ['resources' => [mcp_app_resource()]]);
    if ($method === 'resources/templates/list') return mcp_result_message($id, ['resourceTemplates' => []]);
    $uri = $params['uri'] ?? null;
    if (!is_string($uri)) return mcp_error_message($id, MCP_INVALID_PARAMS, 'uri: required');
    $read = mcp_app_read($uri);
    return $read === null ? mcp_error_message($id, MCP_RESOURCE_NOT_FOUND, 'Resource not found.')
                          : mcp_result_message($id, $read);
}

/*
 * show_board: the board like get_board (same route, same text view), plus shown_at (ms): the view of the newest
 * show_board of a seat wins when several copies run in one conversation (supersession).
 */
function mcp_show_board(mysqli $link, array $p, array $actor): array
{
    $board = v1_call($link, 'board_get', [], $actor);
    $text = mcp_table()['routes']['get_board']['text'] ?? null;
    return ['structured' => $board + ['shown_at' => (int)floor(microtime(true) * 1000)],
            'text' => is_string($text) ? $text($board) : v1_json($board)];
}
