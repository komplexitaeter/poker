/* add schema updates here and merge into db_schema_pok.sql on major releases */

ALTER TABLE pok_user_tbl
    ADD hide_teaser tinyint(1) NOT NULL DEFAULT '0';