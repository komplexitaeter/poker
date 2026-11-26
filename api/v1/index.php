<?php
/*
 * B-150: front controller of the public API /api/v1 (docs/api-v1-concept.md). nginx sends EVERY request under
 * /api/v1/ here (location ^~ /api/v1/, fixed SCRIPT_FILENAME), so the other files of this directory are never
 * reachable or delivered as source. Routing, authentication and validation: lib_v1.php, operations: routes.php.
 */
require __DIR__ . '/../../config.php';
require __DIR__ . '/../lib.php';
require __DIR__ . '/lib_v1.php';

v1_dispatch();
