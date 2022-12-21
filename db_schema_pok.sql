CREATE TABLE pok_analytics_events_tbl (
                                          creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                          player_id varchar(16) DEFAULT NULL,
                                          event_code varchar(300) NOT NULL,
                                          display_type varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE pok_feedback_tbl (
                                  datum timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                  id varchar(16) NOT NULL,
                                  fb_stars int(11) NOT NULL,
                                  fb_text varchar(1800) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE pok_players_tbl (
                                 id varchar(16) NOT NULL,
                                 team_id varchar(80) NOT NULL DEFAULT '',
                                 mkey int(11) NOT NULL,
                                 name varchar(50) NOT NULL,
                                 card_key varchar(7) DEFAULT NULL,
                                 last_callback_time timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE pok_roundstats_tbl (
                                    team_id varchar(80) NOT NULL,
                                    creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                    players_count int(11) NOT NULL,
                                    type_code varchar(50) NOT NULL DEFAULT 'NEW_ROUND',
                                    timer_start_time timestamp NULL DEFAULT NULL,
                                    timer_pause_time timestamp NULL DEFAULT NULL,
                                    timer_visibility tinyint(1) NOT NULL DEFAULT '0',
                                    topic varchar(2000) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE pok_survey_tbl (
                                survey_id int(11) NOT NULL,
                                creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                intro varchar(400) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE pok_survey_votes_tbl (
                                      user_id varchar(16) NOT NULL,
                                      survey_id int(11) NOT NULL,
                                      vote_option_id int(11) NOT NULL,
                                      creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE pok_survey_vote_options_tbl (
                                             vote_option_id int(11) NOT NULL,
                                             survey_id int(11) NOT NULL,
                                             text varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE pok_teams_tbl (
                               id varchar(80) NOT NULL,
                               creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                               cardset_flags varchar(2000) DEFAULT NULL,
                               name varchar(80) NOT NULL,
                               timer_start_time timestamp NULL DEFAULT NULL,
                               timer_pause_time timestamp NULL DEFAULT NULL,
                               timer_visibility tinyint(1) NOT NULL DEFAULT '0',
                               topic varchar(2000) DEFAULT NULL,
                               results_order varchar(50) NOT NULL DEFAULT 'NAME' COMMENT '[NAME|SEQUENCE|CHOOSE:NAME|CHOOSE:SEQUENCE]'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE pok_user_tbl (
                              id varchar(16) NOT NULL,
                              creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              color_mode varchar(30) NOT NULL DEFAULT 'dark',
                              survey_id int(11) DEFAULT NULL,
                              survey_skipped tinyint(1) NOT NULL DEFAULT '0',
                              survey_skipped_date timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


ALTER TABLE pok_analytics_events_tbl
    ADD KEY creation_date (creation_date);

ALTER TABLE pok_players_tbl
    ADD PRIMARY KEY (id,team_id),
    ADD UNIQUE KEY u1_key (mkey),
    ADD KEY team_id (team_id);

ALTER TABLE pok_survey_tbl
    ADD PRIMARY KEY (survey_id);

ALTER TABLE pok_survey_votes_tbl
    ADD UNIQUE KEY user_id (user_id,vote_option_id),
    ADD UNIQUE KEY user_id_2 (user_id,survey_id);

ALTER TABLE pok_survey_vote_options_tbl
    ADD PRIMARY KEY (vote_option_id),
    ADD KEY survey_id (survey_id);

ALTER TABLE pok_teams_tbl
    ADD PRIMARY KEY (id);

ALTER TABLE pok_user_tbl
    ADD PRIMARY KEY (id);

ALTER TABLE pok_players_tbl
    MODIFY mkey int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE pok_survey_tbl
    MODIFY survey_id int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE pok_survey_vote_options_tbl
    MODIFY vote_option_id int(11) NOT NULL AUTO_INCREMENT;

