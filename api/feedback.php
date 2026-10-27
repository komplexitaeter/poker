<?php
require '../config.php';
require './lib.php';
require_post();

$id = get_text_param("id", 16);
$stars = (int)filter_input(INPUT_GET, "stars", FILTER_SANITIZE_NUMBER_INT );
// Store feedback text raw (trim + length limit only); escaping happens on output (B-02).
$text = get_text_param("text", 1800);

// B-57: type BUG / FEATURE / OTHER (anything else: OTHER). The technical context is only kept for bugs.
// The client never sends the team id with it, and nothing team-related is added here.
$type = strtoupper(get_text_param("type", 10));
if (!in_array($type, FEEDBACK_TYPES, true)) $type = 'OTHER';
$context = $type === 'BUG' ? get_text_param("context", 500) : '';
if ($context === '') $context = null;

$link = db_init('utf8mb4');

$sql = $link->prepare("INSERT INTO pok_feedback_tbl (id, fb_stars, fb_text, fb_type, fb_context) VALUES (?, ?, ?, ?, ?)");
$sql->bind_param('sisss', $id, $stars, $text, $type, $context);
$sql->execute();
$link->close();
