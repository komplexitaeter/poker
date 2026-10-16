SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;


CREATE TABLE `pok_active_user_stats` (
  `creation_date` datetime NOT NULL,
  `last_day` decimal(23,0) DEFAULT NULL,
  `last_hour` decimal(23,0) DEFAULT NULL,
  `last_half_hour` decimal(23,0) DEFAULT NULL,
  `last_ten_minutes` decimal(23,0) DEFAULT NULL,
  `last_minute` decimal(23,0) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pok_active_use_stats_tbl` (
  `creation_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `active_players` bigint NOT NULL DEFAULT '0',
  `active_teams` bigint NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `pok_analytics_events_tbl` (
  `creation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `player_id` varchar(16) DEFAULT NULL,
  `event_code` varchar(300) NOT NULL,
  `display_type` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `pok_daily_teams_stats` (
  `creation_date` date DEFAULT NULL,
  `id` varchar(80) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `name` varchar(80) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `team_creation_date` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  `team_age` bigint DEFAULT NULL,
  `rounds_ever_played` bigint DEFAULT NULL,
  `rounds_played_last24h` bigint DEFAULT NULL,
  `active_players` bigint DEFAULT NULL,
  `team_type` varchar(9) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `related_teams_cnt` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `pok_feedback_tbl` (
  `datum` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `id` varchar(16) NOT NULL,
  `fb_stars` int NOT NULL,
  `fb_text` varchar(1800) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `pok_players_tbl` (
  `id` varchar(16) NOT NULL,
  `team_id` varchar(80) NOT NULL DEFAULT '',
  `mkey` int NOT NULL,
  `name` varchar(50) NOT NULL,
  `card_key` varchar(7) DEFAULT NULL,
  `last_callback_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `player_type` varchar(150) DEFAULT 'PLAYER'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `pok_promotions_tbl` (
  `id` int NOT NULL,
  `creation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `player_id` varchar(16) NOT NULL,
  `team_id` varchar(80) NOT NULL,
  `display_type` varchar(100) DEFAULT NULL,
  `playout_delay_sec` int NOT NULL,
  `promo_headline` varchar(500) NOT NULL,
  `promo_link_url` varchar(500) NOT NULL,
  `promo_img_url` varchar(500) NOT NULL,
  `promo_cta` varchar(50) NOT NULL,
  `played_out` timestamp NULL DEFAULT NULL,
  `first_expanded` timestamp NULL DEFAULT NULL,
  `expansions_count` int NOT NULL DEFAULT '0',
  `converted` timestamp NULL DEFAULT NULL,
  `cta_used` varchar(50) DEFAULT NULL,
  `hided` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pok_roundstats_tbl` (
  `id` int NOT NULL,
  `team_id` varchar(80) NOT NULL,
  `creation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `players_count` int NOT NULL,
  `type_code` varchar(50) NOT NULL DEFAULT 'NEW_ROUND',
  `timer_start_time` timestamp NULL DEFAULT NULL,
  `timer_pause_time` timestamp NULL DEFAULT NULL,
  `timer_visibility` tinyint(1) NOT NULL DEFAULT '0',
  `topic` varchar(2000) DEFAULT NULL,
  `cardset_flags` varchar(2000) DEFAULT NULL,
  `results_order` varchar(50) DEFAULT NULL,
  `show_avg` tinyint DEFAULT NULL,
  `anonymous_mode` tinyint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `pok_roundstat_details_tbl` (
  `roundstat_id` int NOT NULL DEFAULT '0',
  `player_id` varchar(16) CHARACTER SET utf8mb3 NOT NULL,
  `team_id` varchar(80) CHARACTER SET utf8mb3 NOT NULL DEFAULT '',
  `name` varchar(50) CHARACTER SET utf8mb3 NOT NULL,
  `card_key` varchar(7) CHARACTER SET utf8mb3 DEFAULT NULL,
  `player_type` varchar(150) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pok_survey_tbl` (
  `survey_id` int NOT NULL,
  `creation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `intro` varchar(400) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `pok_survey_votes_tbl` (
  `user_id` varchar(16) NOT NULL,
  `survey_id` int NOT NULL,
  `vote_option_id` int NOT NULL,
  `creation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `pok_survey_vote_options_tbl` (
  `vote_option_id` int NOT NULL,
  `survey_id` int NOT NULL,
  `text` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `pok_teams_tbl` (
  `id` varchar(80) NOT NULL,
  `creation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cardset_flags` varchar(2000) DEFAULT NULL,
  `name` varchar(80) NOT NULL,
  `timer_start_time` timestamp NULL DEFAULT NULL,
  `timer_pause_time` timestamp NULL DEFAULT NULL,
  `timer_visibility` tinyint(1) NOT NULL DEFAULT '0',
  `topic` varchar(2000) DEFAULT NULL,
  `results_order` varchar(50) NOT NULL DEFAULT 'NAME' COMMENT '[NAME|SEQUENCE|CHOOSE:NAME|CHOOSE:SEQUENCE]',
  `show_avg` tinyint NOT NULL DEFAULT '0',
  `anonymous_mode` tinyint NOT NULL DEFAULT '0',
  `anonymous_request_toggle` tinyint NOT NULL DEFAULT '0',
  `needs_setup` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `pok_user_tbl` (
  `id` varchar(16) NOT NULL,
  `creation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `color_mode` varchar(30) NOT NULL DEFAULT 'dark',
  `survey_id` int DEFAULT NULL,
  `survey_skipped` tinyint(1) NOT NULL DEFAULT '0',
  `survey_skipped_date` timestamp NULL DEFAULT NULL,
  `hide_teaser` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;


ALTER TABLE `pok_active_use_stats_tbl`
  ADD UNIQUE KEY `creation_date` (`creation_date`);

ALTER TABLE `pok_analytics_events_tbl`
  ADD KEY `creation_date` (`creation_date`),
  ADD KEY `creation_date_event_code` (`creation_date`,`event_code`,`display_type`);

ALTER TABLE `pok_daily_teams_stats`
  ADD UNIQUE KEY `creation_date` (`creation_date`,`id`);

ALTER TABLE `pok_players_tbl`
  ADD PRIMARY KEY (`id`,`team_id`),
  ADD UNIQUE KEY `u1_key` (`mkey`),
  ADD KEY `team_id` (`team_id`);

ALTER TABLE `pok_promotions_tbl`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `pok_roundstats_tbl`
  ADD PRIMARY KEY (`id`),
  ADD KEY `type_code_creation_date` (`type_code`,`creation_date`);

ALTER TABLE `pok_roundstat_details_tbl`
  ADD KEY `team_id` (`team_id`),
  ADD KEY `player_id` (`player_id`),
  ADD KEY `roundstat_id` (`roundstat_id`);

ALTER TABLE `pok_survey_tbl`
  ADD PRIMARY KEY (`survey_id`);

ALTER TABLE `pok_survey_votes_tbl`
  ADD UNIQUE KEY `user_id` (`user_id`,`vote_option_id`),
  ADD UNIQUE KEY `user_id_2` (`user_id`,`survey_id`);

ALTER TABLE `pok_survey_vote_options_tbl`
  ADD PRIMARY KEY (`vote_option_id`),
  ADD KEY `survey_id` (`survey_id`);

ALTER TABLE `pok_teams_tbl`
  ADD PRIMARY KEY (`id`),
  ADD KEY `creation_date` (`creation_date`);

ALTER TABLE `pok_user_tbl`
  ADD PRIMARY KEY (`id`);


ALTER TABLE `pok_players_tbl`
  MODIFY `mkey` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `pok_promotions_tbl`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `pok_roundstats_tbl`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `pok_survey_tbl`
  MODIFY `survey_id` int NOT NULL AUTO_INCREMENT;

ALTER TABLE `pok_survey_vote_options_tbl`
  MODIFY `vote_option_id` int NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
