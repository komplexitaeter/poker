<?php
//$url = 'https://poker.komplexitaeter.de';
//$statusCode = 303;
//header('Location: ' . $url, true, $statusCode);
//die();
require './config.php';
require './api/lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
$tool = substr( filter_input(INPUT_GET, "tool", FILTER_SANITIZE_STRING	) ,0,50);
$team = substr( filter_input(INPUT_GET, "team", FILTER_SANITIZE_STRING	) ,0,80);
$text = substr( filter_input(INPUT_GET, "text", FILTER_SANITIZE_STRING	) ,0,300);
$preset = substr( filter_input(INPUT_GET, "preset", FILTER_SANITIZE_STRING	) ,0,300);

$link = db_init();
if (validate_team($t, $link)) include('board.html');
else {
    if (strlen($tool>0)) {
        $t = add_team($link, $team, $text, $preset);
        $t = urlencode($t);
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
        $host  = $_SERVER['HTTP_HOST'];
        $uri   = rtrim(dirname($_SERVER['PHP_SELF']), '/\\');
        header("Location: $protocol$host$uri/?t=$t");  }
    else include('init.html');
}
$link->close();
