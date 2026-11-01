<?php
error_reporting(E_ALL);
ini_set('display_errors', 'off'); 
ini_set('log_errors', 'on');

const _MYSQL_HOST = 'localhost';
const _MYSQL_USER = 'root';
const _MYSQL_PWD = 'root';
const _MYSQL_DB = 'pok';
const _MYSQL_PORT = 3306;

// stats.php login (B-63): htpasswd file with bcrypt entries (htpasswd -B -C 12), default /etc/nginx/poker-stats.htpasswd
// const STATS_HTPASSWD = '/etc/nginx/poker-stats.htpasswd';
// required for the stats.php login, create with: php -r 'echo bin2hex(random_bytes(32)), "\n";'
// const STATS_COOKIE_SECRET = '<64 hex chars>';

// B-81: UDP port of poker-msg for notifications from the API ("pull:<team_id>" to 127.0.0.1), default 8444.
// Only needed if poker-msg runs with a different POKER_MSG_NOTIFY_PORT.
// const _POKER_MSG_NOTIFY_PORT = 8444;
