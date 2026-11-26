<?php
/*
 * B-150: the routing table of the public API /api/v1 - data only, no logic (docs/api-v1-concept.md, section 3).
 * The ONE description of every operation: lib_v1.php builds the routing, the parameter validation, openapi.json and
 * the doc page /api/v1/ from it, the e2e test api-v1-examples.spec.ts runs the examples. Not reachable by URL: nginx
 * sends every request under /api/v1/ to index.php (section 13).
 *
 * Entry (key = operation id, snake_case; operationId in OpenAPI):
 *   method, path   HTTP method, path relative to /api/v1 with placeholders {name}
 *   tag            group in doc and spec (Team, Items, Keys)
 *   summary, description   English
 *   auth           none | member (API key or UID + team) | browser (UID + team only)
 *   public         optional, default true; false = not in doc/spec
 *   params         name => [in: path|query|body, type: string|integer|boolean, required, nullable, max_length,
 *                  min_length, pattern, enum, minimum, maximum, default, text (free text: trim, then check the length),
 *                  description, example]
 *   handler        function called as handler(mysqli $link, ?array $actor, array $params): ?array
 *                  (array = JSON body with the first 2xx status of responses, null = 204)
 *   responses      status => [description, schema (name in '$schemas', 'Name[]' = list), example]; first 2xx = normal case
 *   errors         error codes of the operation itself (the router adds the general ones, see v1_error_codes())
 *   example        [params => values, as => name for later placeholders {{as.path}}] - required for public routes
 * Routes with a fixed segment come before routes with a placeholder at the same place: the first match wins.
 *
 * '$schemas': response schemas (OpenAPI 3.0 schema objects). A string as a property means a reference to another
 * schema ('Team', 'Item[]'). Every object lists all its properties (additionalProperties false in the spec).
 */

return [
    'team_get' => [
        'method' => 'GET',
        'path' => '/team',
        'tag' => 'Team',
        'summary' => 'Get your team and yourself',
        'description' => 'Returns the team the key belongs to, the person the key acts as and the number of items. '
            . 'A cheap way to check that a key works.',
        'auth' => 'member',
        'params' => [],
        'handler' => 'core_team_get',
        'responses' => [
            200 => ['description' => 'Your team', 'schema' => 'TeamInfo',
                    'example' => ['team' => ['id' => '<TEAM_ID>', 'name' => 'Dolphins', 'url' => '/?t=<TEAM_ID>',
                                             'note' => 'Sprint 42 refinement'],
                                  'member' => ['name' => 'Jira', 'role' => 'observer'],
                                  'items' => ['open_count' => 4, 'done_count' => 12, 'active_key' => 'DMZ-004']]],
        ],
        'errors' => [],
        'example' => ['params' => [], 'as' => 'team_info'],
    ],

    '$schemas' => [
        'Team' => [
            'type' => 'object',
            'description' => 'A team (board).',
            'properties' => [
                'id' => ['type' => 'string', 'description' => 'Team id, the t parameter of the board link.'],
                'name' => ['type' => 'string'],
                'url' => ['type' => 'string', 'description' => 'Link to the board (relative unless the server has a base URL).'],
                'note' => ['type' => 'string', 'description' => 'The team note (markdown), "" if empty.'],
            ],
            'required' => ['id', 'name', 'url', 'note'],
        ],
        'Member' => [
            'type' => 'object',
            'description' => 'The person a key (or the board) acts as.',
            'properties' => [
                'name' => ['type' => 'string'],
                'role' => ['type' => 'string', 'enum' => ['player', 'observer', 'removed'],
                           'description' => 'player = has a seat and a card, observer = watches, removed = taken off the board by someone.'],
            ],
            'required' => ['name', 'role'],
        ],
        'TeamInfo' => [
            'type' => 'object',
            'properties' => [
                'team' => 'Team',
                'member' => 'Member',
                'items' => [
                    'type' => 'object',
                    'properties' => [
                        'open_count' => ['type' => 'integer'],
                        'done_count' => ['type' => 'integer'],
                        'active_key' => ['type' => 'string', 'nullable' => true,
                                         'description' => 'Key of the active (topmost open) item, null if there is none or it has no key.'],
                    ],
                    'required' => ['open_count', 'done_count', 'active_key'],
                ],
            ],
            'required' => ['team', 'member', 'items'],
        ],
    ],
];
