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

/* one reaction per user id, item and phase (UP = thumbs up, DOWN = thumbs down in the frontend, NONE = removed).
   phase: WANT while the item is PLANNED or IN_PROGRESS, DONE once it is DONE (set by vote_roadmap.php from the
   item status), so stats.php shows both phases. The app counts the latest row per user over all phases, so the
   count continues when an item is set to DONE (Andreas, 2026-11-06). */
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

/* B-57 fix: the public list counts the latest row per user (get_roadmap_items()). With a second-precision timestamp,
   two votes of a user in different phases within the same second were a tie, and the tie-breaker (current phase)
   could pick the older row (e.g. an old WANT vote over a newer NONE in the DONE phase). Microseconds make the order
   of consecutive requests unique. Run BEFORE deploying the code (works without it too, only with ties again).
   Idempotent (same definition again is a no-op in effect), backward compatible (old code writes whole seconds).
   pok_roadmap_votes_tbl is tiny, the rebuild takes well under a second. */

/* 1. check (read only): column_type timestamp, datetime_precision 0 */
select column_type, datetime_precision, column_default, extra from information_schema.columns
 where table_schema = database() and table_name = 'pok_roadmap_votes_tbl' and column_name = 'creation_date';

/* 2. change */
alter table pok_roadmap_votes_tbl
  modify column creation_date timestamp(6) not null default current_timestamp(6) on update current_timestamp(6);

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

/* B-83: the nightly pok_daily_team_stats_evt (db_jobs_pok.sql, 23:55) ran for minutes and blocked dao.php
   (UPDATE pok_players_tbl ... last_callback_time waited for its shared locks). Its correlated subqueries
   rounds_ever_played / rounds_played_last24h look up pok_roundstats_tbl per team, but there was no index with
   team_id: each active team caused a scan over all NEW_ROUND rows. This index serves both subqueries from the index
   alone (team_id = ?, type_code = 'NEW_ROUND', creation_date > ...). The second half of the fix is in
   db_jobs_pok.sql (the event reads with READ COMMITTED, i.e. without shared locks); re-create the event after this.
   Online DDL (in place, no lock): the app keeps running. Cost: one more index entry per new round (rare). */

/* 1. check (read only): table size, plan of the subquery (key type_code_creation_date, many rows), index not there yet */
select table_rows, round((data_length + index_length) / 1048576) as mb from information_schema.tables
 where table_schema = database() and table_name = 'pok_roundstats_tbl';
explain select count(1) from pok_roundstats_tbl r
 where r.team_id = 'x' and r.type_code = 'NEW_ROUND' and r.creation_date > timestampadd(DAY, -1, CURRENT_TIMESTAMP);
select index_name from information_schema.statistics
 where table_schema = database() and table_name = 'pok_roundstats_tbl' and index_name = 'team_id_type_code_creation_date';

/* 2. change: only if the index is missing (idempotent). Evening or weekend, not between 23:50 and 0:10 (the job).
   The lock wait timeout makes the ALTER give up after 5 s instead of queueing the writes behind a long query: just
   run it again. */
set session lock_wait_timeout = 5;
set @b83_sql = if((select count(1) from information_schema.statistics
                    where table_schema = database() and table_name = 'pok_roundstats_tbl'
                      and index_name = 'team_id_type_code_creation_date') = 0,
  'alter table pok_roundstats_tbl add index team_id_type_code_creation_date (team_id, type_code, creation_date),
     algorithm = inplace, lock = none',
  'select 1');
prepare b83_stmt from @b83_sql;
execute b83_stmt;
deallocate prepare b83_stmt;

/* B-85: emojis (4-byte UTF-8) in topics and names failed with HTTP 500 ("Incorrect string value"): the columns were
   utf8mb3 and the app connected with utf8 (= utf8mb3). The free-text columns become utf8mb4; db_init() in
   api/lib.php connects with utf8mb4 (works with the old columns too, so code and schema can be deployed in any order;
   until this has run, emojis still fail as before). Only the free-text columns change: id/team_id stay utf8mb3, so
   joins and indexes on them behave as before. None of the changed columns is indexed. Lossless (utf8mb4 is a
   superset of utf8mb3). Collation utf8mb4_0900_ai_ci as for the other utf8mb4 tables (B-57); case- and
   accent-insensitive like utf8mb3_general_ci, so ORDER BY p.name (player list) stays practically the same.
   pok_roundstats_tbl and pok_roundstat_details_tbl get the copies of topic and player names on every new round,
   pok_daily_teams_stats the team name (nightly job, db_jobs_pok.sql): without them a new round or the whole nightly
   job would fail as soon as a name or topic contains an emoji.
   NOT online: MySQL changes a column charset only with algorithm = copy, i.e. the table is rebuilt and writes to it
   wait until the ALTER is done (reads keep working). Duration grows with the table size (see step 1); local test:
   11 s for pok_roundstats_tbl with 1 million rows, 3 s for pok_players_tbl with 150,000 rows. Run on a weekend, one table at a time, not between 23:50 and 0:10 (nightly job). */

/* 1. check (read only): sizes and current charsets (all utf8mb3 before, all utf8mb4 after) */
select table_name, table_rows, round((data_length + index_length) / 1048576) as mb from information_schema.tables
 where table_schema = database()
   and table_name in ('pok_teams_tbl', 'pok_players_tbl', 'pok_roundstats_tbl', 'pok_roundstat_details_tbl',
                      'pok_daily_teams_stats');
select table_name, column_name, character_set_name, collation_name from information_schema.columns
 where table_schema = database()
   and (table_name, column_name) in (('pok_teams_tbl', 'name'), ('pok_teams_tbl', 'topic'), ('pok_players_tbl', 'name'),
        ('pok_roundstats_tbl', 'topic'), ('pok_roundstat_details_tbl', 'name'), ('pok_daily_teams_stats', 'name'));

/* 2. change: each ALTER only if the column is not utf8mb4 yet (idempotent). Same column definitions as before, only
   the charset changes. The lock wait timeout makes an ALTER give up after 5 s instead of queueing all writes behind
   a long query: just run it again. */
set session lock_wait_timeout = 5;

set @b85_sql = if((select character_set_name from information_schema.columns
                    where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'topic') = 'utf8mb4',
  'select 1',
  'alter table pok_teams_tbl
     modify name varchar(80) character set utf8mb4 collate utf8mb4_0900_ai_ci not null,
     modify topic varchar(2000) character set utf8mb4 collate utf8mb4_0900_ai_ci default null,
     algorithm = copy');
prepare b85_stmt from @b85_sql;
execute b85_stmt;
deallocate prepare b85_stmt;

set @b85_sql = if((select character_set_name from information_schema.columns
                    where table_schema = database() and table_name = 'pok_players_tbl' and column_name = 'name') = 'utf8mb4',
  'select 1',
  'alter table pok_players_tbl
     modify name varchar(50) character set utf8mb4 collate utf8mb4_0900_ai_ci not null,
     algorithm = copy');
prepare b85_stmt from @b85_sql;
execute b85_stmt;
deallocate prepare b85_stmt;

set @b85_sql = if((select character_set_name from information_schema.columns
                    where table_schema = database() and table_name = 'pok_roundstats_tbl' and column_name = 'topic') = 'utf8mb4',
  'select 1',
  'alter table pok_roundstats_tbl
     modify topic varchar(2000) character set utf8mb4 collate utf8mb4_0900_ai_ci default null,
     algorithm = copy');
prepare b85_stmt from @b85_sql;
execute b85_stmt;
deallocate prepare b85_stmt;

set @b85_sql = if((select character_set_name from information_schema.columns
                    where table_schema = database() and table_name = 'pok_roundstat_details_tbl' and column_name = 'name') = 'utf8mb4',
  'select 1',
  'alter table pok_roundstat_details_tbl
     modify name varchar(50) character set utf8mb4 collate utf8mb4_0900_ai_ci not null,
     algorithm = copy');
prepare b85_stmt from @b85_sql;
execute b85_stmt;
deallocate prepare b85_stmt;

/* pok_daily_teams_stats.team_creation_date has the default '0000-00-00 00:00:00' (as on live), which the strict
   sql_mode rejects when the table is rebuilt ("Invalid default value"): sql_mode without strict/zero-date checks
   for this one ALTER, restored right after. */
set @b85_sql_mode = @@session.sql_mode;
set session sql_mode = 'NO_ENGINE_SUBSTITUTION';
set @b85_sql = if(coalesce((select character_set_name from information_schema.columns
                    where table_schema = database() and table_name = 'pok_daily_teams_stats' and column_name = 'name'),
                  'utf8mb4') = 'utf8mb4', /* staging has no statistics tables: nothing to do there */
  'select 1',
  'alter table pok_daily_teams_stats
     modify name varchar(80) character set utf8mb4 collate utf8mb4_0900_ai_ci not null,
     algorithm = copy');
prepare b85_stmt from @b85_sql;
execute b85_stmt;
deallocate prepare b85_stmt;
set session sql_mode = @b85_sql_mode;

/* B-96: team setting "Tips" (board menu Board -> Team): 1 = show the tips in #round_tip (B-70/B-79), 0 = hide them
   for the whole team. Default 1: every existing and new team keeps the tips as before. Backwards compatible: old code
   never reads or writes the column. Online: MySQL 8.0 adds a column at the end of the table instantly (metadata only,
   no table copy). Deploy order: run this BEFORE deploying the new code (dao.php reads the column). */

/* 1. check (read only): MySQL version (instant needs >= 8.0.12), row format (not COMPRESSED), column not there yet */
select version(), row_format, table_rows, round((data_length + index_length) / 1048576) as mb
  from information_schema.tables where table_schema = database() and table_name = 'pok_teams_tbl';
select column_name, column_type, column_default from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'show_tips';

/* 2. change: only if the column is missing (idempotent). If MySQL refuses algorithm = instant (ERROR 1845/1846),
   replace it by "algorithm = inplace, lock = none" (online as well, rebuilds the table). The lock wait timeout makes
   the ALTER give up after 5 s instead of queueing all dao.php calls behind a long query: just run it again. */
set session lock_wait_timeout = 5;
set @b96_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'show_tips') = 0,
  'alter table pok_teams_tbl
     add column show_tips tinyint not null default 1 comment ''1 = show tips in the round column (B-96)'',
     algorithm = instant',
  'select 1');
prepare b96_stmt from @b96_sql;
execute b96_stmt;
deallocate prepare b96_stmt;

/* B-98: deck = set group/variant + single cards on/off + control cards per team (rollout 3), custom sets per team.
   Additive only: the release code never reads or writes the new columns and tables, cardset_flags stays as it is (old
   boards keep using it). Teams are migrated lazily by the app: getDao() (api/lib.php) derives deck_id/deck_cards/
   deck_controls from cardset_flags while deck_id is null, so no data update is needed here. pok_roundstats_tbl.deck_id
   is the deck of a round (snapshot, written by newround.php). Custom card keys are 'c-' + base36 id (at most 7
   characters like every card_key, never reused, rows are never deleted: changed cards become new rows).
   Online: MySQL 8.0 adds nullable columns / columns with a default at the end of a table instantly (metadata only, no
   table copy), so the size of pok_roundstats_tbl does not matter. Deploy order: run this BEFORE deploying the code
   (dao.php reads the columns). Idempotent: run it again any time. */

/* 1. check (read only): MySQL version (instant needs >= 8.0.12), row format (not COMPRESSED), sizes,
   new columns and tables not there yet */
select table_name, version(), row_format, table_rows, round((data_length + index_length) / 1048576) as mb
  from information_schema.tables
 where table_schema = database() and table_name in ('pok_teams_tbl', 'pok_roundstats_tbl');
select table_name, column_name, column_type from information_schema.columns
 where table_schema = database()
   and (table_name, column_name) in (('pok_teams_tbl', 'deck_id'), ('pok_teams_tbl', 'deck_cards'),
        ('pok_teams_tbl', 'deck_controls'), ('pok_teams_tbl', 'deck_rev'), ('pok_roundstats_tbl', 'deck_id'));
select table_name from information_schema.tables
 where table_schema = database() and table_name in ('pok_custom_sets_tbl', 'pok_custom_cards_tbl');

/* 2. change: each ALTER only if the column is missing. If MySQL refuses algorithm = instant (ERROR 1845/1846), replace
   it by "algorithm = inplace, lock = none" (online as well, rebuilds the table). The lock wait timeout makes the ALTER
   give up after 5 s instead of queueing all dao.php calls behind a long query: just run it again. Not between 23:50
   and 0:10 (nightly job reads pok_roundstats_tbl). */
set session lock_wait_timeout = 5;
set @b98_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'deck_id') = 0,
  'alter table pok_teams_tbl
     add column deck_id varchar(24) character set ascii collate ascii_bin null
       comment ''B-98: variant id from card_catalog.json or c-<id> (custom set); null = not migrated yet'',
     add column deck_cards varchar(200) character set ascii collate ascii_bin null
       comment ''B-98: active card keys (comma list) if single cards are off; null = all cards of the variant'',
     add column deck_controls varchar(40) character set ascii collate ascii_bin null
       comment ''B-98: active control card keys (comma list), empty = none'',
     add column deck_rev int not null default 0 comment ''B-98: +1 on every change of the deck or the active custom set'',
     algorithm = instant',
  'select 1');
prepare b98_stmt from @b98_sql;
execute b98_stmt;
deallocate prepare b98_stmt;

set @b98_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_roundstats_tbl' and column_name = 'deck_id') = 0,
  'alter table pok_roundstats_tbl
     add column deck_id varchar(24) character set ascii collate ascii_bin null comment ''B-98: deck of the round'',
     algorithm = instant',
  'select 1');
prepare b98_stmt from @b98_sql;
execute b98_stmt;
deallocate prepare b98_stmt;

/* custom sets of a team (rollout 3, S4). deleted = 1: soft delete (round history keeps its cards). rev: +1 per save
   (hint "someone else changed this set"). team_id with the charset of pok_teams_tbl.id (utf8mb3) for the join. */
create table if not exists pok_custom_sets_tbl (
  id int unsigned not null auto_increment primary key,
  team_id varchar(80) character set utf8mb3 collate utf8mb3_general_ci not null,
  name varchar(24) not null,
  style varchar(12) character set ascii collate ascii_bin not null default 'plain' comment 'style from card_catalog.json',
  rev int unsigned not null default 1,
  sort_order tinyint unsigned not null default 0,
  deleted tinyint not null default 0,
  creation_date timestamp not null default current_timestamp,
  update_date timestamp not null default current_timestamp on update current_timestamp,
  key ix_custom_sets_team (team_id, deleted)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;

/* cards of a custom set. A change of symbol, text or numeric value is a new row with a new card_key (heading,
   description, colour and position change in place, Andreas 2026-11-03), the old row gets active = 0 and
   is never deleted (historic rounds keep showing what was played). card_key = 'c-' + base36(id), set right after the
   insert (unique, at most 7 characters). Either symbol_id (symbol library) or value_text (at most 6 graphemes, 48 code points). */
create table if not exists pok_custom_cards_tbl (
  id int unsigned not null auto_increment primary key,
  set_id int unsigned not null,
  card_key varchar(7) character set ascii collate ascii_bin null,
  position tinyint unsigned not null,
  symbol_id varchar(32) character set ascii collate ascii_bin null,
  value_text varchar(48) null,
  heading varchar(16) null,
  description varchar(160) null,
  numeric_value decimal(10,2) null,
  color varchar(16) character set ascii collate ascii_bin not null comment 'colour token from card_catalog.json',
  active tinyint not null default 1 comment '0 = replaced or removed version',
  creation_date timestamp not null default current_timestamp,
  unique key ux_custom_cards_key (card_key),
  key ix_custom_cards_set (set_id, active)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;

/* B-98 S2: round snapshot of the whole deck. From the new deck menu on, cardset_flags no longer describes the deck
   (single cards on/off, control cards, later custom sets), so pok_roundstats_tbl additionally keeps deck_cards and
   deck_controls of the round next to deck_id (written by start_new_round() in api/lib.php). Additive, instant,
   idempotent (run it again any time), BEFORE deploying the code (newround.php writes the columns).
   Run only this block: sed -n '/^\/\* B-98 S2:/,/^\/\* end B-98 S2/p' db_schema_pok_inc.sql */
select table_name, column_name, column_type from information_schema.columns
 where table_schema = database() and table_name = 'pok_roundstats_tbl'
   and column_name in ('deck_id', 'deck_cards', 'deck_controls');

set session lock_wait_timeout = 5;
set @b98s2_sql = if((select count(1) from information_schema.columns
                      where table_schema = database() and table_name = 'pok_roundstats_tbl'
                        and column_name = 'deck_cards') = 0,
  'alter table pok_roundstats_tbl
     add column deck_cards varchar(200) character set ascii collate ascii_bin null
       comment ''B-98: active card keys of the round if single cards were off; null = all cards of the variant'',
     add column deck_controls varchar(40) character set ascii collate ascii_bin null
       comment ''B-98: active control card keys of the round (comma list)'',
     algorithm = instant',
  'select 1');
prepare b98s2_stmt from @b98s2_sql;
execute b98s2_stmt;
deallocate prepare b98s2_stmt;
/* end B-98 S2 */

/* B-104: original card of a player who changes his card after the cards were revealed (stack "card changed" on the
   board, statistics: how often teams change their estimate after the discussion). setc.php sets
   pok_players_tbl.original_card_key, start_new_round() (api/lib.php) copies it into the round snapshot
   pok_roundstat_details_tbl and clears it. Both columns are INVISIBLE: the old code inserts into
   pok_roundstat_details_tbl without a column list (insert ... select) and reads p.*, so it keeps running unchanged.
   Additive, instant (no table copy, also for the large pok_roundstat_details_tbl), idempotent (run it again any time),
   BEFORE deploying the code. Needs MySQL >= 8.0.29.
   Run only this block: sed -n '/^\/\* B-104:/,/^\/\* end B-104/p' db_schema_pok_inc.sql */
select table_name, column_name, column_type, extra from information_schema.columns
 where table_schema = database() and table_name in ('pok_players_tbl', 'pok_roundstat_details_tbl')
   and column_name = 'original_card_key';

set session lock_wait_timeout = 5;
set @b104_sql = if((select count(1) from information_schema.columns
                     where table_schema = database() and table_name = 'pok_players_tbl'
                       and column_name = 'original_card_key') = 0,
  'alter table pok_players_tbl
     add column original_card_key varchar(7) character set ascii collate ascii_bin null invisible
       comment ''B-104: card at the reveal if the player changed it afterwards, null = unchanged'',
     algorithm = instant',
  'select 1');
prepare b104_stmt from @b104_sql;
execute b104_stmt;
deallocate prepare b104_stmt;

set @b104_sql = if((select count(1) from information_schema.columns
                     where table_schema = database() and table_name = 'pok_roundstat_details_tbl'
                       and column_name = 'original_card_key') = 0,
  'alter table pok_roundstat_details_tbl
     add column original_card_key varchar(7) character set ascii collate ascii_bin null invisible
       comment ''B-104: card at the reveal if the player changed it afterwards, null = unchanged'',
     algorithm = instant',
  'select 1');
prepare b104_stmt from @b104_sql;
execute b104_stmt;
deallocate prepare b104_stmt;

select table_name, column_name, column_type, extra from information_schema.columns
 where table_schema = database() and table_name in ('pok_players_tbl', 'pok_roundstat_details_tbl')
   and column_name = 'original_card_key';
/* end B-104 */

/* B-106: deck_controls (comma list of the active control card keys) gets more room: with the shruggie and further
   control cards the list can grow beyond 40 characters. varchar(40) -> varchar(100) in pok_teams_tbl and
   pok_roundstats_tbl. Additive (only longer), no data change, the old code keeps running unchanged. ascii stays below
   256 bytes (1 length byte) -> "algorithm = inplace, lock = none" without a table rebuild (metadata only; instant is
   not available for this change). The statement is built from information_schema, so character set, collation,
   NULL/default, INVISIBLE and the comment stay as they are (MODIFY would drop them otherwise). Idempotent: only if the
   column is shorter than 100 (run it again any time). Before or after deploying the code.
   Run only this block: sed -n '/^\/\* B-106:/,/^\/\* end B-106/p' db_schema_pok_inc.sql */
select table_name, column_name, column_type, character_set_name, collation_name, is_nullable, extra
  from information_schema.columns
 where table_schema = database() and table_name in ('pok_teams_tbl', 'pok_roundstats_tbl')
   and column_name = 'deck_controls';

set session lock_wait_timeout = 5;
set @b106_sql = (select ifnull(max(if(character_maximum_length < 100,
                   concat('alter table pok_teams_tbl modify column deck_controls varchar(100)',
                          ' character set ', character_set_name, ' collate ', collation_name,
                          if(is_nullable = 'YES', ' null', ' not null'),
                          if(column_default is null, '', concat(' default ', quote(column_default))),
                          if(extra like '%INVISIBLE%', ' invisible', ''),
                          ' comment ', quote(column_comment),
                          ', algorithm = inplace, lock = none'),
                   'select 1')), 'select 1')
                   from information_schema.columns
                  where table_schema = database() and table_name = 'pok_teams_tbl'
                    and column_name = 'deck_controls');
prepare b106_stmt from @b106_sql;
execute b106_stmt;
deallocate prepare b106_stmt;

set @b106_sql = (select ifnull(max(if(character_maximum_length < 100,
                   concat('alter table pok_roundstats_tbl modify column deck_controls varchar(100)',
                          ' character set ', character_set_name, ' collate ', collation_name,
                          if(is_nullable = 'YES', ' null', ' not null'),
                          if(column_default is null, '', concat(' default ', quote(column_default))),
                          if(extra like '%INVISIBLE%', ' invisible', ''),
                          ' comment ', quote(column_comment),
                          ', algorithm = inplace, lock = none'),
                   'select 1')), 'select 1')
                   from information_schema.columns
                  where table_schema = database() and table_name = 'pok_roundstats_tbl'
                    and column_name = 'deck_controls');
prepare b106_stmt from @b106_sql;
execute b106_stmt;
deallocate prepare b106_stmt;

select table_name, column_name, column_type, character_set_name, collation_name, is_nullable, extra, column_comment
  from information_schema.columns
 where table_schema = database() and table_name in ('pok_teams_tbl', 'pok_roundstats_tbl')
   and column_name = 'deck_controls';
/* end B-106 */

/* B-98 V6: who changed the card set of a team last (the board shows "Alice changed the card set to J.U.D.G.E.").
   pok_teams_tbl.deck_changed_by = player id (pok_players_tbl.id, the UID as get_uid() reads it, B-152) of the writer,
   set by update_deck.php, custom_set_create.php and custom_set_delete.php only when the set group changes; dao.php joins the
   name (deck.changed_by). Additive, instant, idempotent (run it again any time), BEFORE deploying the code.
   Run only this block: sed -n '/^\/\* B-98 V6:/,/^\/\* end B-98 V6/p' db_schema_pok_inc.sql */
select table_name, column_name, column_type from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'deck_changed_by';

set session lock_wait_timeout = 5;
set @b98v6_sql = if((select count(1) from information_schema.columns
                      where table_schema = database() and table_name = 'pok_teams_tbl'
                        and column_name = 'deck_changed_by') = 0,
  'alter table pok_teams_tbl
     add column deck_changed_by varchar(16) character set ascii collate ascii_bin null
       comment ''B-98 V6: player id of the last change of the set group, null = unknown'',
     algorithm = instant',
  'select 1');
prepare b98v6_stmt from @b98v6_sql;
execute b98v6_stmt;
deallocate prepare b98v6_stmt;
/* end B-98 V6 */

/* B-98 emoji: card texts may be emoji (Andreas 2026-11-02), 6 graphemes, a family emoji alone has 5 code points.
   pok_custom_cards_tbl.value_text varchar(6) -> varchar(48) (code points, API limit CUSTOM_VALUE_CODEPOINTS_MAX).
   Widening within the 1-byte length prefix (48 * 4 = 192 bytes < 256): in place, no table copy. Idempotent, BEFORE
   deploying the code. Run only this block: sed -n '/^\/\* B-98 emoji:/,/^\/\* end B-98 emoji/p' db_schema_pok_inc.sql */
set session lock_wait_timeout = 5;
set @b98e_sql = if((select character_maximum_length from information_schema.columns
                     where table_schema = database() and table_name = 'pok_custom_cards_tbl'
                       and column_name = 'value_text') < 48,
  'alter table pok_custom_cards_tbl modify value_text varchar(48) null, algorithm = inplace, lock = none',
  'select 1');
prepare b98e_stmt from @b98e_sql;
execute b98e_stmt;
deallocate prepare b98e_stmt;

select table_name, column_name, column_type, character_set_name from information_schema.columns
 where table_schema = database() and table_name = 'pok_custom_cards_tbl' and column_name = 'value_text';
/* end B-98 emoji */

/* B-115: team setting "See changed cards" (board menu Board -> Results) switches B-104 off: 1 = a card changed after the
   reveal keeps its original card (stack), 0 = no original card is stored or shown. It takes effect with the next round
   (Andreas), so nobody sees an original card by switching it on afterwards: show_card_changes is the team setting,
   round_show_card_changes the snapshot of the running round (copied by start_new_round() in api/lib.php, or at once
   while no card is down, like anonymous_request_toggle -> anonymous_mode). setc.php only stores original_card_key and
   getDao() only shows it while round_show_card_changes = 1. Default 1: every team keeps B-104 as before.
   Additive, instant, idempotent (run it again any time), BEFORE deploying the code (dao.php reads the columns). The
   release code never reads or writes them (it inserts into pok_teams_tbl with a column list).
   Run only this block: sed -n '/^\/\* B-115:/,/^\/\* end B-115/p' db_schema_pok_inc.sql */
select column_name, column_type, column_default from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl'
   and column_name in ('show_card_changes', 'round_show_card_changes');

set session lock_wait_timeout = 5;
set @b115_sql = if((select count(1) from information_schema.columns
                     where table_schema = database() and table_name = 'pok_teams_tbl'
                       and column_name = 'show_card_changes') = 0,
  'alter table pok_teams_tbl
     add column show_card_changes tinyint not null default 1
       comment ''B-115: 1 = keep the original card of a card changed after the reveal (B-104), team setting'',
     add column round_show_card_changes tinyint not null default 1
       comment ''B-115: show_card_changes of the running round (snapshot at the round start)'',
     algorithm = instant',
  'select 1');
prepare b115_stmt from @b115_sql;
execute b115_stmt;
deallocate prepare b115_stmt;

select column_name, column_type, column_default from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl'
   and column_name in ('show_card_changes', 'round_show_card_changes');
/* end B-115 */

/* B-116: every team gets the example set "Animals (Example)" once (api/lib_custom.php give_example_set_locked(), lazy
   in getDao() like the migration "Our deck"). pok_teams_tbl.example_set_given = 1 once it was given (or skipped
   because the team had custom_sets_max() sets already); a deleted example set is not given again.
   Additive, instant, idempotent (run it again any time), BEFORE deploying the code.
   Run only this block: sed -n '/^\/\* B-116:/,/^\/\* end B-116/p' db_schema_pok_inc.sql */
set session lock_wait_timeout = 5;
set @b116_sql = if((select count(1) from information_schema.columns
                     where table_schema = database() and table_name = 'pok_teams_tbl'
                       and column_name = 'example_set_given') = 0,
  'alter table pok_teams_tbl
     add column example_set_given tinyint not null default 0
       comment ''B-116: 1 = the example set was given (or skipped at the set limit)'',
     algorithm = instant',
  'select 1');
prepare b116_stmt from @b116_sql;
execute b116_stmt;
deallocate prepare b116_stmt;

select table_name, column_name, column_type, column_default from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'example_set_given';
/* end B-116 */

/* B-98 backup: RUN ON LIVE BEFORE THE R3 DEPLOY (right before "git pull" of R3, after the R3 schema
   blocks above, so the deck columns exist). Keeps the old deck of every team (cardset_flags, needs_setup and the R3
   deck columns, still null on live) in pok_teams_deck_backup_r3: the lazy migration in getDao() and later
   store_team_deck() overwrite cardset_flags. No names, only the team id (to compare or restore a single team).
   Idempotent: create if missing, insert only teams not backed up yet (a second run never overwrites the first).
   read committed: insert ... select does not lock the rows of pok_teams_tbl (boards keep writing).
   Check after the deploy: tools/migration/README.md (check_deck_migration.php --verify).
   Run only this block: sed -n '/^\/\* B-98 backup:/,/^\/\* end B-98 backup/p' db_schema_pok_inc.sql */
create table if not exists pok_teams_deck_backup_r3 (
  id varchar(80) character set utf8mb3 collate utf8mb3_general_ci not null primary key,
  cardset_flags varchar(2000) character set utf8mb3 null,
  needs_setup tinyint not null,
  deck_id varchar(24) character set ascii collate ascii_bin null,
  deck_cards varchar(200) character set ascii collate ascii_bin null,
  deck_controls varchar(40) character set ascii collate ascii_bin null,
  creation_date timestamp null,
  backup_date timestamp not null default current_timestamp
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci
  comment 'B-98: decks of all teams before the R3 deploy (rollout 3)';

set session transaction isolation level read committed;
insert into pok_teams_deck_backup_r3(id, cardset_flags, needs_setup, deck_id, deck_cards, deck_controls, creation_date)
select t.id, t.cardset_flags, t.needs_setup, t.deck_id, t.deck_cards, t.deck_controls, t.creation_date
  from pok_teams_tbl t
 where not exists (select 1 from pok_teams_deck_backup_r3 b where b.id = t.id);
set session transaction isolation level repeatable read;

select (select count(*) from pok_teams_tbl) teams, (select count(*) from pok_teams_deck_backup_r3) backed_up,
       (select count(*) from pok_teams_deck_backup_r3 where deck_id is null) without_deck,
       (select max(backup_date) from pok_teams_deck_backup_r3) last_backup;
/* end B-98 backup */

/* B-52 S1: topics as a list of items per team (api/lib_topics.php). The topmost open item (status 'open', lowest
   position) is the active one (S1b: pok_teams_tbl.topic stays the team's note, independent of the items; no lazy
   takeover of the old topic, see the block B-52 S1b below). distribution = cards of the last revealed round of the item as JSON {"card_key": count},
   no person data. result_card_key: open item = card chosen by the team (result_auto = 0), null = automatic proposal
   (computed by dao.php); done item = the final result (result_auto 1 = automatic, 0 = chosen), null = no single value.
   team_id with the charset of pok_teams_tbl.id (utf8mb3) for joins.
   Additive (new table only), idempotent (run it again any time), BEFORE deploying the code, like S1b and S1d below.
   The code does NOT work without the schema in general: the topic item endpoints and get_topics.php need it. Only the
   core paths are guarded against a missing table/column (is_missing_schema_error() in api/lib.php, 1146/1054), so a
   wrong order does not break the board for all teams: dao.php (topic_items null, custom sets without aim count as
   'agree'), setc.php, newround.php and update_deck.php (the round is not stored at an item), custom sets with aim
   'agree' (create, save, example set). A set with aim 'perspectives' needs S1b.
   Run only this block: sed -n '/^\/\* B-52 S1:/,/^\/\* end B-52 S1/p' db_schema_pok_inc.sql */
select table_name from information_schema.tables
 where table_schema = database() and table_name = 'pok_topic_items_tbl';

create table if not exists pok_topic_items_tbl (
  id int unsigned not null auto_increment primary key,
  team_id varchar(80) character set utf8mb3 collate utf8mb3_general_ci not null,
  position smallint unsigned not null default 0 comment 'order of the open items (1..n), 0 for done items',
  ext_id varchar(20) null comment 'optional id of the item, e.g. a ticket number',
  heading varchar(200) not null,
  description varchar(2000) null comment 'markdown, like the old topic',
  maturity tinyint unsigned null comment 'optional: 0 new, 1 rough, 2 shaping, 3 ready; null = not set',
  status varchar(4) character set ascii collate ascii_bin not null default 'open' comment 'open | done',
  result_card_key varchar(7) character set ascii collate ascii_bin null,
  result_auto tinyint not null default 1 comment '1 = automatic (highest value), 0 = chosen by the team',
  distribution varchar(1000) character set ascii collate ascii_bin null comment 'JSON {card_key: count} of the last revealed round',
  rounds_cnt smallint unsigned not null default 0 comment 'revealed rounds played while the item was active',
  done_date timestamp null,
  creation_date timestamp not null default current_timestamp,
  update_date timestamp not null default current_timestamp on update current_timestamp,
  key ix_topic_items_team (team_id, status, position)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci
  comment 'B-52: topic items of a team';

select table_name, table_rows from information_schema.tables
 where table_schema = database() and table_name = 'pok_topic_items_tbl';
/* end B-52 S1 */

/* B-52 S1b: (1) pok_teams_tbl.topics_rev: +1 with every change of the team's topic items (api/lib_topics.php
   topic_items_write()), the board loads the lists (api/get_topics.php) only when it changed. (2) last_round_date of an
   item (last revealed round). (3) aim of a custom set: 'agree' (one agreed value) | 'perspectives' (distribution only).
   (4) pok_roundstats_tbl.topic_item_id: the active item of a round (no foreign key: items may be deleted).
   pok_teams_tbl.topic is the team's note again, independent of the items (no data change needed).
   Additive (new columns with defaults, algorithm = instant), idempotent (each ALTER only if the column is missing),
   BEFORE deploying the code (dao.php, custom sets and the topic endpoints read the new columns; which paths survive a
   missing column: see the S1 block). The S1 block must have run before. If MySQL refuses algorithm = instant (ERROR 1845/1846), replace it by "algorithm = inplace, lock = none".
   The lock wait timeout makes an ALTER give up after 5 s instead of queueing dao.php calls: just run it again.
   Not between 23:50 and 0:10 (nightly job reads pok_roundstats_tbl).
   Run only this block: sed -n '/^\/\* B-52 S1b:/,/^\/\* end B-52 S1b/p' db_schema_pok_inc.sql */
select table_name, column_name from information_schema.columns
 where table_schema = database()
   and (table_name, column_name) in (('pok_teams_tbl', 'topics_rev'), ('pok_topic_items_tbl', 'last_round_date'),
                                     ('pok_custom_sets_tbl', 'aim'), ('pok_roundstats_tbl', 'topic_item_id'));

set session lock_wait_timeout = 5;
set @b52_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'topics_rev') = 0,
  'alter table pok_teams_tbl
     add column topics_rev int not null default 0 comment ''B-52 S1b: +1 with every change of the topic items'',
     algorithm = instant',
  'select 1');
prepare b52_stmt from @b52_sql;
execute b52_stmt;
deallocate prepare b52_stmt;

set @b52_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_topic_items_tbl' and column_name = 'last_round_date') = 0,
  'alter table pok_topic_items_tbl
     add column last_round_date timestamp null comment ''B-52 S1b: end of the last revealed round of the item'',
     algorithm = instant',
  'select 1');
prepare b52_stmt from @b52_sql;
execute b52_stmt;
deallocate prepare b52_stmt;

set @b52_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_custom_sets_tbl' and column_name = 'aim') = 0,
  'alter table pok_custom_sets_tbl
     add column aim varchar(12) character set ascii collate ascii_bin not null default ''agree''
       comment ''B-52 S1b: agree | perspectives'',
     algorithm = instant',
  'select 1');
prepare b52_stmt from @b52_sql;
execute b52_stmt;
deallocate prepare b52_stmt;

set @b52_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_roundstats_tbl' and column_name = 'topic_item_id') = 0,
  'alter table pok_roundstats_tbl
     add column topic_item_id int unsigned null comment ''B-52 S1b: active topic item of the round (pok_topic_items_tbl.id)'',
     algorithm = instant',
  'select 1');
prepare b52_stmt from @b52_sql;
execute b52_stmt;
deallocate prepare b52_stmt;

select table_name, column_name, column_default from information_schema.columns
 where table_schema = database()
   and (table_name, column_name) in (('pok_teams_tbl', 'topics_rev'), ('pok_topic_items_tbl', 'last_round_date'),
                                     ('pok_custom_sets_tbl', 'aim'), ('pok_roundstats_tbl', 'topic_item_id'));
/* end B-52 S1b */

/* B-52 S1d (bug, Andreas 2026-11-13): an item only gets rounds that started while it was active.
   pok_teams_tbl.round_item_id = the topic item that was active when the first card of the running round went down
   (setc.php), null after "New round" (start_new_round()). A revealed round counts for the active item only if it is
   this item (api/lib_topics.php round_topic_item()). No foreign key (items may be deleted).
   BEFORE deploying the code: additive, algorithm = instant, idempotent. The S1b block must have run before. If MySQL
   refuses algorithm = instant (ERROR 1845/1846), use "algorithm = inplace, lock = none".
   The optional one-time update after the deploy is the separate block "Post-deploy B-52 S1d-2" below.
   Run only this block: sed -n '/^\/\* B-52 S1d/,/^\/\* end B-52 S1d/p' db_schema_pok_inc.sql */
select table_name, column_name from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'round_item_id';

set session lock_wait_timeout = 5;
set @b52_sql = if((select count(1) from information_schema.columns
                    where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'round_item_id') = 0,
  'alter table pok_teams_tbl
     add column round_item_id int unsigned null
       comment ''B-52 S1d: topic item active at the first card of the running round (pok_topic_items_tbl.id)'',
     algorithm = instant',
  'select 1');
prepare b52_stmt from @b52_sql;
execute b52_stmt;
deallocate prepare b52_stmt;

select table_name, column_name from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'round_item_id';
/* end B-52 S1d */

/* Post-deploy B-52 S1d-2: right AFTER deploying the code, optional, one time. Only needed if topic items already exist
   at the deploy (staging); on live it is not needed (no items before the deploy). Teams that have cards down at that
   moment keep their running round for their active item (otherwise it counts for no item, from the next round on
   everything is normal). Idempotent (only rows with round_item_id null).
   The header does not start with "B-52 S1d", so the sed command of the S1d block above does not pick it up.
   Run only this block: sed -n '/^\/\* Post-deploy B-52 S1d-2/,/^\/\* end Post-deploy B-52 S1d-2/p' db_schema_pok_inc.sql */
update pok_teams_tbl t
   set t.round_item_id = (select i.id from pok_topic_items_tbl i
                           where i.team_id = t.id and i.status = 'open' order by i.position, i.id limit 1)
 where t.round_item_id is null
   and exists (select 1 from pok_players_tbl p
                where p.team_id = t.id and p.player_type = 'PLAYER' and p.card_key is not null);

select count(1) teams_with_round_item from pok_teams_tbl where round_item_id is not null;
/* end Post-deploy B-52 S1d-2 */

/* B-130: timer auto-start with three values in the existing column pok_teams_tbl.timer_auto_restart (B-67, tinyint):
   0 = off, 1 = new round (unchanged meaning, existing teams keep their behaviour), 2 = next item.
   No DDL needed. Old code only restarts on = 1 and its frontend treats 2 as "off", so a 2 written by the new code
   does not break the old one. Check (read only): */
select timer_auto_restart, count(1) from pok_teams_tbl group by timer_auto_restart;
/* end B-130 */

/* B-12: one character set for everything: every text column (except the deliberate ascii/ascii_bin columns such as
   card keys, deck ids, status codes) and every table default become utf8mb4 / utf8mb4_0900_ai_ci. Until now about
   15 columns (ids, team_id, card_key, type codes, analytics, survey) were utf8mb3_general_ci, two table defaults
   latin1 (pok_active_use_stats_tbl, pok_daily_teams_stats: only the default, they have no latin1 column) and
   pok_daily_teams_stats.team_type utf8mb4_unicode_ci. utf8mb3 is deprecated in MySQL 8 and cannot hold emojis; the
   join columns (team_id, player/user id) were mixed already (B-85 changed only the free-text columns). The
   connection is utf8mb4 since B-85 (db_init() in api/lib.php), so no code change is needed in any order.
   Lossless: utf8mb4 is a superset of utf8mb3 and latin1, lengths are in characters and stay the same.

   How: one ALTER per table, built from information_schema by the procedure b12_convert() (dropped at the end): MODIFY
   of every column that is not ascii, not _bin and not utf8mb4_0900_ai_ci yet, restating type/length, NULL, default, INVISIBLE
   and comment exactly as they are, plus the table default. Not "convert to character set": that would also turn the
   deliberate ascii_bin columns into utf8mb4 and needs a second rebuild to restore them. Generated instead of written
   by hand, so live columns that differ from db_schema_pok.sql keep their definition. Idempotent: a table without
   anything left to convert is skipped ("nothing to do"), a missing table too (staging has no statistics tables).

   NOT online: a charset change is algorithm = copy (table rebuild). Reads keep working, writes to that table wait until
   its ALTER is done (PHP workers wait, nothing fails). Duration grows with the table size (step 1); local test: 5-7 s
   per 100 MB (pok_roundstat_details_tbl 3 million rows / 600 MB: 38 s, pok_analytics_events_tbl 2 million rows /
   220 MB: 14 s, pok_roundstats_tbl 1 million rows: 9 s, pok_players_tbl 200,000 rows: 2.5 s, pok_teams_tbl 100,000
   rows: 1 s); plan with two to three times that on the server. Evening or weekend, not between
   23:50 and 0:10 (nightly job pok_daily_team_stats_evt, db_jobs_pok.sql). lock_wait_timeout 5: an ALTER that cannot
   get its metadata lock within 5 s (long query on the table) gives up instead of queueing all writes behind it, just
   call it again. MySQL 8 DDL is atomic: an ALTER that fails or is killed leaves the table unchanged.

   Order: small -> large, with joins in mind. While one side of a join is utf8mb3 and the other utf8mb4, MySQL converts
   the utf8mb3 side, so an index on the utf8mb3 side cannot be used for that join (no error: different character sets
   are converted automatically, "Illegal mix of collations" only happens between two collations of the SAME charset,
   e.g. utf8mb4_unicode_ci vs. utf8mb4_0900_ai_ci). Lookups with a parameter (team_id = ?) use the index in every
   state. So: the tables looked up by team_id from pok_teams_tbl (rounds, custom sets, topic items) before
   pok_teams_tbl, then pok_players_tbl right after pok_teams_tbl. Measured in between (100,000 teams, 200,000 players):
   players first -> every new round (newround.php, join players/teams) scans pok_teams_tbl (35 ms); teams first -> only
   the rare anonymous-mode switch (update_team.php, "where p2.team_id = t.id") scans pok_players_tbl (110 ms), and
   only for the few seconds of the players ALTER. stats.php (live/usage tab) and the nightly job may be slower while
   tables are mixed: do not use stats.php meanwhile. Big tables: pok_analytics_events_tbl (grows without limit, only
   written by measure_event.php, never joined) comes last and may run separately on a weekend; the app does not need it
   converted. pok_roundstat_details_tbl, pok_roundstats_tbl (written on a new round), pok_teams_tbl and pok_players_tbl
   (written on every board load) late in the evening.

   Collation utf8mb3_general_ci -> utf8mb4_0900_ai_ci: still case- and accent-insensitive, but NO PAD (trailing
   spaces count) and some characters compare differently (e.g. 'ss' = German sharp s). A primary/unique key on a converted
   column could collide: step 2 must return no rows (and 0 trailing spaces in the join keys) before step 4. Ids are [A-Za-z0-9_-] (B-88), so no collision is
   expected. ORDER BY/GROUP BY of ascii values stay the same apart from punctuation ('_' and '-' sort before digits).

   Survey tables (pok_survey*_tbl): the survey is gone (B-136), only api/delete_user.php still deletes from
   pok_survey_votes_tbl. Converted (a few rows, milliseconds), dropping them is a separate topic.
   pok_teams_deck_backup_r3 (B-98 backup, only read by tools/migration/check_deck_migration.php): converted as well.
   New tables from now on: team_id etc. as utf8mb4_0900_ai_ci (not utf8mb3 "for the join" any more).
   Columns with a _bin collation (ascii_bin, but also e.g. utf8mb3_bin) are deliberate and never converted; step 1
   lists them.

   Backup first (live): mysqldump --single-transaction --no-tablespaces --default-character-set=utf8mb4 of the tables
   converted here (consistent, without locks; routines/events not needed, the block drops its procedure again),
   pok_analytics_events_tbl optionally as a separate dump right before its conversion. Not at the same time as step 4.
   Rollback: the code does not depend on the schema (utf8mb4 connection since B-85, works with both states), so a
   problem is fixed forward. The schema can only be restored from the dump (loses the writes since the backup); no
   reverse ALTER to utf8mb3 once 4-byte characters may be stored in the converted columns.

   Full run (E2E setup, staging): the whole block converts everything in the order of step 4, e.g.
     sed -n '/^\/\* B-12:/,/^\/\* end B-12/p' db_schema_pok_inc.sql \
       | sudo mysql --defaults-file=/etc/mysql/debian.cnf --default-character-set=utf8mb4 pok_staging
   LIVE: not like this. Interactive session (sudo mysql --defaults-file=/etc/mysql/debian.cnf
   --default-character-set=utf8mb4 --tee=<log> pok_db), then
     a) steps 1-3 (read only) and check them: step 2 (duplicates, trailing spaces) MUST be empty/0, otherwise stop;
     b) backup (see above);
     c) step 4 table by table: paste the procedure (from "drop procedure if exists b12_convert" to "delimiter ;"),
        "set session lock_wait_timeout = 5;", then one call at a time in the listed order, watching the duration;
        pok_analytics_events_tbl possibly separately on a weekend (new session: procedure + lock_wait_timeout again);
     d) step 5 (must be empty) and "drop procedure if exists b12_convert;".
   Run only this block: sed -n '/^\/\* B-12:/,/^\/\* end B-12/p' db_schema_pok_inc.sql */

/* 1. check (read only): sizes, row format, table default; the columns still to convert (only ascii, _bin and
   utf8mb4_0900_ai_ci after the change); the _bin columns (kept as they are); unique keys over columns to convert
   (checked in step 2) */
select table_name, engine, row_format, table_rows, round((data_length + index_length) / 1048576) as mb, table_collation
  from information_schema.tables
 where table_schema = database() and table_type = 'BASE TABLE'
 order by data_length + index_length;
select table_name, column_name, column_type, character_set_name, collation_name, is_nullable, column_default
  from information_schema.columns
 where table_schema = database() and character_set_name is not null
   and character_set_name <> 'ascii' and collation_name not like '%\_bin'
   and collation_name <> 'utf8mb4_0900_ai_ci'
 order by table_name, ordinal_position;
select table_name, column_name, column_type, character_set_name, collation_name
  from information_schema.columns
 where table_schema = database() and collation_name like '%\_bin'
 order by table_name, ordinal_position;
select s.table_name, s.index_name, group_concat(s.column_name order by s.seq_in_index) as cols
  from information_schema.statistics s
  join information_schema.columns c
    on c.table_schema = s.table_schema and c.table_name = s.table_name and c.column_name = s.column_name
 where s.table_schema = database() and s.non_unique = 0
 group by s.table_name, s.index_name
having sum(c.character_set_name is not null and c.character_set_name <> 'ascii'
           and c.collation_name not like '%\_bin' and c.collation_name <> 'utf8mb4_0900_ai_ci') > 0;

/* 2. pre-check (read only, MUST return no rows): duplicates under the new collation in every primary/unique key over a
   column that gets converted. One query per key, generated from information_schema (same list as in step 1). If a
   row shows up: do not convert that table, look at the rows (example = key values of one of them) and decide. */
set session group_concat_max_len = 1048576;
set @b12_sql = (select ifnull(group_concat(q separator ' union all '), 'select 1 from dual where false')
  from (select concat('select ', quote(s.table_name), ' as tbl, ', quote(s.index_name), ' as idx, count(1) as cnt, ',
                      'min(concat_ws(''|'', ',
                      group_concat(concat('`', replace(s.column_name, '`', '``'), '`') order by s.seq_in_index),
                      ')) as example from `', replace(s.table_name, '`', '``'), '` group by ',
                      group_concat(if(c.character_set_name is not null and c.character_set_name <> 'ascii'
                                        and c.collation_name not like '%\_bin',
                                      concat('convert(`', replace(s.column_name, '`', '``'),
                                             '` using utf8mb4) collate utf8mb4_0900_ai_ci'),
                                      concat('`', replace(s.column_name, '`', '``'), '`')) order by s.seq_in_index),
                      ' having count(1) > 1') as q
          from information_schema.statistics s
          join information_schema.columns c
            on c.table_schema = s.table_schema and c.table_name = s.table_name and c.column_name = s.column_name
         where s.table_schema = database() and s.non_unique = 0
         group by s.table_name, s.index_name
        having sum(c.character_set_name is not null and c.character_set_name <> 'ascii'
                   and c.collation_name not like '%\_bin' and c.collation_name <> 'utf8mb4_0900_ai_ci') > 0) as x);
prepare b12_stmt from @b12_sql;
execute b12_stmt;
deallocate prepare b12_stmt;

/* 2b. pre-check (read only, every cnt MUST be 0): trailing spaces in the join keys. utf8mb3_general_ci pads (a value
   with a trailing space equals the one without), utf8mb4_0900_ai_ci does not: such a row would silently stop matching
   its team/user. LIKE compares without padding. Full scans, pok_roundstat_details_tbl takes a while (read only). */
select 'pok_teams_tbl.id' as col, count(1) as cnt from pok_teams_tbl where id like '% '
union all select 'pok_players_tbl.team_id/id', count(1) from pok_players_tbl where team_id like '% ' or id like '% '
union all select 'pok_user_tbl.id', count(1) from pok_user_tbl where id like '% '
union all select 'pok_roundstats_tbl.team_id', count(1) from pok_roundstats_tbl where team_id like '% '
union all select 'pok_roundstat_details_tbl.team_id/player_id', count(1) from pok_roundstat_details_tbl
           where team_id like '% ' or player_id like '% '
union all select 'pok_custom_sets_tbl.team_id', count(1) from pok_custom_sets_tbl where team_id like '% '
union all select 'pok_topic_items_tbl.team_id', count(1) from pok_topic_items_tbl where team_id like '% ';

/* 3. check (read only, expected: no rows): columns that are really latin1. The two latin1 tables only have latin1 as
   table default. Should a latin1 column show up: the app wrote it through a utf8/utf8mb4 connection, so MySQL
   converted on insert and CONVERT is right; spot check before: select col, hex(col) from tbl where col <> convert(col
   using ascii) limit 20 (umlauts must show as e.g. C3A4 after the conversion, not as two characters). */
select table_name, column_name, column_type from information_schema.columns
 where table_schema = database() and character_set_name = 'latin1';

/* 4. change: b12_convert('<table>') converts one table (or says "nothing to do" / "skipped") and shows the statement
   and its duration. One call after the other; on live best one at a time (see the B-12 notes for Andreas). */
drop procedure if exists b12_convert;
delimiter ;;
create procedure b12_convert(in p_table varchar(64))
sql security invoker
begin
  declare v_exists int default 0;
  declare v_default_ok int default 0;
  declare v_row_format varchar(20) default null;
  declare v_mods text default null;
  declare v_start datetime(6) default sysdate(6);

  select count(1), ifnull(max(table_collation = 'utf8mb4_0900_ai_ci'), 0), max(row_format)
    into v_exists, v_default_ok, v_row_format
    from information_schema.tables
   where table_schema = database() and table_name = p_table and table_type = 'BASE TABLE';

  if v_exists = 0 then
    select p_table as tbl, 'skipped: table does not exist' as result;
  else
    /* an expression default or a generated column cannot be restated from information_schema: stop, do it by hand */
    if (select count(1) from information_schema.columns
         where table_schema = database() and table_name = p_table
           and character_set_name is not null and character_set_name <> 'ascii'
           and collation_name not like '%\_bin' and collation_name <> 'utf8mb4_0900_ai_ci'
           and (extra like '%GENERATED%' or generation_expression <> '')) > 0 then
      signal sqlstate '45000' set message_text = 'B-12: generated column or expression default, convert by hand';
    end if;

    set session group_concat_max_len = 1048576;
    select group_concat(concat('modify `', replace(column_name, '`', '``'), '` ', column_type,
                               ' character set utf8mb4 collate utf8mb4_0900_ai_ci',
                               if(is_nullable = 'YES', ' null', ' not null'),
                               if(column_default is null, '', concat(' default ', quote(column_default))),
                               if(extra like '%INVISIBLE%', ' invisible', ''),
                               if(column_comment = '', '', concat(' comment ', quote(column_comment))))
                        order by ordinal_position separator ', ')
      into v_mods
      from information_schema.columns
     where table_schema = database() and table_name = p_table
       and character_set_name is not null and character_set_name <> 'ascii'
       and collation_name not like '%\_bin' and collation_name <> 'utf8mb4_0900_ai_ci';

    if v_mods is null and v_default_ok = 1 then
      select p_table as tbl, 'nothing to do' as result;
    else
      /* a default '0000-00-00 ...' (pok_daily_teams_stats, as on live) is rejected by the strict sql_mode when the
         table is rebuilt ("Invalid default value", as in B-85): without NO_ZERO_IN_DATE/NO_ZERO_DATE for this table
         only, everything else (strict mode) stays. The procedure's sql_mode is restored by MySQL when it returns. */
      if (select count(1) from information_schema.columns
           where table_schema = database() and table_name = p_table and column_default like '0000-00-00%') > 0 then
        set session sql_mode = trim(both ',' from
              replace(replace(replace(replace(@@session.sql_mode, 'NO_ZERO_IN_DATE', ''), 'NO_ZERO_DATE', ''),
                              ',,', ','), ',,', ','));
      end if;
      /* COMPACT/REDUNDANT allow only 767 bytes per index column: varchar(300) utf8mb4 needs 1200 (analytics) */
      set @b12_sql = concat('alter table `', replace(p_table, '`', '``'), '` ', ifnull(concat(v_mods, ', '), ''),
                            'default character set utf8mb4 collate utf8mb4_0900_ai_ci',
                            if(v_row_format in ('Compact', 'Redundant'), ', row_format = dynamic', ''));
      prepare b12_stmt from @b12_sql;
      execute b12_stmt;
      deallocate prepare b12_stmt;
      select p_table as tbl, 'converted' as result,
             round(timestampdiff(microsecond, v_start, sysdate(6)) / 1000000, 1) as seconds, @b12_sql as statement;
    end if;
  end if;
end;;
delimiter ;

set session lock_wait_timeout = 5;
/* small tables, hardly written */
call b12_convert('pok_active_use_stats_tbl');
call b12_convert('pok_survey_tbl');
call b12_convert('pok_survey_vote_options_tbl');
call b12_convert('pok_survey_votes_tbl');
call b12_convert('pok_teams_deck_backup_r3');
call b12_convert('pok_custom_sets_tbl');
call b12_convert('pok_topic_items_tbl');
/* statistics (nightly job, Grafana) and the user table (written on the first board load of a user) */
call b12_convert('pok_daily_teams_stats');
call b12_convert('pok_user_tbl');
/* big: round history (written on a new round), then teams and right after it players (written on every board load) */
call b12_convert('pok_roundstat_details_tbl');
call b12_convert('pok_roundstats_tbl');
call b12_convert('pok_teams_tbl');
call b12_convert('pok_players_tbl');
/* biggest, grows without limit, never joined: last, may run separately on a weekend */
call b12_convert('pok_analytics_events_tbl');

drop procedure if exists b12_convert;

/* 5. check (read only, expected: no rows in both): no text column and no table default left outside utf8mb4 (except
   the ascii and _bin columns) */
select table_name, column_name, column_type, character_set_name, collation_name
  from information_schema.columns
 where table_schema = database() and character_set_name is not null
   and character_set_name <> 'ascii' and collation_name not like '%\_bin'
   and collation_name <> 'utf8mb4_0900_ai_ci';
select table_name, table_collation from information_schema.tables
 where table_schema = database() and table_type = 'BASE TABLE' and table_collation <> 'utf8mb4_0900_ai_ci';
/* end B-12 */

/* B-150: API keys (docs/api-v1-concept.md, section 5.3). One row per key; a key acts as one person (user_id) in one
   team. Only the SHA-256 of the key is stored (binary, 32 bytes) plus its last 4 characters for display. user_id and
   team_id have the collation of pok_players_tbl after B-12 (utf8mb4_0900_ai_ci), so the join of the key lookup uses
   the index. No foreign key (the schema has none): api/delete_user.php deletes the keys of a user over all teams.
   Additive, instant, idempotent (create if not exists, run it again any time), BEFORE deploying the B-150 PR 2 code
   (the v1 router and delete_user.php use the table). The release code before PR 2 never touches it.
   Run only this block: sed -n '/^\/\* B-150 keys:/,/^\/\* end B-150 keys/p' db_schema_pok_inc.sql */
/* B-150 keys: */
set session lock_wait_timeout = 5;
create table if not exists pok_api_keys_tbl (
  id int unsigned not null auto_increment primary key,
  key_hash binary(32) not null comment 'sha256 of the full key (pok_...)',
  key_hint char(4) character set ascii collate ascii_bin not null comment 'last 4 characters of the key',
  user_id varchar(16) not null comment 'pok_players_tbl.id',
  team_id varchar(80) not null comment 'pok_players_tbl.team_id',
  name varchar(40) not null comment 'chosen by the person, e.g. Jira',
  creation_date timestamp not null default current_timestamp,
  last_used_date timestamp null comment 'updated at most once an hour',
  unique key ux_api_keys_hash (key_hash),
  key ix_api_keys_user_team (user_id, team_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci
  comment 'B-150: API keys per person and team';

/* check (read only): the table and its columns */
select column_name, column_type, collation_name from information_schema.columns
 where table_schema = database() and table_name = 'pok_api_keys_tbl' order by ordinal_position;
/* end B-150 keys */

/* B-150 item keys: (docs/api-v1-concept.md, 7.2 step 3) the item key pok_topic_items_tbl.ext_id becomes required and
   unique per team (case-insensitive, collation utf8mb4_0900_ai_ci: 'tix-4' = 'TIX-4'). Order on a server:
   1. deploy the code of B-150 PR 3 (board and API always set a valid key from then on),
   2. php tools/migration/b150_item_keys.php (dry run), then with --apply (fills empty, invalid and duplicate keys),
   3. this block. The checks below must both give 0 before; if not, the alter is skipped (message 'skipped') - run the
      script with --apply again, then this block again. Idempotent (only if the unique index is missing). The table is
      small (seconds, algorithm = inplace, lock = none: reads and writes go on). The lock wait timeout makes the ALTER
      give up after 5 s instead of queueing the board's writes: just run it again.
   Run only this block: sed -n '/^\/\* B-150 item keys:/,/^\/\* end B-150 item keys/p' db_schema_pok_inc.sql */
set session lock_wait_timeout = 5;
set @b150_key_re = '^[A-Za-z0-9][A-Za-z0-9_-]{0,19}\\z';
/* check: must be 0 before the alter (empty or invalid keys; \z: no line break at the end either) */
select count(1) as b150_invalid_keys from pok_topic_items_tbl
 where ext_id is null or not regexp_like(ext_id, @b150_key_re, 'c');
/* check: must be 0 before the alter (keys used twice in a team, in the collation of the column) */
select count(1) as b150_duplicate_keys from (select team_id, ext_id from pok_topic_items_tbl
                                              where ext_id is not null group by team_id, ext_id having count(1) > 1) d;

set @b150_sql = if((select count(1) from information_schema.statistics
                     where table_schema = database() and table_name = 'pok_topic_items_tbl'
                       and index_name = 'ux_topic_items_team_key') > 0,
  'select ''already done'' as b150_item_keys',
  if((select count(1) from pok_topic_items_tbl where ext_id is null or not regexp_like(ext_id, @b150_key_re, 'c')) > 0
     or (select count(1) from (select team_id, ext_id from pok_topic_items_tbl where ext_id is not null
                                group by team_id, ext_id having count(1) > 1) d) > 0,
    'select ''skipped: run tools/migration/b150_item_keys.php --apply first'' as b150_item_keys',
    'alter table pok_topic_items_tbl
       modify ext_id varchar(20) character set utf8mb4 collate utf8mb4_0900_ai_ci not null
         comment ''B-150: item key, unique per team (API: key)'',
       add unique key ux_topic_items_team_key (team_id, ext_id),
       algorithm = inplace, lock = none'));
prepare b150_stmt from @b150_sql;
execute b150_stmt;
deallocate prepare b150_stmt;

/* check (read only): NO for is_nullable, the unique index with 2 columns */
select column_name, is_nullable, column_type, collation_name from information_schema.columns
 where table_schema = database() and table_name = 'pok_topic_items_tbl' and column_name = 'ext_id';
select index_name, non_unique, column_name, seq_in_index from information_schema.statistics
 where table_schema = database() and table_name = 'pok_topic_items_tbl' and index_name = 'ux_topic_items_team_key'
 order by seq_in_index;
/* end B-150 item keys */

/* B-151 mcp seen: pok_players_tbl.mcp_seen_time = last MCP tool call of the person (AI assistant, api/v1/lib_mcp.php
   mcp_actor() -> touch_mcp_person() in api/lib.php, at most every 10 s). getDao() shows via_ai while it is younger
   than AWAY_AFTER_SEC (the board shows a small AI symbol, Andreas 2026-11-27). null = never via MCP.
   Additive, instant, idempotent (run it again any time), BEFORE deploying the code (dao.php reads the column). The
   release code never reads or writes it.
   Run only this block: sed -n '/^\/\* B-151 mcp seen:/,/^\/\* end B-151 mcp seen/p' db_schema_pok_inc.sql */
select column_name, column_type, is_nullable from information_schema.columns
 where table_schema = database() and table_name = 'pok_players_tbl' and column_name = 'mcp_seen_time';

set session lock_wait_timeout = 5;
set @b151_seen_sql = if((select count(1) from information_schema.columns
                          where table_schema = database() and table_name = 'pok_players_tbl'
                            and column_name = 'mcp_seen_time') = 0,
  'alter table pok_players_tbl
     add column mcp_seen_time timestamp null default null
       comment ''B-151: last MCP tool call of the person (AI symbol on the board)'',
     algorithm = instant',
  'select ''already done'' as b151_mcp_seen');
prepare b151_seen_stmt from @b151_seen_sql;
execute b151_seen_stmt;
deallocate prepare b151_seen_stmt;

select column_name, column_type, is_nullable from information_schema.columns
 where table_schema = database() and table_name = 'pok_players_tbl' and column_name = 'mcp_seen_time';
/* end B-151 mcp seen */

/* B-151 mcp states: pok_players_tbl.mcp_states = the board states behind the last MCP versions of a seat
   (api/v1/lib_mcp_wait.php, JSON [[version, state], ...], at most 8; names and card texts as \u escapes, so ascii).
   The MCP version is a short hash now; wait_for_change lists the changes since one of these states, an unknown version
   gets the whole board. Deleted with the person (row of pok_players_tbl). Without the column: always the whole board.
   Additive, instant, idempotent (run it again any time), before or after deploying the code.
   Run only this block: sed -n '/^\/\* B-151 mcp states:/,/^\/\* end B-151 mcp states/p' db_schema_pok_inc.sql */
select column_name, column_type, character_set_name from information_schema.columns
 where table_schema = database() and table_name = 'pok_players_tbl' and column_name = 'mcp_states';

set session lock_wait_timeout = 5;
set @b151_states_sql = if((select count(1) from information_schema.columns
                            where table_schema = database() and table_name = 'pok_players_tbl'
                              and column_name = 'mcp_states') = 0,
  'alter table pok_players_tbl
     add column mcp_states mediumtext character set ascii collate ascii_bin null default null
       comment ''B-151: board states of the last MCP versions of the seat (wait_for_change)'',
     algorithm = instant',
  'select ''already done'' as b151_mcp_states');
prepare b151_states_stmt from @b151_states_sql;
execute b151_states_stmt;
deallocate prepare b151_states_stmt;

select column_name, column_type, character_set_name from information_schema.columns
 where table_schema = database() and table_name = 'pok_players_tbl' and column_name = 'mcp_states';
/* end B-151 mcp states */

/* B-151 allow ai: pok_teams_tbl.allow_ai = team setting "Allow AI assistants" (board settings, tab Team; Andreas,
   data protection: the team can object). 1 = on (default), 0 = every /mcp call for the team is refused with
   ai_not_allowed (api/v1/lib_mcp.php); the REST API (/api/v1, API keys) is not affected. Only the board (browser,
   api/update_team.php) changes it, never MCP.
   Additive, instant, idempotent (run it again any time), BEFORE deploying the code (dao.php and /mcp read the column).
   Run only this block: sed -n '/^\/\* B-151 allow ai:/,/^\/\* end B-151 allow ai/p' db_schema_pok_inc.sql */
select column_name, column_type, is_nullable, column_default from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'allow_ai';

set session lock_wait_timeout = 5;
set @b151_allow_ai_sql = if((select count(1) from information_schema.columns
                              where table_schema = database() and table_name = 'pok_teams_tbl'
                                and column_name = 'allow_ai') = 0,
  'alter table pok_teams_tbl
     add column allow_ai tinyint not null default 1
       comment ''B-151: team setting "Allow AI assistants", 0 = /mcp refused for the team'',
     algorithm = instant',
  'select ''already done'' as b151_allow_ai');
prepare b151_allow_ai_stmt from @b151_allow_ai_sql;
execute b151_allow_ai_stmt;
deallocate prepare b151_allow_ai_stmt;

select column_name, column_type, is_nullable, column_default from information_schema.columns
 where table_schema = database() and table_name = 'pok_teams_tbl' and column_name = 'allow_ai';
/* end B-151 allow ai */
