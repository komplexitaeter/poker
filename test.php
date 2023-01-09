<?php
$start = microtime(true);
require './config.php';
require './api/lib.php';
$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
for ($i=0;$i<1000;$i++) {
    $dao = getDao($t, $id);
    $json = json_encode($dao, JSON_UNESCAPED_UNICODE);
    if ($i==0) echo $json;
}
$end = (microtime(true) - $start);
echo "<br/><br/>elapsed time: ".number_format(round($end,3),3,',','') ;