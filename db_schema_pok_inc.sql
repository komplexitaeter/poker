/* add schema updates here and merge into db_schema_pok.sql on major releases */

ALTER TABLE pok_user_tbl
    ADD hide_teaser tinyint(1) NOT NULL DEFAULT '0';
/* indexes for stats.php */
ALTER TABLE pok_analytics_events_tbl
    ADD KEY creation_date_event_code (creation_date, event_code, display_type);

ALTER TABLE pok_teams_tbl
    ADD KEY creation_date (creation_date);

ALTER TABLE pok_roundstats_tbl
    ADD KEY type_code_creation_date (type_code, creation_date);
