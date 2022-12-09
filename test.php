<?php
$start = microtime(true);
$end2 = 0;
$end3 = 0;
require './config.php';
require './api/lib.php';
$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
for ($i=0;$i<10000;$i++) {

    $start2 = microtime(true);
    $dao = getDao($t, $id);
    $end2 += (microtime(true) - $start2);

    $json = json_encode($dao, JSON_UNESCAPED_UNICODE);


    if ($i==0) echo $json;
}
$end = (microtime(true) - $start);
echo "<br/><br/>elapsed time: ".number_format(round($end,3),3,',','') ;
echo "<br/>cuml dao time: ".number_format(round($end2,3),3,',','') ;
