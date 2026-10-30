<?php
require '../config.php';
require './lib.php';
require_post();

$id = get_id_param("id");
// codes like BOARD_ON_LOAD and xs/m/md/lg (script.js), so the id format fits them too (B-88)
$event_code = get_id_param("event_code", 300);
$display_type = get_id_param("display_type", 50);


$link = db_init();

$sql = $link->prepare("INSERT INTO pok_analytics_events_tbl(player_id, event_code, display_type) 
                                                            VALUES(?,?,?)");

$sql->bind_param("sss", $id, $event_code, $display_type);
$sql->execute();

$link->close();