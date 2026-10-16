<?php
require '../config.php';
require './lib.php';

$player_id = get_text_param("player_id", 16);
$team_id = get_text_param("team_id", 80);
$display_type = get_text_param("display_type", 100);

$promotions = [
    [
        'promo_headline' => 'Wanna play the agile game?',
        'promo_img_url' => 'https://www.komplexitaeter.de/wp-content/uploads/the-agile-game.webp',
        'promo_link_url' => 'https://the-agile-game.komplexitaeter.de',
        'promo_cta' => 'Play "THE AGILE GAME"!'
    ],
    // Fügen Sie hier weitere Promotion-Einträge hinzu, falls gewünscht
];

$random_promotion = $promotions[array_rand($promotions)];
$playout_delay_sec = rand(30, 300);

$link = db_init();

$sql = $link->prepare("
    INSERT INTO pok_promotions_tbl 
    (player_id, team_id, display_type, playout_delay_sec, promo_headline, promo_link_url, promo_img_url, promo_cta) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
");
$sql->bind_param(
    'sssissss',
    $player_id,
    $team_id,
    $display_type,
    $playout_delay_sec,
    $random_promotion['promo_headline'],
    $random_promotion['promo_link_url'],
    $random_promotion['promo_img_url'],
    $random_promotion['promo_cta']
);

if ($sql->execute()) {
    $promo_id = $sql->insert_id;
    $response = [
        "promo_id" => $promo_id,
        "playout_delay_sec" => $playout_delay_sec,
        "promo_headline" => $random_promotion['promo_headline'],
        "promo_link_url" => $random_promotion['promo_link_url'],
        "promo_img_url" => $random_promotion['promo_img_url'],
        "promo_cta" => $random_promotion['promo_cta']
    ];
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
} else {
    echo json_encode(["error" => "Unable to insert record."], JSON_UNESCAPED_UNICODE);
}

$link->close();
