<?php
require './config.php';
require './api/lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);

if (validate_team($t)) include('board.html');
else include('init.html');