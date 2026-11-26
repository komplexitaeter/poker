<?php
/*
 * B-150: front controller of the public API /api/v1 (docs/api-v1-concept.md). nginx sends EVERY request under
 * /api/v1/ here (location ^~ /api/v1/, fixed SCRIPT_FILENAME), so the other files of this directory are never
 * reachable or delivered as source. Routing, authentication and validation: lib_v1.php, operations: routes.php.
 * B-151: nginx sends /mcp here too (location = /mcp): the MCP server (lib_mcp.php, docs/mcp-concept.md), recognised by
 * DOCUMENT_URI (REQUEST_URI may carry a query).
 */
require __DIR__ . '/../../config.php';
require __DIR__ . '/../lib.php';
require __DIR__ . '/lib_v1.php';

if (($_SERVER['DOCUMENT_URI'] ?? '') === '/mcp') {
    require __DIR__ . '/lib_mcp.php';
    mcp_dispatch();
} else {
    v1_dispatch();
}
