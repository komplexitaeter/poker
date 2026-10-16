<?php
//$url = 'https://poker.komplexitaeter.de';
//$statusCode = 303;
//header('Location: ' . $url, true, $statusCode);
//die();
require './config.php';
require './api/lib.php';

$t = substr(filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ?? '', 0,80);
$tool = get_text_param("tool", 50);
$team = get_text_param("team", 80);
$text = get_text_param("text", 300);
$preset = get_text_param("preset", 80);

$link = db_init();
if (validate_team($t, $link)) include('board.html');
else {
    if (strlen($tool) > 0) {
        $t = add_team($link, $team, $text, $preset);
        $t = urlencode($t);
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
        $host  = $_SERVER['HTTP_HOST'];
        $uri   = rtrim(dirname($_SERVER['PHP_SELF']), '/\\');
        header("Location: $protocol$host$uri/?t=$t");  }
    else include('init.html');
}
$link->close();
