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
