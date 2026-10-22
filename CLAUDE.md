# CLAUDE.md – Agile Poker (komplexitaeter)

Planning-Poker-Webanwendung für verteilte Teams. Live: https://poker.komplexitaeter.de
(bzw. https://app.komplexitaeter.de). Lizenz: GPL-3.0.

> **Sprache: Antworte im Chat immer auf Deutsch** – auch bei langen technischen Antworten, Statusmeldungen und
> Zusammenfassungen. Englisch nur für Code, Kommentare, Commit-Messages und Oberflächentexte der App.

> Grundsatz: **pragmatisch bleiben.** Kleines Team (drei Personen), kleine App. Lieber einfache, verständliche
> Lösungen als „richtige“ Architektur.

## Systemüberblick

Die Anwendung besteht aus zwei Repositories:

| Repo | Zweck | Laufzeit |
|---|---|---|
| `komplexitaeter/poker` (dieses) | Web-App: HTML/CSS/JS-Frontend, PHP-API, MySQL-Schema | nginx + PHP 8.4-FPM |
| `komplexitaeter/poker-msg` | WebSocket-Benachrichtigungsserver (Ratchet, `cboden/ratchet ^0.4`) | PHP-CLI unter supervisor, `127.0.0.1:8443`, Event-Loop über PHP-Erweiterung `ev` |

Datenfluss bei einer Änderung am Board:

1. Client ruft per `fetch` einen Endpunkt in `api/*.php` auf (GET-Parameter, auch für schreibende Aktionen).
2. Danach sendet der Client `push` über den WebSocket (`/poker-msg`, von nginx auf `127.0.0.1:8443` weitergeleitet).
3. `poker-msg` schickt allen Verbindungen mit derselben Team-Subscription (`subscribe:<team_id>`) ein `pull`.
4. Die Clients laden daraufhin den Zustand neu (`api/dao.php`).

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
- `config.example.php` – Vorlage für `config.php` (DB-Zugangsdaten). `config.php` selbst ist per `.gitignore`
  ausgeschlossen und existiert nur auf den Servern bzw. lokal.

Es gibt keinen Build-Schritt für die App. npm wird nur für die Tests in `tests/e2e/` verwendet.

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

Zwei Server, gleicher Aufbau (Ubuntu 22.04, nginx 1.18 aus dem Ubuntu-Repo, PHP 8.4 aus dem ondrej-PPA, MySQL 8.0).
Web-App über `php8.4-fpm.sock`, `poker-msg` über `/usr/bin/php8.4` (seit 2026-10-16, B-22). Seit 2026-10-21 ist
PHP 8.4 die einzige PHP-Version auf beiden Servern (B-23). Weitere Seiten laufen in eigenen 8.4-Pools
(`/etc/php/8.4/fpm/pool.d/`): Live `teamcar`, `feedback`; Staging `www.komplexitaeter.de` (WordPress), `flowgame`,
`kaffeeklatsch`. Änderungen am Pool `www` bzw. an der globalen 8.4-Config betreffen alle Seiten – vorher per
`grep -Rn 'fastcgi_pass\|server unix' /etc/nginx/sites-enabled/` prüfen, wer was nutzt. Composer: offizielle Version
unter `/usr/local/bin/composer` (für `poker-msg`, `vendor/` ist nicht im Repo). Der nginx-PPA `ondrej/nginx` ist seit
April 2026 eingestellt – nicht mehr verwenden.

- PHP-8.4-FPM-`php.ini` (Live): `memory_limit = 256M`, `post_max_size = 100M`, `upload_max_filesize = 100M`
  (übernommen aus der früheren 8.1-Config).
- nginx (Live, `nginx.conf`): `worker_rlimit_nofile 65535`, `worker_connections 16384` bei 2 Workern → reicht für
  rund 16.000 gleichzeitige WebSocket-Verbindungen. Staging angeglichen.
- Zielwert `poker-msg`: 5.000 gleichzeitige Verbindungen (B-19).

| Server | Branch | Zweck |
|---|---|---|
| Release-Server | `release` | manueller Test vor dem Livegang |
| Live-Server | `master` | Produktion |

- Code auf dem Live-Server: `/home/ubuntu/poker/public_html/`.
- Deployment: manuell per `git pull --ff-only` auf dem jeweiligen Server (`git config pull.ff only` auf beiden Servern).
  `config.php` ist nicht im Repo und wird von `git pull` nicht angefasst. Es gibt keine Build- oder Migrationsschritte;
  Schemaänderungen werden von Hand eingespielt.
- Admin-Zugriff DB: `sudo mysql --defaults-file=/etc/mysql/debian.cnf`.
- `poker-msg` (supervisor, `/etc/supervisor/conf.d/poker-msg.conf`): explizit `/usr/bin/php8.4`, `ulimit -n 20000`,
  Info-Log `stdout_logfile_maxbytes = 50MB`, `stdout_logfile_backups = 5`. Braucht die Erweiterung `ev` (sonst
  ReactPHP-`stream_select`-Schleife mit Grenze bei 1.024 Verbindungen, siehe B-19); kein Paket im PPA, Build per
  `sudo pecl -d php_suffix=8.4 install ev`, aktiviert nur für CLI (`phpenmod -v 8.4 -s cli ev`). Prüfen:
  `React\EventLoop\Factory::create()` muss `ExtEvLoop` liefern.
- `poker-msg` pingt alle Verbindungen alle 30 s (WebSocket-Ping, `POKER_MSG_KEEPALIVE`) und schließt Verbindungen
  ohne Antwort (B-24). nginx `location /poker-msg`: `proxy_read_timeout 120s` auf beiden Servern.
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
- Schreibende Aktionen über GET, keine Authentifizierung außer der geheimen Team-ID in der URL.
- `stats.php` öffentlich erreichbar.
- Kein Linting, keine Unit-Tests; E2E-Tests decken bisher nur die Kernabläufe ab.
- Zeichensätze gemischt (`latin1`, `utf8mb3`, `utf8mb4`) zwischen und innerhalb von Tabellen.
- `poker-msg`: Ratchet 0.4 (wenig gepflegt), läuft unter supervisor als `root`, keine Begrenzung von Verbindungen/Nachrichten.

## Tests

End-to-End-Tests mit Playwright in `tests/e2e/`. Sie laufen in GitHub Actions (`.github/workflows/e2e.yml`) bei
jedem Push auf `release` und jedem PR nach `release` oder `master`, mit PHP 8.4 wie in Produktion.

Lokal:

```bash
E2E_DIR=/tmp/poker-e2e tests/e2e/setup.sh start   # nginx :8080, php-fpm, DB pok_e2e, poker-msg (release)
cd tests/e2e && npm ci && npx playwright test
tests/e2e/setup.sh stop
```

`setup.sh` kopiert die App mit einer eigenen `config.php` nach `$E2E_DIR/www`; nach Änderungen an der App erneut
`start` aufrufen. Abgedeckt sind: Team anlegen, Beitreten mehrerer Spieler, Karte legen, Aufdecken, neue Runde,
Kartenset wechseln. CDN-Skripte liefern die Tests aus npm-Paketen gleicher Version aus; Analytics wird blockiert.
Details zum Schreiben von Tests: `.claude/agents/e2e-tester.md`.

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
- Jeder Backlog-Eintrag bekommt einen kurzlebigen Feature-Branch von `release` (`feature/B-01-sql-injection`).
- **Merge nach `release` macht Kai selbst**, nachdem ein anderer Agent als der Autor reviewt hat, CI grün ist und die
  Änderung lokal getestet wurde. Ist `release` grün, legt Kai den PR `release` → `master` an; **diesen gibt das Team
  (Andreas) manuell frei und mergt ihn.**
- Mehrere zusammengehörige Feature-Branches darf Kai zu einem Sammel-PR nach `release` zusammenführen.
- Kleinigkeiten ohne Backlog-Eintrag (Tippfehler, Doku, Backlog-Pflege) direkt auf `release`.
- `poker-msg` bleibt ein eigenes Repo und folgt demselben Ablauf (`release` → `master`).

**Rollen und Agenten** (`.claude/agents/`):

Die **Hauptsitzung „Kai"** spricht mit dem Team, koordiniert die Agenten, reviewt deren Branches, mergt nach
`release` und legt den PR nach `master` an. Implementierungs-Agenten arbeiten je in einem eigenen Git-Worktree und
geben einen Branch zurück; sie mergen nie selbst.

| Agent (`.claude/agents/`) | Name | Zuständig für |
|---|---|---|
| (Hauptsitzung) | **Kai (KO)** | Kommunikation, Koordination, Review, Merges nach `release`, `master`-PR |
| `backend` | **Ben (BE)** | PHP, SQL, API (`api/`, `stats.php`, Schema) |
| `frontend` | **Fred (FE)** | JS/App-Logik, API-Anbindung, ausgelieferte Assets (`src/vendor/`); HTML-/JS-Umsetzung, soweit nicht gestalterisch |
| `design` | **Delia (DES)** | Look & Feel, Design-System/Tokens, CSS (`style/style.css`), visuelle HTML-Struktur, Responsive/Mobile, Barrierefreiheit – gestaltet **und** setzt selbst um |
| `security-reviewer` | **Sina (SEC)** | prüft vor dem Merge auf SQL-Injection, XSS, fehlende Team-Prüfung, GET-Schreibzugriffe |
| `e2e-tester` | **Tessa (E2E)** | startet die App lokal, führt E2E-Tests aus oder erweitert sie |

Abgrenzung **Delia ↔ Fred**: Delia besitzt die visuelle Ebene (Look & Feel, CSS, Design-relevantes Markup,
Responsive). Fred besitzt JS-Verhalten und API-Anbindung. Braucht eine Gestaltung neues JS-Verhalten (z. B. ein
Overlay öffnen), beschreibt Delia es und stimmt sich mit Fred ab; berührt etwas Datenmodell/`cards.json`/API, kommt
Ben dazu. Bei gemeinsamer Arbeit an `style.css`/`board.html` kurz abstimmen (Merge-Konflikte vermeiden).

Regel: Reviewt wird immer von einem anderen Agenten als dem Autor.

## Konventionen im Code

- Tabellen `pok_<name>_tbl`, SQL in Kleinbuchstaben.
- API-Skripte: `require '../config.php'; require './lib.php';`, Team-ID immer mit `validate_team()` prüfen.
- Eingaben **unverändert speichern, bei der Ausgabe escapen**: Freitext (Namen, Themen) über `get_text_param()` aus
  `api/lib.php` lesen (nur `trim` + Längenbegrenzung), nie „vorab bereinigen“. Ausgabe im Frontend nur per
  `textContent`/`innerText` (bzw. remarkable ohne HTML), in der API per `json_encode`. Kein Echo von Eingaben in
  HTML-Antworten. In SQL nur über Prepared Statements.
- Freitext in URLs im Frontend immer mit `encodeURIComponent()`.
- Nach Änderungen an JS-Dateien die Versionsnummer im Script-Tag (`?v=…`) in `board.html`/`init.html` erhöhen.
- CI schlägt fehl, wenn ein Testlauf `PHP Deprecated` oder `PHP Warning` ins PHP-Log schreibt.
- Frontend ohne Framework und ohne Build; neue Dateien direkt in `board.html`/`init.html` einbinden.
