#!/usr/bin/env bash
# Starts a local copy of the poker app for the e2e tests:
# nginx (port 8080) -> PHP-FPM for the app, /poker-msg -> poker-msg WebSocket server (127.0.0.1:8443),
# MySQL database created from db_schema_pok.sql plus the pending changes in db_schema_pok_inc.sql.
#
# Usage: tests/e2e/setup.sh start|stop
#
# Requirements: nginx, php-fpm with mysqli, php-cli, composer, git, rsync, a running MySQL 8.0.
#
# Environment (all optional):
#   E2E_DIR          working directory for the app copy, configs, logs  (default: /tmp/poker-e2e)
#   E2E_PORT         HTTP port                                          (default: 8080)
#   MYSQL_ADMIN      command for admin access to MySQL                  (default: "mysql -uroot")
#   PHP_FPM          php-fpm binary                                     (default: first php-fpm* found)
#   POKER_MSG_DIR    existing poker-msg checkout                        (default: clone into E2E_DIR)
#   POKER_MSG_REF    branch to clone if POKER_MSG_DIR is not set        (default: release)
#   POKER_MSG_KEEPALIVE  ping interval of poker-msg in seconds          (default: 2, production: 30)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_DIR="${E2E_DIR:-/tmp/poker-e2e}"
E2E_PORT="${E2E_PORT:-8080}"
MYSQL_ADMIN="${MYSQL_ADMIN:-mysql -uroot}"
POKER_MSG_REF="${POKER_MSG_REF:-release}"
# short ping interval, so the tests cover several heartbeat rounds
POKER_MSG_KEEPALIVE="${POKER_MSG_KEEPALIVE:-2}"
DB_NAME=pok_e2e
DB_USER=pok_e2e
DB_PWD=pok_e2e

log() { echo "[e2e-setup] $*"; }

# values end up in generated nginx/php-fpm configs
[[ "$E2E_DIR" =~ ^[A-Za-z0-9/._-]+$ ]] || { log "invalid E2E_DIR: $E2E_DIR"; exit 2; }
[[ "$E2E_PORT" =~ ^[0-9]+$ ]] || { log "invalid E2E_PORT: $E2E_PORT"; exit 2; }

# refuse a working directory created by someone else (e.g. in /tmp)
check_owner() {
    if [[ -e "$E2E_DIR" && ! -O "$E2E_DIR" ]]; then
        log "$E2E_DIR belongs to another user" >&2
        exit 1
    fi
}

stop_pid() {
    local pidfile="$1"
    if [[ -f "$pidfile" ]]; then
        kill "$(cat "$pidfile")" 2>/dev/null || true
        rm -f "$pidfile"
    fi
}

stop() {
    check_owner
    stop_pid "$E2E_DIR/nginx.pid"
    stop_pid "$E2E_DIR/php-fpm.pid"
    stop_pid "$E2E_DIR/poker-msg.pid"
    log "stopped"
}

wait_for() {
    local what="$1"
    shift
    for _ in $(seq 1 50); do
        if "$@" >/dev/null 2>&1; then return 0; fi
        sleep 0.2
    done
    log "$what did not come up, logs in $E2E_DIR/logs:"
    tail -n 30 "$E2E_DIR"/logs/*.log >&2 || true
    exit 1
}

start() {
    stop >/dev/null
    mkdir -p -m 700 "$E2E_DIR"
    check_owner
    mkdir -p "$E2E_DIR"/{www,tmp,logs,tmp/sessions}
    rm -f "$E2E_DIR"/logs/*.log   # logs of this run only

    # --- app copy with test config (the repo's config.php stays untouched)
    rsync -a --delete --exclude .git --exclude tests --exclude node_modules --exclude .github \
        "$REPO_DIR/" "$E2E_DIR/www/"
    cat > "$E2E_DIR/www/config.php" <<EOF
<?php
error_reporting(E_ALL);
ini_set('display_errors', 'off');
ini_set('log_errors', 'on');

// TCP instead of the socket, whose path differs between PHP builds
const _MYSQL_HOST = '127.0.0.1';
const _MYSQL_USER = '$DB_USER';
const _MYSQL_PWD = '$DB_PWD';
const _MYSQL_DB = '$DB_NAME';
const _MYSQL_PORT = 3306;

// stats.php login (B-63), credentials in tests/e2e/specs/helpers.ts
const STATS_HTPASSWD = '$E2E_DIR/poker-stats.htpasswd';
EOF
    # bcrypt entry as written by "htpasswd -B"; the apr1 entry (MD5) must be rejected by stats.php
    {
        echo "e2e-admin:$(php -r 'echo password_hash("e2e-secret", PASSWORD_BCRYPT);')"
        echo 'e2e-md5:$apr1$e2e$Jw0Ue0yQnHnL0D5cR3nQ2.'
    } > "$E2E_DIR/poker-stats.htpasswd"
    log "app copied to $E2E_DIR/www"

    # --- database
    $MYSQL_ADMIN <<EOF
DROP DATABASE IF EXISTS $DB_NAME;
CREATE DATABASE $DB_NAME;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PWD';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PWD';
GRANT ALL ON $DB_NAME.* TO '$DB_USER'@'localhost';
GRANT ALL ON $DB_NAME.* TO '$DB_USER'@'127.0.0.1';
EOF
    $MYSQL_ADMIN "$DB_NAME" < "$REPO_DIR/db_schema_pok.sql"
    # pending schema changes, as on the servers before the next merge into db_schema_pok.sql (check queries -> /dev/null)
    $MYSQL_ADMIN "$DB_NAME" < "$REPO_DIR/db_schema_pok_inc.sql" > /dev/null
    log "database $DB_NAME created from db_schema_pok.sql + db_schema_pok_inc.sql"

    # --- poker-msg
    local msg_dir="${POKER_MSG_DIR:-$E2E_DIR/poker-msg}"
    if [[ -z "${POKER_MSG_DIR:-}" && ! -d "$msg_dir/.git" ]]; then
        git clone -q --depth 1 -b "$POKER_MSG_REF" https://github.com/komplexitaeter/poker-msg "$msg_dir"
    fi
    if [[ ! -d "$msg_dir/vendor" ]]; then
        composer install -q --no-interaction --working-dir="$msg_dir"
    fi
    POKER_MSG_KEEPALIVE="$POKER_MSG_KEEPALIVE" nohup php "$msg_dir/bin/msg-server.php" > "$E2E_DIR/logs/poker-msg.log" 2>&1 &
    echo $! > "$E2E_DIR/poker-msg.pid"
    wait_for "poker-msg" bash -c 'exec 3<>/dev/tcp/127.0.0.1/8443'
    log "poker-msg running on 127.0.0.1:8443"

    # --- php-fpm
    local fpm="${PHP_FPM:-$(compgen -c php-fpm | sort -r | head -1)}"
    local run_as=""
    [[ $(id -u) -eq 0 ]] && run_as="user = root
group = root"
    cat > "$E2E_DIR/php-fpm.conf" <<EOF
[global]
pid = $E2E_DIR/php-fpm.pid
error_log = $E2E_DIR/logs/php-fpm.log
daemonize = yes

[poker]
$run_as
listen = $E2E_DIR/php-fpm.sock
; nginx and php-fpm run as the same user
listen.mode = 0600
pm = static
pm.max_children = 8
catch_workers_output = yes
php_admin_value[error_log] = $E2E_DIR/logs/php-error.log
php_admin_flag[log_errors] = on
; file changes (e.g. fault injection in the app copy) take effect immediately
php_admin_flag[opcache.enable] = off
; sessions (form token in stats.php) independent of the php.ini of the runner
php_admin_value[session.save_path] = $E2E_DIR/tmp/sessions
EOF
    local fpm_args=(-y "$E2E_DIR/php-fpm.conf")
    [[ $(id -u) -eq 0 ]] && fpm_args+=(-R)
    "$fpm" "${fpm_args[@]}"
    wait_for "php-fpm" test -S "$E2E_DIR/php-fpm.sock"
    log "php-fpm running ($fpm)"

    # --- nginx (same routing as production, see poker-msg README)
    local nginx_user=""
    [[ $(id -u) -eq 0 ]] && nginx_user="user root;"
    cat > "$E2E_DIR/nginx.conf" <<EOF
$nginx_user
pid $E2E_DIR/nginx.pid;
error_log $E2E_DIR/logs/nginx-error.log;
worker_processes 1;
events { worker_connections 256; }
http {
    include /etc/nginx/mime.types;
    access_log $E2E_DIR/logs/nginx-access.log;
    client_body_temp_path $E2E_DIR/tmp/body;
    proxy_temp_path $E2E_DIR/tmp/proxy;
    fastcgi_temp_path $E2E_DIR/tmp/fastcgi;
    uwsgi_temp_path $E2E_DIR/tmp/uwsgi;
    scgi_temp_path $E2E_DIR/tmp/scgi;

    server {
        listen 127.0.0.1:$E2E_PORT;
        root $E2E_DIR/www;
        index index.php;

        location ~ \.php\$ {
            include /etc/nginx/fastcgi_params;
            fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
            fastcgi_pass unix:$E2E_DIR/php-fpm.sock;
        }

        location /poker-msg {
            proxy_pass http://127.0.0.1:8443;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 86400;
        }
    }
}
EOF
    nginx -e "$E2E_DIR/logs/nginx-error.log" -c "$E2E_DIR/nginx.conf"
    wait_for "nginx" curl -sf -o /dev/null "http://127.0.0.1:$E2E_PORT/init.html"
    # start page is rendered by index.php, so this checks PHP and the DB connection as well
    wait_for "app (index.php)" bash -c "curl -sf 'http://127.0.0.1:$E2E_PORT/' | grep -q teaminput"
    log "app running on http://127.0.0.1:$E2E_PORT/"
}

case "${1:-}" in
    start) start ;;
    stop) stop ;;
    *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
