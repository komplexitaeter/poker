<?php
require '../config.php';
require './lib.php';

$player_id = filter_input(INPUT_GET, "player_id", FILTER_SANITIZE_STRING);
$team_id = filter_input(INPUT_GET, "team_id", FILTER_SANITIZE_STRING);
$display_type = filter_input(INPUT_GET, "display_type", FILTER_SANITIZE_STRING);

$promotions = [
    [
        'promo_headline' => 'Inspiration für eure nächste Retro gesucht?',
        'promo_img_url' => 'https://www.komplexitaeter.de/wp-content/uploads/continious_retro.png.webp',
        'promo_link_url' => 'https://www.komplexitaeter.de/methode/powerful-continuous-retro/',
        'promo_cta' => 'Mehr erfahren?'
    ],
    [
        'promo_headline' => 'Remote Zusammenarbeit mal anders?',
        'promo_img_url' => 'https://www.komplexitaeter.de/wp-content/uploads/pox_pop_free-1536x1536.png',
        'promo_link_url' => 'https://www.komplexitaeter.de/material/idea-craft-box/',
        'promo_cta' => 'Mehr erfahren?'
    ],
    [
        'promo_headline' => 'Teamentscheidungen endlich effektiv?',
        'promo_img_url' => 'https://www.komplexitaeter.de/wp-content/uploads/judge_konsententscheidung.png.webp',
        'promo_link_url' => 'https://www.komplexitaeter.de/methode/konsent-entscheidung-mit-judge/',
        'promo_cta' => 'Mehr erfahren?'
    ],
    [
        'promo_headline' => 'Wie gut kennt sich dein Team wirklich?',
        'promo_img_url' => 'https://www.komplexitaeter.de/wp-content/uploads/team_foundation.png.webp',
        'promo_link_url' => 'https://www.komplexitaeter.de/methode/team-foundation-builder/',
        'promo_cta' => 'Mehr erfahren?'
    ],
    [
        'promo_headline' => 'Wie gut funktioniert ihr als Team?',
        'promo_img_url' => 'https://www.komplexitaeter.de/wp-content/uploads/team_as_a_car-2.png.webp',
        'promo_link_url' => 'https://www.komplexitaeter.de/methode/team-as-a-car/',
        'promo_cta' => 'Mehr erfahren?'
    ],
    // Fügen Sie hier weitere Promotion-Einträge hinzu, falls gewünscht
];

$random_promotion = $promotions[array_rand($promotions)];
$playout_delay_sec = rand(2, 15) * 60;

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
