<?php
require '../config.php';
require './lib.php';

$t = substr( filter_input(INPUT_GET, "t", FILTER_SANITIZE_STRING	) ,0,80);
$id_val = '';

if (strlen($t) <= 0) {
    $t = 'Team';
}

$link = db_init();

$id = get_team_id($t, $link);

/* determine default preset from cards.json config file */
$cards_conf = json_decode(file_get_contents('../cards.json'), true);
$cardset_flags = str_pad("", count($cards_conf["cards"]), "0", STR_PAD_RIGHT);

/* rule1: load default preset (the first preset in the config file) and set the flags accordingly */
foreach ($cards_conf["presets"][0]["index_list"] as $index ) {
    $cardset_flags = substr_replace($cardset_flags, "1", $index, 1);
}

/* rule2: by default, all flow_control relevant cards should be set as active */
foreach ($cards_conf["cards"] as $card) {
    if ($card["flow_control"]) {
        $cardset_flags = substr_replace($cardset_flags, "1", $card["index"], 1);
    }
}


$sql = $link->prepare("INSERT INTO pok_teams_tbl(id, cardset_flags, name)
                                VALUES(?,?,?)");
$sql->bind_param('sss', $id, $cardset_flags, $t);

if ($sql->execute()) {
    $id_val = $id;
}
$link->close();

print('{"id": "'.$id_val.'"}');