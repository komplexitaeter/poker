<?php
require 'config.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_URL	) ,0,80);
$id = '';

if (strlen($t) > 0) {
    if (validate_team($t)) {
        $id = $t;
    }
    else {
        $link = mysqli_init();
        $success = mysqli_real_connect(
               $link, 
               _MYSQL_HOST, 
               _MYSQL_USER, 
               _MYSQL_PWD, 
               _MYSQL_DB,
               _MYSQL_PORT
        );

        $sql = "INSERT INTO teams(id, cardset) VALUES('".$t."','')";

        if ($result = $link->query($sql)) {
            $id = $t; 
        }
        $link->close();
    }

}

print('{"id": "'.$id.'"}');

?>
