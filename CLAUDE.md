# CLAUDE.md – Agile Poker (komplexitaeter)

Planning-Poker-Webanwendung für verteilte Teams. Live: https://poker.komplexitaeter.de
(bzw. https://app.komplexitaeter.de). Lizenz: GPL-3.0.

> Entwurf vom 2026-10-16. Abschnitte mit **(offen)** sind noch nicht abgestimmt.

## Systemüberblick

Die Anwendung besteht aus zwei Repositories:

| Repo | Zweck | Laufzeit |
|---|---|---|
| `komplexitaeter/poker` (dieses) | Web-App: HTML/CSS/JS-Frontend, PHP-API, MySQL-Schema | nginx + PHP 8.1-FPM |
| `komplexitaeter/poker-msg` | WebSocket-Benachrichtigungsserver (Ratchet, `cboden/ratchet ^0.4`) | PHP-CLI unter supervisor, `127.0.0.1:8443` |

Datenfluss bei einer Änderung am Board:

1. Client ruft per `fetch` einen Endpunkt in `api/*.php` auf (GET-Parameter, auch für schreibende Aktionen).
2. Danach sendet der Client `push` über den WebSocket (`/poker-msg`, von nginx auf `127.0.0.1:8443` weitergeleitet).
3. `poker-msg` schickt allen Verbindungen mit derselben Team-Subscription (`subscribe:<team_id>`) ein `pull`.
4. Die Clients laden daraufhin den Zustand neu (`api/name.php`).

`poker-msg` kennt keine Daten und keine Datenbank; es verteilt nur „pull“-Signale pro Team. Zustand liegt komplett in MySQL.

## Struktur `poker`

- `index.php` – Einstieg: gültige Team-ID (`?t=`) → `board.html`, sonst `init.html` bzw. Team anlegen.
- `board.html`, `init.html` – Seiten, kein Template-System.
- `script/script.js` – gesamte Board-Logik (Vanilla JS, globale `g*`-Variablen), `script_feedback.js`, `script_team.js`.
  `script/types.ts` beschreibt nur JSON-Typen, es gibt keinen TypeScript-Build.
- `style/style.css` – ein Stylesheet, Light/Dark-Mode.
- `api/*.php` – ein Skript pro Aktion; gemeinsame Funktionen in `api/lib.php` (`db_init()`, `validate_team()`, …).
- `cards.json` – Kartensets und Sortierung.
- `stats.php` – interne Nutzungsstatistik (keine Authentifizierung).
- `db_schema_pok.sql` – Basisschema; `db_schema_pok_inc.sql` – inkrementelle Änderungen seit dem letzten Merge.
- `src/` – Bilder; `src/xcf/` – GIMP-Quelldateien der Karten.
- `config.php` – DB-Zugangsdaten (im Repo nur Platzhalter).

Es gibt keinen Build-Schritt, kein Composer/npm im Haupt-Repo, keine Tests, kein CI.

## Datenbank

MySQL 8.0, Datenbank `pok_db`, App-User `pok_usr`. Tabellen: `pok_teams_tbl`, `pok_players_tbl`, `pok_user_tbl`,
`pok_roundstats_tbl`, `pok_roundstat_details_tbl`, `pok_analytics_events_tbl`, `pok_feedback_tbl`,
`pok_promotions_tbl`, `pok_survey_tbl`, `pok_survey_votes_tbl`, `pok_survey_vote_options_tbl`.

**Achtung:** Die Schema-Dateien sind nicht vollständig. Der Code nutzt u. a. `pok_roundstat_details_tbl`,
`pok_promotions_tbl` und die Spalten `player_type`, `show_avg`, `anonymous_mode`, die in keiner Schema-Datei stehen.
Maßgeblich ist bis auf Weiteres die Produktions-DB. Schemaänderungen kommen immer zusätzlich in `db_schema_pok_inc.sql`.

`pok_analytics_events_tbl` wächst unbegrenzt. Abfragen darauf immer über einen Zeitbereich auf `creation_date`
(indexfähig, keine Funktion auf der Spalte) und mit `/*+ MAX_EXECUTION_TIME(...) */` bei Auswertungen.

## Betrieb (Produktion)

- VPS Ubuntu 22.04, nginx, PHP 8.1-FPM, MySQL 8.0.
- Code: `/home/ubuntu/poker/public_html/`.
- Admin-Zugriff DB: `sudo mysql --defaults-file=/etc/mysql/debian.cnf`.
- MySQL lauscht auf `0.0.0.0:3306` – bewusst, weil eine **externe Grafana-Instanz** (`grafana_usr`) darauf zugreift.
  Nicht ohne Rücksprache auf 127.0.0.1 umstellen.
- Deployment: **(offen)**

Claude hat keinen Zugriff auf den Server. Änderungen an Server, Config oder Produktions-DB bereitet Claude als
Befehle vor; ausgeführt werden sie vom Betreiber. Vor solchen Änderungen immer kurz Bescheid geben.

## Bekannte technische Schulden

- SQL teils per String-Konkatenation (z. B. `validate_team()` in `api/lib.php`, `api/delete.php`, `api/feedback.php`),
  teils mit Prepared Statements. Neuer Code nur mit Prepared Statements.
- `FILTER_SANITIZE_STRING` (seit PHP 8.1 deprecated) an mehreren Stellen.
- Schreibende Aktionen über GET, keine Authentifizierung außer der geheimen Team-ID in der URL.
- `stats.php` öffentlich erreichbar.
- Keine Tests, kein Linting, kein CI.
- Kein `.gitignore`; `config.php` liegt im Repo.
- `poker-msg`: Ratchet 0.4 (wenig gepflegt), läuft unter supervisor als `root`, keine Begrenzung von Verbindungen/Nachrichten.

## Arbeitsweise **(offen)**

- Sprache: Kommunikation Deutsch; Code, Kommentare und Commit-Messages: **(offen)**
- Branches/PRs: **(offen)**
- Kleine, einzeln deploybare Schritte; Verhalten der Live-App bleibt gleich, solange nichts anderes vereinbart ist.

## Konventionen im Code

- Tabellen `pok_<name>_tbl`, SQL in Kleinbuchstaben.
- API-Skripte: `require '../config.php'; require './lib.php';`, Parameter über `filter_input` mit Längenbegrenzung,
  Team-ID immer mit `validate_team()` prüfen.
- Frontend ohne Framework und ohne Build; neue Dateien direkt in `board.html`/`init.html` einbinden.
