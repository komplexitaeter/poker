<?php
require '../config.php';
require './lib.php';
require './lib_core_feedback.php';
require_post();

$id = get_uid(); // B-152: header X-Poker-User, transitionally body uid or URL id
// no feedback without a valid id (B-88); the client always sends its SID
if ($id === '') exit;
$stars = (int)filter_input(INPUT_GET, "stars", FILTER_SANITIZE_NUMBER_INT );
// Store feedback text raw (trim + length limit only); escaping happens on output (B-02).
$text = get_text_param("text", FEEDBACK_TEXT_MAX);

// B-57: type BUG / FEATURE / OTHER (anything else: OTHER). The technical context is only kept for bugs.
// The client never sends the team id with it, and nothing team-related is added here.
$type = strtoupper(get_text_param("type", 10));
$context = $type === 'BUG' ? get_text_param("context", FEEDBACK_CONTEXT_MAX) : '';

$link = db_init();
core_feedback_send($link, $id, $type, $text, $stars, $context); // B-151: shared with MCP feedback send
$link->close();
