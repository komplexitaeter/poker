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

/* one reaction per user id and item (LOVE = heart, MEH = see-no-evil monkey in the frontend) */
create table if not exists pok_roadmap_votes_tbl (
  item_id int not null,
  user_id varchar(16) not null,
  reaction varchar(10) not null comment 'LOVE, MEH',
  creation_date timestamp not null default current_timestamp on update current_timestamp,
  primary key (item_id, user_id)
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
