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

/* cards of a custom set. Immutable: a changed card is a new row with a new card_key, the old row gets active = 0 and
   is never deleted (historic rounds keep showing what was played). card_key = 'c-' + base36(id), set right after the
   insert (unique, at most 7 characters). Either symbol_id (symbol library) or value_text (at most 6 characters). */
create table if not exists pok_custom_cards_tbl (
  id int unsigned not null auto_increment primary key,
  set_id int unsigned not null,
  card_key varchar(7) character set ascii collate ascii_bin null,
  position tinyint unsigned not null,
  symbol_id varchar(32) character set ascii collate ascii_bin null,
  value_text varchar(6) null,
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
