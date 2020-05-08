SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

CREATE TABLE `pok_feedback_tbl` (
                                `datum` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                `id` varchar(16) NOT NULL,
                                `fb_stars` int(11) NOT NULL,
                                `fb_text` varchar(1800) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `pok_players_tbl` (
                               `id` varchar(16) NOT NULL,
                               `team_id` varchar(80) NOT NULL DEFAULT '',
                               `mkey` int(11) NOT NULL,
                               `name` varchar(50) NOT NULL,
                               `card_key` varchar(7) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `pok_teams_tbl` (
                             `id` varchar(80) NOT NULL,
                             `creation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                             `cardset` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


ALTER TABLE `pok_players_tbl`
    ADD PRIMARY KEY (`id`,`team_id`),
    ADD UNIQUE KEY `u1_key` (`mkey`);

ALTER TABLE `pok_teams_tbl`
    ADD PRIMARY KEY (`id`);


ALTER TABLE `pok_players_tbl`
    MODIFY `mkey` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;
