#!/bin/bash
# Copy of the cron script that fills pok_active_use_stats_tbl (stats.php, Trends "Active use"; Grafana "Active Use").
# Runs on live from /home/ubuntu/poker/scripts/measure_active_use_evt.sh via the crontab of user ubuntu
# (* * * * * /bin/bash /home/ubuntu/poker/scripts/measure_active_use_evt.sh), MySQL login as os_usr over the local
# socket (no password). Not deployed from here: keep this file and the server copy in sync by hand.
# every minute (cron): current poker-msg connections and teams -> pok_active_use_stats_tbl (Grafana "Active Use")
LOG=/home/ubuntu/poker/logs/poker-msg_info.log
A=$(tail -n 5000 "$LOG" | grep -o 'active_users=[0-9]*' | tail -n 1 | cut -d= -f2)
B=$(tail -n 5000 "$LOG" | grep -o 'active_teams=[0-9]*' | tail -n 1 | cut -d= -f2)
# right after a log rotation there may be no value yet: write nothing instead of a broken insert
[ -n "$A" ] && [ -n "$B" ] || exit 0
echo "insert into pok_active_use_stats_tbl(active_players, active_teams) values ($A,$B);" | mysql -u os_usr pok_db
