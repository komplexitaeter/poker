# CLAUDE.md – Agile Poker (komplexitaeter)

Planning-Poker-Webanwendung für verteilte Teams. Live: https://poker.komplexitaeter.de
(bzw. https://app.komplexitaeter.de). Lizenz: GPL-3.0.

> Grundsatz: **pragmatisch bleiben.** Kleines Team (drei Personen), kleine App. Lieber einfache, verständliche
> Lösungen als „richtige“ Architektur.

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

MySQL 8.0, Datenbank `pok_db`, App-User `pok_usr`. `db_schema_pok.sql` entspricht dem Live-Schema (Stand 2026-10-16,
Export ohne Daten). Schemaänderungen kommen zuerst in `db_schema_pok_inc.sql` und werden bei größeren Releases in
`db_schema_pok.sql` übernommen.

Fachliche Tabellen: `pok_teams_tbl`, `pok_players_tbl`, `pok_user_tbl`, `pok_roundstats_tbl`,
`pok_roundstat_details_tbl`, `pok_promotions_tbl`, `pok_feedback_tbl`, `pok_survey*_tbl`, `pok_analytics_events_tbl`.

Statistik-Tabellen für Grafana (Endung `_stats`, `_stats_tbl`): `pok_active_user_stats`, `pok_active_use_stats_tbl`,
`pok_daily_teams_stats`. Sie werden von einem MySQL-Event-Job befüllt, nicht vom App-Code (Definition noch nicht im Repo, siehe B-08). Werden sie geändert
und Grafana hakt, wird das Dashboard angepasst – kein Grund, Schemaänderungen zu blockieren.

`pok_analytics_events_tbl` wächst unbegrenzt. Abfragen darauf immer über einen Zeitbereich auf `creation_date`
(indexfähig, keine Funktion auf der Spalte) und mit `/*+ MAX_EXECUTION_TIME(...) */` bei Auswertungen.

Lokale Test-DB: `db_schema_pok.sql` lässt sich direkt in eine leere MySQL-8.0-Datenbank importieren.

## Betrieb

Zwei Server, gleicher Aufbau (Ubuntu 22.04, nginx, PHP 8.1-FPM, MySQL 8.0):

| Server | Branch | Zweck |
|---|---|---|
| Release-Server | `release` | manueller Test vor dem Livegang |
| Live-Server | `master` | Produktion |

- Code auf dem Live-Server: `/home/ubuntu/poker/public_html/`.
- Deployment: manuell per `git pull` auf dem jeweiligen Server. Es gibt keine Build- oder Migrationsschritte;
  Schemaänderungen werden von Hand eingespielt.
- Admin-Zugriff DB: `sudo mysql --defaults-file=/etc/mysql/debian.cnf`.
- MySQL lauscht auf `0.0.0.0:3306` – bewusst, weil eine **externe Grafana-Instanz** (`grafana_usr`) darauf zugreift.
  Nicht ohne Rücksprache auf 127.0.0.1 umstellen.

Last (Stand Oktober 2026): an Werktagen 100–125 aktive Teams mit im Schnitt 5,5–6 Teilnehmern. Spitzen etwa
1.000 aktive Clients pro Tag und etwa 100–120 gleichzeitig aktive Clients pro Minute; am Wochenende fast nichts.
Deployments und Schemaänderungen daher bevorzugt abends oder am Wochenende.

Claude hat keinen Zugriff auf die Server. Änderungen an Servern, Config oder Datenbanken bereitet Claude als
Befehle vor; ausgeführt werden sie vom Betreiber. Vor solchen Änderungen immer kurz Bescheid geben.

## Bekannte technische Schulden

- SQL teils per String-Konkatenation (z. B. `validate_team()` in `api/lib.php`, `api/delete.php`, `api/feedback.php`),
  teils mit Prepared Statements. Neuer Code nur mit Prepared Statements.
- `FILTER_SANITIZE_STRING` (seit PHP 8.1 deprecated) an mehreren Stellen.
- Schreibende Aktionen über GET, keine Authentifizierung außer der geheimen Team-ID in der URL.
- `stats.php` öffentlich erreichbar.
- Keine Tests, kein Linting, kein CI.
- Zeichensätze gemischt (`latin1`, `utf8mb3`, `utf8mb4`) zwischen und innerhalb von Tabellen.
- Kein `.gitignore`; `config.php` liegt im Repo.
- `poker-msg`: Ratchet 0.4 (wenig gepflegt), läuft unter supervisor als `root`, keine Begrenzung von Verbindungen/Nachrichten.

## Zusammenarbeit

**Sprache:** Mit dem Team wird Deutsch gesprochen; `BACKLOG.md` und `CLAUDE.md` sind auf Deutsch.
Die Anwendung selbst bleibt Englisch: Code, Kommentare, Commit-Messages, Oberfläche.

**Grundhaltung:** pragmatisch. Kleine, einzeln deploybare Schritte; Verhalten der Live-App bleibt gleich, solange
nichts anderes vereinbart ist. Stack bleibt vorerst (PHP ohne Framework, Vanilla JS, MySQL).

**Ablauf in Mini-Sprints:**

1. **Backlog** – Themen stehen in `BACKLOG.md` (ID, Status, kurze Beschreibung, offene Fragen). Claude darf neue
   Einträge vorschlagen und anlegen, aber nicht eigenmächtig priorisieren.
2. **Refinement** – gemeinsam, bis ein Eintrag verstanden ist: Ziel, Umfang, Akzeptanzkriterien, offene Fragen geklärt.
   Danach Status `refined`.
3. **Sprint-Auswahl** – gemeinsam entscheiden, welche `refined`-Einträge in die nächste Iteration kommen.
4. **Planning** – für jeden Eintrag einen konkreten Umsetzungsplan abstimmen, bevor Code geschrieben wird.
5. **Umsetzung** – nur was im Sprint geplant ist. Fällt unterwegs etwas Neues auf, kommt es als Eintrag ins Backlog
   statt in den laufenden Sprint.
6. **Abschluss** – manueller Test auf dem Release-Server, dann Merge `release` → `master` und Deploy auf Live.
   Status in `BACKLOG.md` aktualisieren.

Ausnahme: akute Produktionsprobleme (wie die blockierende Query in `stats.php`) werden sofort behoben und
nachträglich im Backlog vermerkt.

**Git:**

- Basis ist `release`. `master` wird nur durch Merge von `release` verändert, nie direkt.
- Jeder Backlog-Eintrag bekommt einen kurzlebigen Feature-Branch von `release`
  (`feature/B-01-sql-injection`) und einen PR nach `release`, der im Team reviewt und gemergt wird.
- Kleinigkeiten ohne Backlog-Eintrag (Tippfehler, Doku, Backlog-Pflege) direkt auf `release`.
- `poker-msg` bleibt ein eigenes Repo und folgt demselben Ablauf (`release` → `master`).

**Agenten** (`.claude/agents/`):

- `security-reviewer` – prüft Änderungen vor dem Merge auf SQL-Injection, XSS, fehlende Team-Prüfung und
  zustandsändernde GET-Aufrufe.
- `e2e-tester` – kommt mit B-04.

## Konventionen im Code

- Tabellen `pok_<name>_tbl`, SQL in Kleinbuchstaben.
- API-Skripte: `require '../config.php'; require './lib.php';`, Parameter über `filter_input` mit Längenbegrenzung,
  Team-ID immer mit `validate_team()` prüfen.
- Frontend ohne Framework und ohne Build; neue Dateien direkt in `board.html`/`init.html` einbinden.
