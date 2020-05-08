<?php
function validate_team_conf($t, &$cardset) {

    $link = mysqli_init();
    mysqli_real_connect(
        $link,
        _MYSQL_HOST,
        _MYSQL_USER,
        _MYSQL_PWD,
        _MYSQL_DB,
        _MYSQL_PORT
    );

    $sql = "SELECT count(1) cnt, max(cardset) cardset FROM pok_teams_tbl WHERE id = '".$t."'";

    if ($result = $link->query($sql)) {
        $obj = $result->fetch_object();

        if ($obj->cnt==1) {
            $is_valid = true;
            $cardset = $obj->cardset;
        }
        else {
            $is_valid = false;
        }
        $result->close();
    }
    else {
        $is_valid = false;
    }

    $link->close();

    return $is_valid;
}

function validate_team($t) {
    return validate_team_conf($t, $cardset);
}