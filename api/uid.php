<?php
/*
 * B-152: hands out a new user id (UID) for a browser that has none yet: POST, no parameters, answer {"id": "<16 chars>"}
 * (80 bits Base32 from random_bytes(), new_uid()). Writes nothing: the UID is registered when the person joins a team
 * (name.php) or changes a setting (update_user.php). No caching anywhere, every call gives a new UID.
 */
require '../config.php';
require './lib.php';
require_post();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('Pragma: no-cache');

echo json_encode(array('id' => new_uid()));
