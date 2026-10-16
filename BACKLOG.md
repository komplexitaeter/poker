# Backlog

Gemeinsames Backlog für Wartung und Weiterentwicklung. Ablauf siehe `CLAUDE.md`, Abschnitt „Zusammenarbeit“.

Status: `neu` → `refined` (gemeinsam verstanden, bereit für einen Sprint) → `im Sprint` → `erledigt`.
Reihenfolge = grobe Priorität, wird im Refinement angepasst.

## Aktueller Sprint

**Sprint 2:** B-19 + B-22 (vorgezogen als Produktionsproblem), B-24, B-03, B-18

Abgeschlossen: **Sprint 1** (2026-10-16): B-04, B-07 – live auf Staging und Produktion.

## Backlog

| ID | Thema | Status |
|---|---|---|
| B-01 | SQL-Injection in `api/` beheben | neu |
| B-02 | `stats.php` absichern (XSS, Zugriffsschutz) | neu |
| B-03 | PHP-8.1-Deprecations und kleine Bugs | im Sprint |
| B-04 | Lokale Testumgebung und erste E2E-Tests mit CI | erledigt |
| B-05 | E2E-Tests für weitere Funktionen | neu |
| B-06 | Testfälle gemeinsam reverse-engineeren | neu |
| B-07 | Repo-Hygiene (`.gitignore`, `config.php`, README) | erledigt |
| B-08 | MySQL-Statistik-Job ins Repo aufnehmen | neu |
| B-09 | Wachstum von `pok_analytics_events_tbl` begrenzen | neu |
| B-10 | `poker-msg` modernisieren und absichern | neu |
| B-11 | Schreibende API-Aufrufe per POST statt GET | neu |
| B-12 | Zeichensätze auf `utf8mb4` vereinheitlichen | neu |
| B-13 | MySQL-Zugriff von außen einschränken | neu |
| B-14 | `script/script.js` in Module aufteilen | neu |
| B-15 | CDN-Abhängigkeiten festnageln oder selbst ausliefern | neu |
| B-16 | Fremddateien und phpMyAdmin in den Webroots absichern | erledigt |
| B-17 | DB-Zugriff per Client über SSH-Tunnel einrichten | neu |
| B-18 | Server-Logs von Live sichten | erledigt |
| B-19 | `poker-msg`: Event-Loop ohne 1024-Verbindungen-Grenze | im Sprint |
| B-20 | PHP-FPM und MySQL robuster konfigurieren | neu |
| B-21 | Race Condition beim Anlegen neuer Nutzer in `getDao()` | neu |
| B-22 | PHP-Upgrade auf 8.4 | erledigt |
| B-23 | Server aufräumen nach PHP-8.4-Umstellung | neu |
| B-24 | Heartbeat in `poker-msg`: tote Verbindungen schließen | im Sprint |

### B-01 SQL-Injection in `api/` beheben
Einige Queries setzen Eingaben direkt in SQL ein: `validate_team()` in `api/lib.php` (läuft bei fast jedem Request),
`api/delete.php`, `api/feedback.php`, `api/setc.php`, `getDao()` und weitere Stellen in `api/lib.php`. Umstellen auf Prepared Statements.
Außerdem: `api/timer.php` und `api/get_promo.php` prüfen die Team-ID nicht mit `validate_team()`.
Offene Fragen: alle Stellen einzeln oder `lib.php` gleich mit einer kleinen Query-Hilfsfunktion?

### B-02 `stats.php` absichern
Feedback-Texte werden ungefiltert ausgegeben (XSS), die Seite ist ohne Login erreichbar.
Offene Fragen: Zugriffsschutz per nginx (Basic Auth/IP) oder in PHP? Wird `stats.php` neben Grafana überhaupt noch gebraucht?

### B-03 PHP-8.1-Deprecations und Eingabe-Filter richtig machen
**Hintergrund:** `FILTER_SANITIZE_STRING` (13 Stellen, deprecated seit PHP 8.1) „bereinigt“ Eingaben vor dem
Speichern: entfernt alles, was wie ein Tag aussieht, und kodiert `'`/`"` als `&#39;`/`&#34;`. Das Frontend escaped
bei der Ausgabe aber bereits korrekt (`textContent`/`innerText`, remarkable ohne HTML). Folge sind verfälschte Daten:
Teamname `Bob's Team` wird live als `Bob&#39;s Team` angezeigt, `Sprint 1 < 2` wird zu `Sprint 1 `,
`Max < Moritz` zu `Max `. Für SQL spielte der Filter keine Rolle (alle betroffenen Werte gehen über Prepared Statements).

**Ziel:** Rohdaten speichern, bei der Ausgabe escapen (wie das Frontend es schon tut). Keine Deprecations mehr.

**Umfang:**
- Freitexte (Team-, Spielername, Team/Thema aus dem Einstiegslink in `index.php`): unverändert speichern, nur `trim()`
  und Längenbegrenzung.
- Steuerparameter (`tool`, `preset`, `action`, `type`, `display_type`, IDs in `get_promo.php`): gegen erlaubte Werte
  bzw. Format prüfen.
- `null`-Fälle (`substr(null)` in `index.php`, `strtolower(null)` in `add_team()`).
- Einmaliges SQL: `&#39;`/`&#34;` in bestehenden Teamnamen zurückwandeln (Anzahl vorher zählen).
- Alle Ausgabestellen prüfen (bisher bekannt: `innerHTML` für Thema – sicher; Umfrage-Texte aus der DB; `stats.php` → B-02).
- CI schlägt fehl, wenn ein Testlauf `Deprecated` ins PHP-Log schreibt.
- Im Planning ergänzt: Frontend kodiert Namen in URLs nicht (`&`/`#` schneiden Namen ab) → `encodeURIComponent`;
  `name.php` gibt den Namen als HTML zurück (Debug-Ausgabe, nach Umstellung reflektiertes XSS) → entfernen.
- Aus dem Security-Review ergänzt: Thema speichern (`save_topic`) kodiert ebenfalls nicht → `encodeURIComponent`;
  Längenbegrenzung schnitt nach Bytes und zerteilte Umlaute an der Grenze (Spielername mit 15 Zeichen → HTTP 500,
  Beitritt unmöglich) → Kürzen nach Zeichen (`cut_text()`, ohne `mbstring`, das live für 8.4 nicht installiert ist).

**Akzeptanzkriterien:**
- E2E-Test: Team- und Spielernamen mit `'`, `"`, `<`, `&` und `<b>…</b>` werden exakt so angezeigt, wie eingegeben,
  und nicht als HTML interpretiert.
- Ein kompletter Testlauf erzeugt keine Deprecation; kein `FILTER_SANITIZE_STRING` mehr im Code.
- Bestehende Teams mit `&#39;`/`&#34;` im Namen werden nach dem Daten-Update korrekt angezeigt.

### B-04 Lokale Testumgebung und erste E2E-Tests mit CI
**Ziel:** Ein Befehl startet die komplette App lokal (nginx, PHP-FPM, MySQL, `poker-msg`) und führt Playwright-Tests
aus; GitHub Actions macht dasselbe bei jedem PR und Push auf `release`.

**Umfang:**
- Setup-Skript für Ubuntu (genutzt von CI und Claude); nginx mit `/poker-msg`-Weiterleitung wie in Produktion,
  leere DB aus `db_schema_pok.sql`, `poker-msg` aus dessen `release`-Branch. Kein Docker (vorerst).
- Playwright (Chromium) in `tests/e2e/`.
- Testfälle: Team anlegen; zwei Spieler treten bei und sehen sich; Karte legen und beim anderen sichtbar; alle
  gewählt → Ergebnis; neue Runde setzt zurück; Kartenset wechseln, beide sehen das neue Set.
- GitHub-Actions-Workflow mit PHP 8.1 (wie Produktion).
- Agent `e2e-tester` und Anleitung in `CLAUDE.md`.
- nginx-Regel für die Server, damit Test-, Doku- und Konfigurationsdateien nicht öffentlich abrufbar sind
  (spielt der Betreiber ein).

**Akzeptanzkriterien:**
- Tests laufen in CI grün gegen `release`.
- Ein absichtlich eingebauter Fehler lässt einen Test fehlschlagen.
- Keine Änderung am App-Code.

**Entscheidungen:** Ubuntu-Skript statt Docker, weil künftig Claude entwickelt; CI-Laufzeit von einigen Minuten ist
akzeptiert, soll aber durch Caching möglichst kurz bleiben.

### B-05 E2E-Tests für weitere Funktionen
Kartenkonfiguration, Timer, Thema, Anonym-Modus, Ergebnis-Sortierung, Durchschnitt, Spieler entfernen, Feedback.
Voraussetzung: B-04.

### B-06 Testfälle gemeinsam reverse-engineeren
Gemeinsam aus dem bestehenden Verhalten fachliche Testfälle ableiten und dokumentieren. Nicht im ersten Sprint.

### B-07 Repo-Hygiene
`.gitignore` anlegen, `config.php` durch `config.example.php` ersetzen (echte Config bleibt nur auf den Servern),
Installationsschritt im README anpassen. Umgesetzt zusammen mit B-04.

Einmaliger Deploy-Ablauf pro Server (getestet für beide Ausgangszustände: Staging mit geänderter `config.php`,
Live mit bereits gestagtem `git rm --cached config.php`):

```bash
cp config.php ~/config.php.bak
git reset -q --hard
git pull --ff-only
cp ~/config.php.bak config.php
git status   # sauber
```

Nicht enthalten (später, eigener Eintrag bei Bedarf): README insgesamt überarbeiten.

### B-08 MySQL-Statistik-Job ins Repo aufnehmen
Die `_stats`-Tabellen werden von einem MySQL-Event befüllt, das nicht im Repo liegt.
Definition exportieren (`SHOW CREATE EVENT`) und versionieren.

### B-09 Wachstum von `pok_analytics_events_tbl` begrenzen
Tabelle wächst unbegrenzt. Aufbewahrungsdauer festlegen, alte Daten löschen oder verdichten.
Offene Fragen: Wie lange werden Rohdaten gebraucht? Wie groß ist die Tabelle heute?

### B-10 `poker-msg` modernisieren und absichern
Ratchet 0.4 wird kaum gepflegt; der Prozess läuft unter supervisor als `root`; keine Begrenzung von Verbindungen
oder Nachrichtengröße. Läuft nicht als root, Abhängigkeiten aktualisieren oder Alternative prüfen.
Heartbeat ergänzen: verwaiste Verbindungen (vergessene Tabs, Laptop im Ruhezustand) nach z. B. 2 Minuten schließen.

### B-11 Schreibende API-Aufrufe per POST statt GET
Zustandsändernde Endpunkte werden per GET aufgerufen (Prefetching, Logs mit Parametern, kein CSRF-Schutz).
Voraussetzung: B-04, damit Frontend und API gemeinsam umgestellt und getestet werden.

### B-12 Zeichensätze vereinheitlichen
Tabellen mischen `latin1`, `utf8mb3`, `utf8mb4`. Umstellung auf `utf8mb4` inkl. Verbindung (`set_charset`).
Größere DB-Änderung, braucht ein Wartungsfenster.

### B-13 MySQL-Zugriff von außen einschränken
Port 33060 schließen, Port 3306 per Firewall nur für die Grafana-Instanz öffnen, `grafana_usr` auf deren IP
beschränken und auf Leserechte prüfen.

### B-14 `script/script.js` in Module aufteilen
1.300 Zeilen mit globalen Variablen. Schrittweise in ES-Module zerlegen, ohne Build-Schritt.
Voraussetzung: B-04/B-05.

### B-15 CDN-Abhängigkeiten festnageln oder selbst ausliefern
`board.html` lädt `js-confetti@latest` von jsDelivr – jede neue Version geht ungeprüft live. Auch remarkable,
qr-code-styling und Font Awesome kommen von CDNs (ohne Integritätsprüfung). Versionen festnageln und
`integrity`-Attribute setzen oder die Dateien selbst ausliefern. Fällt ein CDN aus, startet das Board nicht
(`loadBoard()` bricht ohne `QRCodeStyling` ab).
**Sicherheit:** Live lädt `remarkable` 1.7.1 mit bekannten Schwachstellen (u. a. XSS über präparierte Link-Schemata
in Markdown-Links, CVE-2017-16006 – auslösbar über ein Thema, z. B. per Einstiegslink `/?tool=x&text=…`);
Ziel mindestens 1.7.4. Bisher geplant war 1.7.2, das nur einen Teil behebt (Dependabot-PRs #3/#4
heben nur die Testkopie an). Live (`board.html`) und Tests (`tests/e2e/package.json`, `cdnFiles` in
`specs/helpers.ts`) gemeinsam anheben.

### B-16 Fremddateien und phpMyAdmin in den Webroots absichern
Auf dem Staging-Server lagen neben dem Repo `info.php` (phpinfo), `config.php.live` und ein Symlink
`db -> /usr/share/phpmyadmin` im Webroot; phpMyAdmin war damit öffentlich erreichbar.
**Erledigt 2026-10-16:** `info.php` und `config.php.live` entfernt, Symlink `db` auf allen Servern gelöscht
(phpMyAdmin bleibt installiert, ist aber nicht mehr über das Web erreichbar). Ersatz siehe B-17.

### B-17 DB-Zugriff per Client über SSH-Tunnel einrichten
Ersatz für phpMyAdmin: ein DB-Client auf dem eigenen Rechner (z. B. DBeaver, TablePlus, Sequel Ace) verbindet
sich per SSH-Tunnel mit MySQL auf dem Server. Kurze Anleitung für das Team, ggf. eigener MySQL-User mit passenden
Rechten statt root.
Offene Fragen: Wer braucht Zugriff, auf welche Server? Passt das zu B-13 (MySQL nur für Grafana öffnen)?

### B-18 Server-Logs von Live sichten
Zusammenfassung der aktuellen Logs per Skript (nur lesend, ohne IPs/Team-IDs), gemeinsam ausgewertet.
**Erledigt 2026-10-16.** Ergebnisse als B-19, B-20, B-21; Ergänzungen zu B-13. PHP-Fehler landen live im
nginx-Error-Log (`FastCGI sent in stderr`); Deprecations werden live nicht geloggt (`php.ini`:
`E_ALL & ~E_DEPRECATED`, die Live-`config.php` setzt kein `error_reporting`). Einzige PHP-Meldung im aktuellen Log:
der Fatal Error aus B-21. Sonst nur Scanner-404s, harmlose TLS-Fehler, DNS-Warnungen von MySQL.

### B-19 `poker-msg`: Event-Loop ohne 1024-Verbindungen-Grenze
`poker-msg_error.log` enthält tausende `stream_select(): You MUST recompile PHP with a larger value of FD_SETSIZE`.
ReactPHP nutzt mangels Erweiterung die `stream_select`-Schleife, die nur Dateideskriptoren < 1024 verarbeiten kann;
Verbindungen darüber werden nicht mehr bedient (Boards aktualisieren sich dann nicht). Lösung ohne Code-Änderung:
PHP-Erweiterung `ev` oder `event` für das CLI-PHP installieren – ReactPHP wählt sie automatisch – und `poker-msg`
neu starten. Passt zu B-10.

**Nachweis (lokaler Lasttest, 2026-10-16):** 1.100 WebSocket-Clients gegen `poker-msg` ohne Erweiterung → nur 1.000
Verbindungen, nach einem `push` erhält **kein** Client ein `pull` (auch die ersten 1.000 nicht), ~330.000 Warnungen
in Sekunden (Leerlauf-Schleife). Live: 449 Verbindungen um 10:30 Uhr, Spitze 8–9 Uhr mit 5–7× mehr Verkehr.

**Zielwert:** 5.000 gleichzeitige Verbindungen (≈ 3–5× der geschätzten heutigen Spitze von 1.000–1.500).

**Umfang:** `pecl install ev`, nur für CLI aktivieren, `poker-msg` neu starten (erst Staging, dann Live);
supervisor-Info-Log auf `stdout_logfile_maxbytes = 50MB`, `stdout_logfile_backups = 5`, damit die echte Spitze
von `active_users` messbar wird.

**Akzeptanzkriterien:** `React\EventLoop\Factory::create()` liefert `ExtEvLoop`; nach einem Werktag keine neuen
`FD_SETSIZE`-Warnungen; Spitzenwert `active_users` aus dem Log bekannt.

**Stand 2026-10-16:** auf Staging und Live umgesetzt (zusammen mit B-22), `ExtEvLoop` bestätigt. Offen: Prüfung
nach der nächsten Werktags-Spitze (Montag nach 10 Uhr) – `FD_SETSIZE`-Zähler im neuen Fehler-Log und Spitzenwert
`active_users`.

### B-20 PHP-FPM und MySQL robuster konfigurieren
- PHP-FPM: `pm.max_children = 5` wurde am 14.10. (Vorfall `stats.php`) erreicht. Bei 3,8 GB RAM moderat anheben,
  `request_terminate_timeout` setzen (hängende Requests blockieren nicht alle Worker), `slowlog` aktivieren.
- MySQL: `slow_query_log` ist aus, trotzdem 9 Slow Queries (> 10 s) seit dem letzten Neustart – Log aktivieren
  und auswerten. `skip-name-resolve` gegen die DNS-Warnungen durch Verbindungsversuche von außen
  (234 abgebrochene Verbindungen in 2 Tagen, siehe B-13).

### B-21 Race Condition beim Anlegen neuer Nutzer in `getDao()`
Zwei gleichzeitige Requests eines neuen Browsers legen beide den Nutzer an; der zweite scheitert mit
`Duplicate entry … for key 'pok_user_tbl.PRIMARY'` (PHP Fatal Error, HTTP 500). In den E2E-Logs reproduziert,
live bestätigt: 1× in 11 Stunden (einzige PHP-Meldung im nginx-Error-Log). Lösung z. B. `INSERT IGNORE`/`ON DUPLICATE KEY UPDATE`.

### B-22 PHP-Upgrade auf 8.4
**Entscheidung 2026-10-16:** Web-App (PHP-FPM) und `poker-msg` auf Staging und Live gemeinsam auf PHP 8.4 aus dem
ondrej-PPA, zusammen mit B-19 (`php8.4-ev` als Paket statt `pecl`). Vorher laufen die E2E-Tests in CI gegen 8.1 und 8.4;
nach der Umstellung auf Live nur noch gegen 8.4.

**Staging umgestellt (2026-10-16):** `ev` 1.2.3 per `pecl -d php_suffix=8.4` gebaut (im PPA gibt es kein
`php8.4-ev`), nur für CLI aktiviert; `poker-msg` läuft per supervisor mit `/usr/bin/php8.4`, `ulimit -n 20000`,
Info-Log 50 MB × 5; nginx der Poker-Staging-Seite auf `php8.4-fpm.sock`. Funktionstest ok, keine Fehler im
`poker-msg`-Log.

**Live umgestellt (2026-10-16, ca. 12:40 UTC):** ondrej-PPA eingerichtet, PHP 8.4 + `php8.4-xml` (für `pecl`)
installiert, `ev` gebaut und für CLI aktiviert, `poker-msg` auf `php8.4`, Info-Log 50 MB × 5; PHP-8.4-FPM mit den
angepassten Werten der 8.1-Config (`memory_limit`, `post_max_size`, `upload_max_filesize`); nginx auf
`php8.4-fpm.sock`. Funktionstest ok, keine neuen PHP-Fehler, `poker-msg`-Fehler-Log leer, nach wenigen Minuten
451 Verbindungen. CI testet nur noch gegen 8.4.

Live läuft auf PHP 8.1 aus Ubuntu 22.04 (Sicherheitsupdates durch Canonical bis April 2027). Staging hat zusätzlich
8.2 und 8.4 installiert; dort ist `/usr/bin/php` (CLI, also `poker-msg`) bereits 8.4.
Offene Fragen: ondrej-PPA mit 8.4 oder Ubuntu 24.04 mit 8.3? Zeitpunkt? Vorher B-03 (Altlasten im Code) und
`poker-msg` unter der neuen Version testen (Ratchet 0.4, Deprecations). CI zusätzlich mit der Zielversion laufen lassen.
Erweiterung `ev` (B-19) für die neue Version mit installieren.

### B-23 Server aufräumen nach PHP-8.4-Umstellung
- Live und Staging: einmal neu starten (am Wochenende), da bei der Installation Systembibliotheken aktualisiert
  wurden und viele Dienste noch mit den alten laufen (`needrestart`).
- Paketquelle `ondrej/nginx` entfernen (PPA eingestellt, `apt update` meldet `403 Forbidden`).
- PHP 8.1 (und auf Live die Build-Pakete `php8.1-dev` usw.) deinstallieren, wenn 8.4 eine Weile stabil läuft;
  vorher prüfen, dass nichts anderes mehr `php8.1` nutzt (auf Staging laufen weitere Seiten mit 8.1!).
- Große Upload-Grenzen (`post_max_size`/`upload_max_filesize` 100M, nginx `client_max_body_size 100M`) prüfen –
  die App lädt keine Dateien hoch.

### B-24 Heartbeat in `poker-msg`: tote Verbindungen schließen
**Problem:** Die Zahl der Verbindungen in `poker-msg` steigt kontinuierlich, auch nachts: von derselben IP alle 1–2
Minuten eine neue Verbindung, die alte bleibt offen. Wahrscheinliche Ursache: ein offener Tab hinter einer
Firewall/einem Proxy, der ruhige Verbindungen nach 1–2 Minuten kappt. Der Browser verbindet neu (Client prüft alle
3 s), nginx und `poker-msg` merken vom Abbruch nichts und halten die alte Verbindung (`proxy_read_timeout 86400`)
bis zu 24 Stunden.

**Lösung:** Ratchets eingebauter Keepalive (`WsServer::enableKeepAlive`): `poker-msg` sendet alle 30 s einen
WebSocket-Ping, Browser antworten automatisch; wer den vorherigen Ping nicht beantwortet hat, wird geschlossen.
Intervall per `POKER_MSG_KEEPALIVE` (Tests: 2 s). Zusätzlich nginx `proxy_read_timeout` für `/poker-msg` auf 120 s.
Der Client verbindet nach einer serverseitigen Trennung innerhalb von 3 s neu und lädt den Board-Stand nach.

**Nachweis:** lokal eingefrorener Client wird nach 1–2 Intervallen getrennt, aktiver Client bleibt verbunden;
neuer E2E-Test: nach Leerlauf über mehrere Ping-Runden kommen Updates ohne Neuverbindung an.

**Akzeptanzkriterium:** nachts fällt `active_users` auf nahezu 0, statt linear zu steigen.

**Stand 2026-10-16:** auf Staging und Live umgesetzt (`poker-msg` aus `release`/`master` mit Keepalive, nginx
`proxy_read_timeout 120s` auf beiden Servern). Staging-`poker-msg` dabei von einem lokalen Branch mit dem verworfenen
Yjs-Versuch („shared area“, lokal gesichert als `backup/shared-area`) auf `release` umgestellt und auf HTTPS-Remote.
Offen: Kontrolle `active_users` über Nacht.
