/* add schema updates here and merge into db_schema_pok.sql on major releases */

/* B-03: names and topics are stored as entered now. Until then FILTER_SANITIZE_STRING stored ' and " as
   &#39; / &#34; in team names (addteam.php, index.php) and in topics from the entry link (index.php),
   which the board displayed literally. Run once after deploying the B-03 code. */

/* 1. check (read only) */
select 'pok_teams_tbl.name' as col, count(*) as cnt from pok_teams_tbl
 where name like '%&#39;%' or name like '%&#34;%'
union all
select 'pok_teams_tbl.topic', count(*) from pok_teams_tbl
 where topic like '%&#39;%' or topic like '%&#34;%'
union all
select 'pok_roundstats_tbl.topic', count(*) from pok_roundstats_tbl
 where topic like '%&#39;%' or topic like '%&#34;%';

/* 2. fix */
update pok_teams_tbl set name = replace(replace(name, '&#39;', ''''), '&#34;', '"')
 where name like '%&#39;%' or name like '%&#34;%';
update pok_teams_tbl set topic = replace(replace(topic, '&#39;', ''''), '&#34;', '"')
 where topic like '%&#39;%' or topic like '%&#34;%';
update pok_roundstats_tbl set topic = replace(replace(topic, '&#39;', ''''), '&#34;', '"')
 where topic like '%&#39;%' or topic like '%&#34;%';

/* B-42: the sort option "Define the sort order in-game" (results_order CHOOSE:NAME / CHOOSE:SEQUENCE) is removed.
   Only NAME and SEQUENCE remain (default for new teams: SEQUENCE, set by add_team() in api/lib.php; the column
   default 'NAME' is not used by the app). Until this update has run, getDao() already treats CHOOSE:* as SEQUENCE.
   Run once after deploying the B-42 code. pok_roundstats_tbl (round history) stays untouched.
   The column comment of pok_teams_tbl.results_order still lists the CHOOSE values; it is deliberately not changed
   on live (no DDL just for a comment). */

/* 1. check (read only) */
select results_order, count(*) from pok_teams_tbl where results_order like 'CHOOSE%' group by results_order;

/* 2. fix */
update pok_teams_tbl set results_order = 'SEQUENCE' where results_order like 'CHOOSE%';

/* B-57: Ideas & Bugs - typed feedback with technical context, a public list ("roadmap") with status and
   reactions, moderation in stats.php. Run BEFORE deploying the B-57 code (feedback.php writes the new columns).
   All statements are backward compatible: the old code keeps working with the new columns and tables.
   pok_feedback_tbl is small (a few rows per day), the ALTERs rebuild it in well under a second. */

/* 1. check (read only): no fb_id/fb_type yet, charset utf8mb3; the new tables do not exist yet */
select column_name, character_set_name from information_schema.columns
 where table_schema = database() and table_name = 'pok_feedback_tbl' order by ordinal_position;
select table_name from information_schema.tables
 where table_schema = database() and table_name in ('pok_roadmap_tbl', 'pok_roadmap_votes_tbl');

/* 2. change */
/* pok_feedback_tbl: primary key (needed to tick off single rows), type, context, done date.
   A single ALTER is atomic: running it twice fails with "Duplicate column" and changes nothing. */
alter table pok_feedback_tbl
  add column fb_id int not null auto_increment primary key first,
  add column fb_type varchar(10) null comment 'BUG, FEATURE, OTHER; null for feedback before B-57',
  add column fb_context varchar(500) null comment 'technical context of a bug report (JSON text from the client), never a team id',
  add column done_date timestamp null comment 'ticked off in stats.php';

/* utf8mb4, so feedback texts may contain emojis (with utf8mb3 such an insert fails). Lossless for the existing
   utf8mb3 data, no index on the text columns, max row size 7,200 bytes for fb_text. Idempotent. */
alter table pok_feedback_tbl convert to character set utf8mb4 collate utf8mb4_0900_ai_ci;

/* public list, written by us (never user texts) */
create table if not exists pok_roadmap_tbl (
  id int not null auto_increment primary key,
  item_type varchar(10) not null default 'FEATURE' comment 'BUG, FEATURE, OTHER',
  title varchar(120) not null,
  description varchar(600) null,
  status varchar(12) not null default 'PLANNED' comment 'PLANNED, IN_PROGRESS, DONE',
  sort_order int not null default 0 comment 'ascending, then newest first',
  visible tinyint not null default 1,
  creation_date timestamp not null default current_timestamp,
  update_date timestamp not null default current_timestamp on update current_timestamp
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;

/* one reaction per user id, item and phase (UP = thumbs up, DOWN = thumbs down in the frontend).
   phase: WANT while the item is PLANNED or IN_PROGRESS, DONE once it is DONE (set by vote_roadmap.php from the
   item status), so an item set to DONE starts again at 0 in the app, and stats.php shows both phases. */
create table if not exists pok_roadmap_votes_tbl (
  item_id int not null,
  user_id varchar(16) not null,
  phase varchar(10) not null comment 'WANT, DONE',
  reaction varchar(10) not null comment 'UP, DOWN',
  creation_date timestamp not null default current_timestamp on update current_timestamp,
  primary key (item_id, user_id, phase)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;

/* seed (idempotent) */
insert into pok_roadmap_tbl (item_type, title, description, status, sort_order, visible)
select 'FEATURE', 'New look', 'Fresh console look, menus as side panel, cards that fit your screen.', 'DONE', 0, 1 from dual
 where not exists (select 1 from pok_roadmap_tbl where title = 'New look');
insert into pok_roadmap_tbl (item_type, title, description, status, sort_order, visible)
select 'FEATURE', 'See changed cards', 'If someone changes their card after the reveal, the original card stays visible underneath.', 'PLANNED', 10, 1 from dual
 where not exists (select 1 from pok_roadmap_tbl where title = 'See changed cards');
insert into pok_roadmap_tbl (item_type, title, description, status, sort_order, visible)
select 'FEATURE', 'Reveal now', 'Reveal the cards even if someone is away and has not voted yet.', 'PLANNED', 20, 1 from dual
 where not exists (select 1 from pok_roadmap_tbl where title = 'Reveal now');
insert into pok_roadmap_tbl (item_type, title, description, status, sort_order, visible)
select 'FEATURE', 'Fun reactions', 'Emoji reactions and a bit more fun on the table.', 'PLANNED', 30, 1 from dual
 where not exists (select 1 from pok_roadmap_tbl where title = 'Fun reactions');
insert into pok_roadmap_tbl (item_type, title, description, status, sort_order, visible)
select 'FEATURE', 'Custom cards', 'Your own card values and decks.', 'PLANNED', 40, 1 from dual
 where not exists (select 1 from pok_roadmap_tbl where title = 'Custom cards');

/* mark the feedback before B-57 as done, so the inbox in stats.php starts empty (Andreas, 2026-10-27) */
update pok_feedback_tbl set done_date = datum where fb_type is null and done_date is null;

/* B-57 follow-up, ONLY for staging (already has the first B-57 SQL with LOVE/MEH and without phase).
   Not needed on live: the B-57 section above already creates the final pok_roadmap_votes_tbl.
   Run BEFORE deploying the new B-57 code (vote_roadmap.php writes the phase column). */

/* 1. check (read only): no column phase yet, primary key (item_id, user_id) */
select column_name, column_key, column_default from information_schema.columns
 where table_schema = database() and table_name = 'pok_roadmap_votes_tbl' order by ordinal_position;

/* 2. change */
/* Only if the column phase is missing (so a no-op on live and in the e2e setup, which run this whole file).
   Default WANT only so the old code still running until the deploy can insert; dropped in step 3. */
set @b57_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_roadmap_votes_tbl' and column_name = 'phase') = 0,
  'alter table pok_roadmap_votes_tbl
     add column phase varchar(10) not null default ''WANT'' comment ''WANT, DONE'' after user_id,
     modify column reaction varchar(10) not null comment ''UP, DOWN'',
     drop primary key,
     add primary key (item_id, user_id, phase)',
  'select 1');
prepare b57_stmt from @b57_sql;
execute b57_stmt;
deallocate prepare b57_stmt;

/* old reactions -> new codes, phase from the current item status. Idempotent (only touches LOVE/MEH rows);
   run again after the deploy if the old code wrote LOVE/MEH in between. */
update pok_roadmap_votes_tbl v
  join pok_roadmap_tbl r on r.id = v.item_id
   set v.phase = case when r.status = 'DONE' then 'DONE' else 'WANT' end
      ,v.reaction = case v.reaction when 'LOVE' then 'UP' else 'DOWN' end
 where v.reaction in ('LOVE', 'MEH');

/* 3. after deploying the new code (no-op without a default): same column definition as on live. Idempotent. */
alter table pok_roadmap_votes_tbl alter column phase drop default;

/* B-64: index on pok_players_tbl.last_callback_time for the live tab of stats.php (reloads every 30 s while open):
   "clients active within the last 5 minutes" becomes a range scan over ~100 rows instead of a full table scan.
   Also helps pok_daily_team_stats_evt (last_callback_time > ...). stats.php works without it, just slower.
   Recommended if the check shows more than ~100,000 rows. Online DDL (in place, no lock): the app keeps running.
   Cost: one more index entry update per dao.php call (last_callback_time is set on every board load). */

/* 1. check (read only): table size, plan of the live query (type ALL = full scan), index not there yet */
select table_rows, round((data_length + index_length) / 1048576) as mb from information_schema.tables
 where table_schema = database() and table_name = 'pok_players_tbl';
explain select count(1) from pok_players_tbl where last_callback_time > now() - interval 5 minute;
select index_name from information_schema.statistics
 where table_schema = database() and table_name = 'pok_players_tbl' and index_name = 'last_callback_time';

/* 2. change: only if the index is missing (idempotent). Evening or weekend. The lock wait timeout makes the ALTER
   give up after 5 s instead of queueing all dao.php calls behind it if a long query holds the table: just run it again. */
set session lock_wait_timeout = 5;
set @b64_sql = if((select count(1) from information_schema.statistics
                    where table_schema = database() and table_name = 'pok_players_tbl' and index_name = 'last_callback_time') = 0,
  'alter table pok_players_tbl add index last_callback_time (last_callback_time), algorithm = inplace, lock = none',
  'select 1');
prepare b64_stmt from @b64_sql;
execute b64_stmt;
deallocate prepare b64_stmt;

/* B-67: timer instead of stopwatch. Per team: mode STOPWATCH (counts up, as before) or TIMER (counts down from the
   timebox to 0, then on into T+), timebox in seconds (default 5 min, only used in TIMER mode) and "auto-start on new
   round" (New round / Cancel round restart a visible timer). The defaults are the migration: every team keeps working
   exactly as before (stopwatch, no auto-start). Backwards compatible: old code never reads or writes the new columns.
   Online: MySQL 8.0 adds columns at the end of the table instantly (metadata only, no table copy, no row rewrite),
   so the size of pok_teams_tbl does not matter. Deploy order: run this BEFORE deploying the new code (dao.php reads
   the columns). */

/* 1. check (read only): table size, MySQL version (instant needs >= 8.0.12), row format (not COMPRESSED),
   new columns not there yet */
select version(), row_format, table_rows, round((data_length + index_length) / 1048576) as mb
  from information_schema.tables where table_schema = database() and table_name = 'pok_teams_tbl';
select column_name, column_type, column_default from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl'
   and column_name in ('timer_mode', 'timer_timebox', 'timer_auto_restart');

/* 2. change: only if the columns are missing (idempotent). If MySQL refuses algorithm = instant (ERROR 1845/1846),
   replace it by "algorithm = inplace, lock = none" (online as well, rebuilds the table). The lock wait timeout makes
   the ALTER give up after 5 s instead of queueing all dao.php calls behind a long query: just run it again. */
set session lock_wait_timeout = 5;
set @b67_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'timer_mode') = 0,
  'alter table pok_teams_tbl
     add column timer_mode varchar(10) not null default ''STOPWATCH'' comment ''STOPWATCH, TIMER'',
     add column timer_timebox int not null default 300 comment ''seconds, TIMER mode only'',
     add column timer_auto_restart tinyint not null default 0 comment ''1 = new/cancelled round restarts the timer'',
     algorithm = instant',
  'select 1');
prepare b67_stmt from @b67_sql;
execute b67_stmt;
deallocate prepare b67_stmt;
