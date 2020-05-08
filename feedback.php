<?php
require 'config.php';
$id = substr( filter_input(INPUT_GET, "id", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,16);
$stars = filter_input(INPUT_GET, "stars", FILTER_SANITIZE_NUMBER_INT );
$text = substr( filter_input(INPUT_GET, "text", FILTER_SANITIZE_FULL_SPECIAL_CHARS	) ,0,1800);

$link = mysqli_init();
$success = mysqli_real_connect(
       $link, 
       _MYSQL_HOST, 
       _MYSQL_USER, 
       _MYSQL_PWD, 
       _MYSQL_DB,
       _MYSQL_PORT
);

$sql = "INSERT INTO feedback (id, fb_stars, fb_text) VALUES ('".$id."','".$stars."','".$text."')";

if (!$link->query($sql)) {
    echo 'Error: ', $link->error;
}


$link->close();

?>