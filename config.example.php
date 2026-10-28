<?php
error_reporting(E_ALL);
ini_set('display_errors', 'off'); 
ini_set('log_errors', 'on');

const _MYSQL_HOST = 'localhost';
const _MYSQL_USER = 'root';
const _MYSQL_PWD = 'root';
const _MYSQL_DB = 'pok';
const _MYSQL_PORT = 3306;
// stats.php login (B-63): htpasswd file with bcrypt entries (htpasswd -B), default /etc/nginx/poker-stats.htpasswd
// const STATS_HTPASSWD = '/etc/nginx/poker-stats.htpasswd';
