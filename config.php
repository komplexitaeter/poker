<?php
error_reporting(E_ALL);
ini_set('display_errors', 'off'); 
ini_set('log_errors', 'on');

define('_MYSQL_HOST', 'localhost');
define('_MYSQL_USER', 'root');
define('_MYSQL_PWD', 'root');
define('_MYSQL_DB', 'cards_online');
define('_MYSQL_PORT', 3306);

function validate_team_conf($t, &$cardset) {
    
    $isvalid = false;

    $link = mysqli_init();
    $success = mysqli_real_connect(
       $link, 
       _MYSQL_HOST, 
       _MYSQL_USER, 
       _MYSQL_PWD, 
       _MYSQL_DB,
       _MYSQL_PORT
    );

    $sql = "SELECT count(1) cnt, max(cardset) cardset FROM teams WHERE id = '".$t."'";

    if ($result = $link->query($sql)) {
        $obj = $result->fetch_object();

        if ($obj->cnt==1) {
            $isvalid = true;
            $cardset = $obj->cardset;
        }
        else {
            $isvalid = false;
        }
        $result->close();
    }
    else {
        $isvalid = false;
    }

    $link->close();

    return $isvalid;
 }

 function validate_team($t) {
    return validate_team_conf($t, $cardset);
 }
?>