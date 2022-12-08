<?php
$start = microtime(true);
require './config.php';
require './api/lib.php';
for ($i=0;$i<1000;$i++) {
    $link = db_init();
    $sql = $link->prepare(" select count(1) cnt from pok_teams_tbl");
    $sql->execute();
    $result = $sql->get_result();
    $obj = $result->fetch_object();
    $link->close();
}
$end = (microtime(true) - $start);
echo "elapsed time: $end";
