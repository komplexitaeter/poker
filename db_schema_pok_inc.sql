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
