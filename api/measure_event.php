<?php
require '../config.php';
require './lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$event_code = substr( filter_input(INPUT_GET, "event_code", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,300);
$display_type = substr( filter_input(INPUT_GET, "display_type", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,50);


$link = db_init();

$sql = $link->prepare("INSERT INTO pok_analytics_events_tbl(player_id, event_code, display_type) 
                                                            VALUES(?,?,?)");

$sql->bind_param("sss", $id, $event_code, $display_type);
$sql->execute();

$link->close();