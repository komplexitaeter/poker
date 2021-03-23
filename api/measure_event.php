<?php
require '../config.php';
require './lib.php';

$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$event_code = substr( filter_input(INPUT_GET, "event_code", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,1800);

$link = db_init();

$sql = $link->prepare("INSERT INTO pok_analytics_events_tbl(player_id, event_code) 
                                                            VALUES(?,?)");

$sql->bind_param("ss", $id, $event_code);
$sql->execute();

$link->close();