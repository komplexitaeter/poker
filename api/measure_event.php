<?php
require '../config.php';
require './lib.php';
require_post();

$id = get_uid(); // B-152: header X-Poker-User, transitionally body uid or URL id
// codes like BOARD_ON_LOAD and xs/m/md/lg (script.js), so the id format fits them too (B-88)
// B-152: only events of a valid UID are stored (until B-153 decides about the measure events)
if ($id === '') exit;
$event_code = get_id_param("event_code", 300);
$display_type = get_id_param("display_type", 50);


$link = db_init();

$sql = $link->prepare("INSERT INTO pok_analytics_events_tbl(player_id, event_code, display_type) 
                                                            VALUES(?,?,?)");

$sql->bind_param("sss", $id, $event_code, $display_type);
$sql->execute();

$link->close();