-- MySQL event jobs of pok_db (B-08)
-- Exported from Live on 2026-10-23 (mysqldump --events). Since then the bodies only got READ COMMITTED (B-83, B-87).
-- They fill the statistics tables read by the external Grafana; the app itself does not use them.
-- Requires event_scheduler = ON. Re-create with: mysql pok_db < db_jobs_pok.sql
-- (CREATE ... DEFINER needs a user with SET_USER_ID/SUPER; the definers exist on Live.)

DELIMITER ;;

-- Every minute: number of players active within the last day/hour/30/10/1 minutes.
-- B-87: READ COMMITTED like pok_daily_team_stats_evt (B-83): under REPEATABLE READ this INSERT ... SELECT set a
-- shared lock on every row of pok_players_tbl (full scan) each minute, and dao.php (UPDATE ... last_callback_time)
-- had to wait for it. Same result: one statement, one snapshot.
DROP EVENT IF EXISTS `pok_active_users_evt`;;
CREATE DEFINER=`pok_admin`@`localhost` EVENT `pok_active_users_evt`
ON SCHEDULE EVERY 1 MINUTE STARTS '2023-01-18 08:00:01'
ON COMPLETION NOT PRESERVE ENABLE
DO BEGIN
set session transaction_isolation = 'READ-COMMITTED';
insert into pok_active_user_stats
SELECT CURRENT_TIMESTAMP creation_date
      ,sum(if(timestampdiff(day, last_callback_time, CURRENT_TIMESTAMP) < 1, 1 , 0)) last_day
	  ,sum(if(timestampdiff(hour, last_callback_time, CURRENT_TIMESTAMP) < 1, 1 , 0)) last_hour
      ,sum(if(timestampdiff(minute, last_callback_time, CURRENT_TIMESTAMP) < 30, 1 , 0)) last_half_hour
      ,sum(if(timestampdiff(minute, last_callback_time, CURRENT_TIMESTAMP) < 10, 1 , 0)) last_ten_minutes
      ,sum(if(timestampdiff(minute, last_callback_time, CURRENT_TIMESTAMP) < 1, 1 , 0)) last_minute
FROM pok_players_tbl;
END;;

-- DISABLED on Live (never executed): would fill pok_active_use_stats_tbl, which therefore stays empty.
-- B-87: READ COMMITTED as above, in case it is ever enabled (same pattern: INSERT ... SELECT on pok_players_tbl).
DROP EVENT IF EXISTS `pok_active_use_evt`;;
CREATE DEFINER=`root`@`%` EVENT `pok_active_use_evt`
ON SCHEDULE EVERY 1 MINUTE STARTS '2023-01-16 11:15:03'
ON COMPLETION NOT PRESERVE DISABLE
DO BEGIN
set session transaction_isolation = 'READ-COMMITTED';
insert into pok_active_use_stats_tbl
SELECT CURRENT_TIMESTAMP creation_date
           ,count(distinct id) active_players
           ,count(DISTINCT team_id) active_teams
 FROM pok_players_tbl
WHERE last_callback_time > timestampadd(SECOND, -900, CURRENT_TIMESTAMP);
END;;

-- Daily at 23:55: one row per team that had an active player within the last 24h.
-- team_type: RECURRING if more than 2 players were active that day, else EXPLORING.
-- Note: a team with at most 2 active players is only recorded on its first day (team_age < 1).
-- related_teams_cnt: number of other teams that share a user id with this team. Some teams reuse their link,
-- others create a new team (link) for every session; shared user ids are the best available hint that
-- such teams belong together (imprecise: e.g. Scrum Masters or coaches join several teams).
-- B-83: READ COMMITTED, so the select part is a consistent (non-locking) read. Under the default REPEATABLE READ,
-- INSERT ... SELECT sets shared locks on every row it reads in pok_players_tbl, pok_teams_tbl and
-- pok_roundstats_tbl until it ends, and dao.php (UPDATE pok_players_tbl SET last_callback_time ...) had to wait.
-- Needs binlog_format ROW or MIXED (MySQL 8 default: ROW). Same result: one statement, one snapshot.
-- The index on pok_roundstats_tbl (team_id, type_code, creation_date) keeps it short (db_schema_pok_inc.sql, B-83).
-- Each event run has its own session, the SET does not affect other connections.
DROP EVENT IF EXISTS `pok_daily_team_stats_evt`;;
CREATE DEFINER=`pok_admin`@`localhost` EVENT `pok_daily_team_stats_evt`
ON SCHEDULE EVERY 1 DAY STARTS '2023-01-17 23:55:32'
ON COMPLETION NOT PRESERVE ENABLE
DO BEGIN
set session transaction_isolation = 'READ-COMMITTED';
insert into  pok_daily_teams_stats
select date(CURRENT_TIMESTAMP), x.*, case when x.active_players > 2 then 'RECURRING' else 'EXPLORING' end team_type,
(SELECT count(distinct p2.team_id)
  FROM pok_players_tbl p1, pok_players_tbl p2 where p1.team_id =x.id
and p2.id = p1.id
and p2.team_id != p1.team_id) related_teams_cnt
 from (
SELECT t.id, t.name
           ,t.creation_date
           ,timestampdiff(day, t.creation_date, CURRENT_TIMESTAMP) team_age
           ,(select count(1) from pok_roundstats_tbl r where r.team_id = t.id  AND r.type_code = 'NEW_ROUND') rounds_ever_played
            ,(select count(1) from pok_roundstats_tbl r where r.team_id = t.id AND r.type_code = 'NEW_ROUND'
              and r.creation_date >  timestampadd(DAY, -1, CURRENT_TIMESTAMP)) rounds_played_last24h
            ,(select count(1) from pok_players_tbl p where p.team_id = t.id and  p.last_callback_time > timestampadd(DAY, -1, CURRENT_TIMESTAMP)) active_players
 from pok_teams_tbl t
 where t.id in
(
SELECT DISTINCT team_id
 FROM pok_players_tbl
WHERE last_callback_time > timestampadd(DAY, -1, CURRENT_TIMESTAMP)
    )  ) as x  where x.team_age < 1 or x.active_players > 2;
END;;

DELIMITER ;
