<?php
require '../config.php';
require './lib.php';
set_header('json');
$id = get_uid(); // B-152: header X-Poker-User, transitionally body uid or URL id


$color_mode = 'dark';


if ($id !== '') {

    $link = db_init();

    $sql = $link->prepare("select u.color_mode
                                  from pok_user_tbl u
                                 where u.id = ?
                                ;");
    $sql->bind_param('s', $id);
    $sql->execute();
    $result = $sql->get_result();
    if ($obj = $result->fetch_object()) {
        $color_mode = $obj->color_mode;
    }

    $link->close();
}

echo json_encode(array( "color_mode"=>$color_mode), JSON_UNESCAPED_UNICODE);