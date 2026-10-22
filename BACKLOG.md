# Backlog

Gemeinsames Backlog für Wartung und Weiterentwicklung. Ablauf siehe `CLAUDE.md`, Abschnitt „Zusammenarbeit“.

Status: `neu` → `refined` (gemeinsam verstanden, bereit für einen Sprint) → `im Sprint` → `erledigt`.
Reihenfolge = grobe Priorität, wird im Refinement angepasst.

## Aktueller Sprint

**Sprint 6 – „Schlank & performant"** (ab 2026-10-22): Thema Performance/Schlankheit. Startet mit einem
**Schlank-Spike** (Bestandsaufnahme: Assets, CSS, JS, `dao.php`-Payload) → priorisierte, einzeln deploybare
Verbesserungen. Vorbereitete Einträge: B-35 (Assets), B-36 (CSS aufräumen), B-37 (Responsive per CSS), B-38
(`dao.php`-Payload, Spike). Reihenfolge nach Aufwand/Nutzen aus dem Spike; Umsetzung klein und gestaffelt.
Nebenher: B-19/B-24-Nachkontrolle nach der nächsten Werktags-Spitze; B-20-Nachkontrolle (FPM-grep + `free -m`).

**Schlank-Spike-Ergebnis (2026-10-22, Details je Eintrag B-35/B-36/B-37/B-38/B-39).** Priorisierung nach
Aufwand/Nutzen:
1. **Server-Kompression gzip** (B-35) – **erledigt auf Live + Staging** (2026-10-22): `image/svg+xml` in `gzip_types`
   ergänzt → Brand-SVGs jetzt gzipped (~180 KB/Board-Load gespart). CSS/JS waren schon komprimiert.
2. **B-39 Resize: Karten sofort positionieren statt zu animieren** – klein, Frontend-only, spürbare UX-Verbesserung.
3. **SVG/PNG verlustfrei optimieren** (B-35, `svgo`/`oxipng`) – klein, moderater Gewinn.
4. **CSS aufräumen** (B-36) – mittel, Pixel-Gegenprüfung nötig (Klassen teils per JS gesetzt).
5. **Responsive JS→CSS** (B-37) – groß, Regressionsrisiko, später; ggf. mit B-14.

**Bewusst NICHT verfolgt:** tote Bilder löschen (werden nicht geladen → kein Laufzeiteffekt, nur Repo-Kosmetik;
Andreas: „nicht ran jetzt"). `cards.json`-Doppellesung war ein Messfehler – pro dao-Request nur **1×**, vernachlässigbar.
`dao.php`-Payload mit 1–2 KB zu klein für Reduktion („so lassen" wie B-09).

Offen aus Sprint 2: Nachkontrolle von B-19 und B-24 nach der nächsten Werktags-Spitze
(`FD_SETSIZE`-Warnungen, Spitzenwert und Nachtverlauf von `active_users`).

Akut (außerhalb des Sprints): B-28 PHP2Shell patchen – erledigt 2026-10-21.

Abgeschlossen:
- **Sprint 5** (2026-10-22): B-11, B-26, B-27 + Bugfix B-33 – nach `master` gemergt und live (PR #21). Alle Writes
  laufen per POST (405 ohne POST); Null-Guards in den Topnav-Toggles; Favicons/Touch-Icons nach `src/` + explizit
  verlinkt; Namensänderung behält die Karte, Verlassen räumt die Karte. **B-20** (Server-Config) bleibt offen: MySQL
  auf beiden Servern umgestellt (DB neugestartet, Smoketest ok), FPM-Werte vorbereitet – Nachkontrolle (FPM-grep,
  `free -m`, `log-summary.sh`) ausstehend.
- **Sprint 4** (2026-10-22): zwei Analyse-Spikes. B-31 (API-Review) → M1–M3 umgesetzt (letzte SQL-Konkatenation raus,
  JSON-Header, 403 statt leerem 200 bei ungültigem Team), live. B-09 (Analytics) → Ergebnis „so lassen" (Tabelle nur
  94 MB). B-11 (GET→POST = M4) bewusst herausgehalten, eigener Sprint.
- **Sprint 3** (2026-10-20): B-21, B-15, B-01, B-02 – nach `master` gemergt. Beim Staging-Test eine B-01-Regression
  gefunden und behoben (`mkey` kam durch die Prepared-Statement-Umstellung als Zahl statt String → Karten-Animation
  und -Größe kaputt; E2E-Regressionstest ergänzt). Live inkl. nginx Basic Auth für `stats.php`
  (Andreas, 2026-10-20); Details in `docs/stats-basic-auth.md`.
- **Sprint 2** (2026-10-16): B-18, B-19 + B-22, B-24, B-03, B-25 – live auf Staging und Produktion; Daten-Update
  für B-03 auf Live ausgeführt (26 Teamnamen, 11 Themen, 90 Rundenthemen).
- **Sprint 1** (2026-10-16): B-04, B-07 – live auf Staging und Produktion.

## Backlog

| ID | Thema | Status |
|---|---|---|
| B-01 | SQL-Injection in `api/` beheben | erledigt |
| B-02 | `stats.php` absichern (XSS, Zugriffsschutz) | erledigt |
| B-03 | PHP-8.1-Deprecations und kleine Bugs | erledigt |
| B-04 | Lokale Testumgebung und erste E2E-Tests mit CI | erledigt |
| B-05 | E2E-Tests für weitere Funktionen | neu |
| B-06 | Testfälle gemeinsam reverse-engineeren | neu |
| B-07 | Repo-Hygiene (`.gitignore`, `config.php`, README) | erledigt |
| B-08 | MySQL-Statistik-Job ins Repo aufnehmen | neu |
| B-09 | Wachstum von `pok_analytics_events_tbl` begrenzen | erledigt (Analyse: so lassen) |
| B-10 | `poker-msg` modernisieren und absichern | neu |
| B-11 | Schreibende API-Aufrufe per POST statt GET | erledigt |
| B-12 | Zeichensätze auf `utf8mb4` vereinheitlichen | neu |
| B-13 | MySQL-Zugriff von außen einschränken | neu |
| B-14 | `script/script.js` in Module aufteilen | neu |
| B-15 | CDN-Abhängigkeiten festnageln oder selbst ausliefern | erledigt |
| B-16 | Fremddateien und phpMyAdmin in den Webroots absichern | erledigt |
| B-17 | DB-Zugriff per Client über SSH-Tunnel einrichten | neu |
| B-18 | Server-Logs von Live sichten | erledigt |
| B-19 | `poker-msg`: Event-Loop ohne 1024-Verbindungen-Grenze | im Sprint |
| B-20 | PHP-FPM und MySQL robuster konfigurieren | refined |
| B-21 | Race Condition beim Anlegen neuer Nutzer in `getDao()` | erledigt |
| B-22 | PHP-Upgrade auf 8.4 | erledigt |
| B-23 | Server aufräumen nach PHP-8.4-Umstellung | neu |
| B-24 | Heartbeat in `poker-msg`: tote Verbindungen schließen | im Sprint |
| B-25 | Board blitzt beim Laden kurz mit allen Elementen auf | erledigt |
| B-26 | `toggle_topic_box`: `Cannot read properties of null` | erledigt |
| B-27 | `apple-touch-icon` fürs Board/Startseite | erledigt |
| B-28 | PHP2Shell (CVE-2026-109618/-109619) patchen | erledigt |
| B-29 | WordPress `www.komplexitaeter.de`: Backups waren öffentlich – Nacharbeiten | neu |
| B-30 | Server auf Ubuntu 24.04 heben (vor April 2027) | neu |
| B-31 | API-Review / HTTP-Semantik (Spike) | erledigt (Spike + M1–M3; M4 = B-11 erledigt) |
| B-32 | CI: `playwright install --with-deps` beschleunigen | erledigt (release) |
| B-33 | Namensänderung setzt Karte auf Kaffeetasse; Verlassen räumt Karte nicht | erledigt |
| B-34 | Synchrone XMLHttpRequest (deprecated) auf async umstellen | neu |
| B-35 | Bilder/Assets verschlanken (SVG, PNG, Icons) | refined |
| B-36 | Totes/redundantes CSS entfernen, `style.css` aufräumen | refined |
| B-37 | Responsive per CSS statt JS (`.mobile`/`.desktop`) | neu |
| B-38 | `dao.php`-Payload und Render-Pfad verschlanken (Spike) | refined |
| B-39 | Resize: Karten sofort neu positionieren statt zu animieren | refined |
| B-40 | Look & Feel / UX-UI-Überarbeitung (Epic) | neu |

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
- In CI gefunden: `save_topic()` meldete die Änderung per WebSocket, bevor der Server das Thema gespeichert hatte;
  bei langsamem Server luden die Boards das alte Thema → Benachrichtigung erst nach der Antwort (`onload`).

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

**Zuerst analysieren (Sprint 4, Analyse-Spike), bevor gelöscht/verdichtet wird:**
- Wofür werden die Events gebraucht? Vermutlich im Wesentlichen `stats.php` (aggregiert `event_code`-Summen der
  letzten 14 Tage) und ggf. **Grafana** (externe Instanz, Abfragen noch offen → von Andreas einholen, damit wir
  keine Events entfernen, die ein Chart braucht).
- **Schreiblast reduzieren:** Welche Events schreibt das Frontend wie oft? Jeder Event ist ein zusätzlicher Call.
  Prüfen, welche sich zusammenfassen/weglassen/entprellen lassen (spart Writes *und* Requests).
- Erst danach die eigentliche Begrenzung: Aufbewahrungsdauer + Lösch-/Verdichtungs-Job.

Offene Fragen: Wie lange werden Rohdaten gebraucht? Wie groß ist die Tabelle heute? Welche `event_code`s nutzt Grafana?

**Spike-Ergebnis (2026-10-22):** Einziger Schreiber `api/measure_event.php` (ein GET je Event, fire-and-forget),
**kein hochfrequentes Event** (kein Resize-/Poll-/Pull-Tracking) – Volumen entsteht nur durch viele Teilnehmer ×
Sessions, dominiert von `BOARD_ON_LOAD`. Einziger Repo-Leser: `stats.php` (14-Tage-Fenster). Grafana extern. Tote
Kanten: `LINK_SIMULATION_INFOS`/`LINK_SIMULATION_LOGIN` werden von stats.php angezeigt, aber nirgends erzeugt
(dauerhaft 0); `INIT_ON_LOAD`/`OPEN_TOPIC_BOX`/`OPEN_USER_SETTINGS_BOX` werden erzeugt, aber von keinem Repo-Leser
genutzt. **Tendenz (Andreas, 2026-10-22): so lassen** – die Schreib-Reduktion bringt wenig, das reine Wachstum ist
voraussichtlich klein. Nächster Schritt: Tabellengröße auf dem Server messen (SQL vorbereitet); bei Bedarf später ein
Retention-/Pruning-Job auf `creation_date`. Grafana-`event_code`s weiterhin offen.

**Größen-Messung (Live, 2026-10-22):** ~1,19 Mio. Zeilen, **94 MB** (76 MB Daten + 18 MB Index), Tracking seit
2021-03-23 (~5,5 Jahre). Normale Tagesrate ~700–1.400 Events. **Entscheidung (Andreas): so lassen** – das Wachstum
ist vernachlässigbar, kein Pruning-Job nötig. Falls die Tabelle irgendwann doch stört, genügt ein einfacher
Lösch-Job auf `creation_date` (> N Jahre). Beobachtung am Rande: Tagesausreißer 2026-10-13 mit 86.580 Events
(sonst ~1k); `api/measure_event.php` ist unauthentifiziert und kann von Bots vollgespammt werden – bei der
Tabellengröße folgenlos, passt zum geheime-URL-Modell. Offene Nebenpunkte (kein Teil von B-09, nur notiert): tote
`stats.php`-Spalten `LINK_SIMULATION_*` (dauerhaft 0) und die nicht-gelesenen `event_code`s könnten bei Gelegenheit
in `stats.php` aufgeräumt werden.

### B-10 `poker-msg` modernisieren und absichern
Ratchet 0.4 wird kaum gepflegt; der Prozess läuft unter supervisor als `root`; keine Begrenzung von Verbindungen
oder Nachrichtengröße. Läuft nicht als root, Abhängigkeiten aktualisieren oder Alternative prüfen.
Heartbeat ergänzen: verwaiste Verbindungen (vergessene Tabs, Laptop im Ruhezustand) nach z. B. 2 Minuten schließen.

### B-11 Schreibende API-Aufrufe per POST statt GET
Zustandsändernde Endpunkte werden per GET aufgerufen (Prefetching, Logs mit Parametern, kein CSRF-Schutz).
Voraussetzung: B-04, damit Frontend und API gemeinsam umgestellt und getestet werden.

**Refined (2026-10-22):** Scope aus dem B-31-Spike (= M4). Alle zustandsändernden Endpunkte von GET auf POST, je
Endpunkt gemeinsam mit seinen Frontend-`fetch`-Aufrufen (`method:'POST'` + `body`), gestaffelt pro Endpunkt (Backend +
Frontend zusammen deployen, sonst 405). Betroffen (~30 fetch-Stellen): name, setc, newround, delete, timer,
update_team, update_cardset, update_results_order, update_show_avg, update_user, feedback, measure_event, get_promo,
update_promo, delete_user, addteam; `update_topic.php` ist bereits POST (Vorbild). Team-ID darf weiter per GET-Query
kommen (Routing), nur die zustandsändernden Nutzdaten in den Body. Nutzen: kein Prefetch/Logging von Writes – **kein**
CSRF-Schutz (keine Auth). AK: alle Writes laufen per POST; E2E weiter grün; `?v=`-Bump für geänderte JS. Umsetzung in
2–3 Häppchen, nicht alles in einem PR.

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
in Markdown-Links laut Security-Review, auslösbar über ein Thema, z. B. per Einstiegslink `/?tool=x&text=…`).
Im Refinement klären, welche Version welche Lücke behebt (Dependabot schlug 1.7.2 vor, der Review nennt 1.7.4
oder neuer); Dependabot-PRs #3/#4 hoben nur die Testkopie an. Live (`board.html`) und Tests (`tests/e2e/package.json`, `cdnFiles` in
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
- PHP-FPM: `pm.max_children = 5` – am 14.10. (Vorfall `stats.php`) einmal erreicht; für den **8.4-Pool bestätigt**
  (Stand 2026-10-20). Im Normalbetrieb ausreichend: in der Werktags-Spitze (2026-10-20, 33.767 Req/h um 08:00)
  **keine** „max_children reached"-Warnung im 8.4-FPM-Log und keine 502/504. Für das Wachstumsziel dennoch knapp –
  bei ~2,5 GB freiem RAM und realem Worker-Verbrauch deutlich unter `memory_limit` (256 MB) moderat anheben
  (grob `max_children` 15–25, `start_servers`/`min`/`max_spare_servers` entsprechend). Zusätzlich
  `request_terminate_timeout` setzen (hängende Requests blockieren nicht alle Worker) und `slowlog` aktivieren.
- MySQL: `slow_query_log` ist aus (Stand 2026-10-20: 2 Slow Queries > 10 s seit dem letzten Neustart, früher 9) –
  Log aktivieren und auswerten. `skip-name-resolve` gegen die DNS-Warnungen durch Verbindungsversuche von außen
  (421 abgebrochene Verbindungen seit dem letzten Neustart, siehe B-13). **Achtung:** `skip-name-resolve` bricht
  hostbasierte Grants – das externe Grafana (`grafana_usr`) vorher prüfen, sonst nur IP-/`%`-Grants nutzen.
- Monitoring: `log-summary.sh` liest seit 2026-10-20 PHP 8.4 (vorher 8.1) und zeigt damit die echten 8.4-Pool-Werte.

**Refined (2026-10-22):** Reine Server-Config (Andreas führt aus; Kai bereitet Schnipsel + Befehle vor), nur der
**poker-Pool**, beide Server. FPM: `pm.max_children = 15`, `start_servers`/`min_spare`/`max_spare` entsprechend,
`request_terminate_timeout 60s`, `slowlog` + `request_slowlog_timeout 5s`. MySQL: `slow_query_log = ON`,
`long_query_time = 2`, `slow_query_log_file` prüfen. **`skip-name-resolve` vorerst NICHT** (geringe Priorität, Risiko
für hostbasierte Grafana-Grants). AK: erhöhte FPM-Werte aktiv auf beiden Servern; Slowlog (FPM + MySQL) läuft; eine
Nachkontrolle (per `log-summary.sh`) zeigt keine `max_children reached`-Warnung und erfasste Slow Queries.

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

**Stand 2026-10-21 (Staging, Andreas):**
- Platte war zu 98 % voll: rund 8 GB UpdraftPlus-Backups der WordPress-Seite seit 2024 gelöscht → 64 % (siehe B-29).
- `ondrej/nginx`-PPA entfernt (eingestellt seit April 2026). nginx von 1.28 (PPA) auf 1.18 aus dem Ubuntu-Repo
  zurückgesetzt, wie auf Live; dafür in `flowgame.komplexitaeter.de` `http2 on;` → `listen 443 ssl http2;`.
  Sicherungen: `/root/nginx-backup-2026-10-21`, `/root/flowgame.komplexitaeter.de.bak`. Alle Updates, Reboot erledigt.
- Live nutzt den nginx-PPA nicht (nginx 1.18 aus Ubuntu) – dort nichts zu tun.
- **Korrektur:** PHP 8.1 auf **Live wird noch genutzt** (`teamcar`, `feedbck`) – dort nicht deinstallieren.
  Pin-Datei `/etc/apt/preferences.d/php8.1-from-ubuntu` vorgeschlagen, damit 8.1 nicht aus dem PPA kommt;
  `php8.1-mysql` per `apt-mark manual` vor `autoremove` schützen.
- Staging auf nur noch PHP 8.4 konsolidieren (Bestandsaufnahme gemacht):
  - 8.0 (nur CLI), 8.1 (FPM, ungenutzt, abgeschaltet): sofort deinstallierbar.
  - `flowgame` (3 Pools), `kaffeeklatsch`: Pools von 8.3 nach `/etc/php/8.4/fpm/pool.d/` verschieben (Sockets bleiben).
  - `www.komplexitaeter.de` (WordPress, 8.2): eigener 8.4-Pool `komplexitaeter-www` mit den Werten aus 8.2-`www.conf`
    (100M Upload, `max_input_vars 3000`, 300 s), `php8.4-imagick` nachinstallieren, vorher WP-Version/Plugins prüfen.
  - Danach 8.2/8.3 deinstallieren, wenn alles ein paar Tage stabil läuft.
- **Umgesetzt (2026-10-21, Andreas):** Staging läuft nur noch auf PHP 8.4. Pools `flowgame.conf`, `kaffeeklatsch.conf`,
  `komplexitaeter-www.conf` (WordPress) in `/etc/php/8.4/fpm/pool.d/`, `php8.4-imagick` installiert, nginx umgestellt;
  PHP 8.0–8.3 entfernt (purge), Reste alter Kernel entfernt, `apt` ohne offene Updates. Alle Seiten antworten mit 200.
  Upstream `flowgame_prototype` ebenfalls auf `php8.4-fpm.sock`; keine Verweise auf 8.0–8.3 mehr in nginx.
- **Live umgestellt (2026-10-21, Andreas):** `teamcar` und `feedback` in eigenen 8.4-Pools (`teamcar.conf`,
  `feedback.conf`), Erweiterungen `bz2 curl gd intl mbstring zip` für 8.4 nachinstalliert, Syntaxcheck mit `php8.4 -l`
  ohne Befund. PHP 8.1, `libapache2-mod-php8.1`, `apache2-bin`/`-utils` und **phpMyAdmin** entfernt (purge, war seit
  B-16 nicht mehr erreichbar). Ubuntus `composer` 2.2 (lief unter 8.4 nicht mehr) samt `php-symfony-*` usw. ersetzt
  durch offizielles Composer 2.10 in `/usr/local/bin/composer`; `composer install --dry-run` in `poker-msg` ok.
  Hinweis: Symlink `sites-enabled/feedbck…` zeigt auf `sites-available/feedback…`. `apt` ohne offene Updates.
  **Damit läuft auf beiden Servern nur noch PHP 8.4.** Offen aus diesem Eintrag: Upload-Grenzen (s. o.).
- **Dritter Server `vps-b9348783` (2026-10-21, Andreas):** Nebenprojekte, gehört nicht zu Poker (`the-agile-game`,
  `daily-habit-tracker`, `kfs` mit PHP; `andreas`, `francois`, `fraxicle` statisch). War rund ein Jahr ohne Updates,
  weil der eingestellte `ondrej/nginx`-PPA `apt update` blockierte. PPA entfernt, alle Updates eingespielt, nginx
  1.28 → 1.18 (Ubuntu; `http2 on;` in `andreas`, `francois`, `fraxicle` → `listen … http2`), PHP 8.2 → 8.4
  (Standard-Pool, `php8.4-mbstring`/`-mysql`/`-sqlite3`), PHP 8.2/8.3 entfernt, Neustart.
  **Panne:** `php8.4-fpm` war beim Umstellen nicht installiert → PHP-Teile von `the-agile-game`,
  `daily-habit-tracker`, `kfs` lieferten ca. 16:45–17:31 UTC einen 502 (Startseiten statisch, daher fiel es beim
  `curl`-Test nicht auf). Lehre: nach Umstellung einen PHP-Endpunkt testen, nicht nur `/`.
- `fraxicle`: Scanner-Anfragen auf `/_adminer/adminer.php.*` – geprüft, kein Adminer und keine `.php`-Dateien im
  Webroot, nur blindes Scannen. PHP nach der Panne geprüft: `kfs` läuft, `the-agile-game` (statisch, PHP nur für
  `api/game_state_logger.php`) antwortet wieder (400 statt 502).

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

### B-25 Board blitzt beim Laden kurz mit allen Elementen auf
Beim Laden des Boards sind teilweise kurz alle Elemente im Standardzustand sichtbar (z. B. der Timer), bevor die
erste Server-Antwort sie richtig einstellt – auch vor dem Namens-Overlay. Gut reproduzierbar in Safari mit
Option-Cmd-R (Neuladen ohne Cache). Ursache (vermutet): Das Ausblenden bis zur ersten Antwort stand nur in
`style/style.css` (`body { opacity: 0 }`); malt der Browser das HTML, bevor das Stylesheet geladen ist, fehlt es.
In Chrome nicht reproduzierbar (blockiert das Rendern bis zum Stylesheet).

**Fix:** `style="opacity: 0"` direkt am `<body>` von `board.html` und `init.html`; das JavaScript setzt nach der
ersten Antwort wie bisher `opacity: 1`. E2E-Test: ohne Stylesheet und mit langsamer erster Antwort bleibt das Board
unsichtbar, danach wird es sichtbar (Gegenprobe ohne Fix schlägt fehl).

**Akzeptanzkriterium:** In Safari mit Option-Cmd-R auf Staging kein Aufblitzen mehr (manuell, Safari ist in CI nicht verfügbar).
**Erledigt 2026-10-16:** auf Staging in Safari bestätigt, Release nach `master`.

### B-26 `toggle_topic_box`: `Cannot read properties of null`
Beim Staging-Test zu Sprint 3 gefunden, tritt aber **auch auf Live/`master`** auf (kein Sprint-3-Regressionsfehler, eigener
Bestandsbug). In der Browser-Konsole:
`TypeError: Cannot read properties of null (reading 'style') at toggle_topic_box (script/script_feedback.js:197) at toggleTopnav (script/script_feedback.js:6)`.
`script_feedback.js` ist seit Längerem unverändert. Vermutlich greift `toggle_topic_box()` auf ein Element zu, das in
bestimmten Zuständen (noch) nicht im DOM ist. Offene Fragen: unter welchen Bedingungen genau (welcher Button/Zustand),
und ob der Fehler sichtbare Folgen hat oder nur Konsolen-Rauschen ist. Fix vermutlich ein Null-Check vor dem
`.style`-Zugriff.

**Refined (2026-10-22):** Ursache gefunden – `toggle_topic_box()` liest `getElementById('topic_box')` und greift
**ohne Null-Check** auf `.style` zu; `#topic_box` existiert nur in `board.html`, nicht in `init.html`. Der Klickhandler
`toggleTopnav` (schließt bei Klick außerhalb alle Boxen) ruft `toggle_topic_box(false)` auch dort → `e` null →
TypeError; die danach aufgerufenen Toggles brechen dann ab. Fix: Null-Guard wie bei `toggle_cardset_box`
(`if (e !== null)`), **plus kurzer Audit** der übrigen Toggles (feedback/info/user_settings), fehlende Guards ergänzen.
AK: kein TypeError beim Außen-Klick (init.html + board); alle Boxen schließen korrekt; `?v=`-Bump für
`script_feedback.js` in board.html **und** init.html; optional E2E (keine Konsolenfehler auf init.html beim Außen-Klick).

### B-27 `apple-touch-icon` fürs Board/Startseite
iOS fragt beim „Zum Home-Bildschirm" `apple-touch-icon.png` und `apple-touch-icon-precomposed.png` im Webroot an;
beide fehlen → je ~18 404/Tag im nginx-Error-Log (Stand 2026-10-20). Poker wird viel mobil genutzt, daher doppelt
sinnvoll: ein ordentliches Home-Screen-Icon ablegen (z. B. aus dem vorhandenen Logo in `src/`) und optional per
`<link rel="apple-touch-icon">` in `board.html`/`init.html` referenzieren. Beseitigt das Log-Rauschen und liefert
ein sauberes Icon auf dem Homescreen. Klein; kein Backend. Offene Frage: eine Größe (180×180 reicht meist) oder
mehrere, und ob zusätzlich ein normales `favicon`/`manifest` gepflegt werden soll.

**Refined (2026-10-22):** Basis-Logo `https://www.komplexitaeter.de/wp-content/uploads/logo-small.png` (davon ist auch
das bestehende `favicon.ico` abgeleitet). Vorgabe (Andreas): **alle Favicons & Touch-Icons nach `src/` umziehen und
explizit im `<head>` verlinken** statt Root-Auto-Discovery. Konkret: `favicon.ico` (liegt aktuell im Repo-Root,
git-getrackt, wird ohne `<link>` auto-gefunden) nach `src/` verschieben; aus dem Basis-Logo ein quadratisches
**180×180 `apple-touch-icon.png` mit opakem Hintergrund** (iOS macht Transparenz schwarz) + ein PNG-favicon (z. B.
32×32) erzeugen (`convert`/ImageMagick ist vorhanden); alles in `src/`. In `board.html` **und** `init.html`
`<link rel="icon" href="src/favicon.ico">` (bzw. PNG) und `<link rel="apple-touch-icon" href="src/apple-touch-icon.png">`
ergänzen. AK: echte iOS-Geräte laden das verlinkte Icon (kein `/apple-touch-icon.png`-Probe-404 mehr), favicon weiter
sichtbar, iOS „Zum Home-Bildschirm" zeigt das Logo. (Hinweis: blinde Bot-Requests auf `/apple-touch-icon.png` im Root
können als Scanner-Rauschen weiter 404 liefern – bewusst in Kauf genommen.)

### B-28 PHP2Shell (CVE-2026-109618/-109619) patchen
**Akut, nachträglich vermerkt (2026-10-21).** BSI-Hinweis BITS-H 2026-297981-1032 (Kritikalität 3/Orange): zwei
Lücken im PHP-Kern, Codeausführung aus der Ferne ohne Anmeldung, CVSS 9.2, alle PHP-Versionen. Patch von PHP am
21.10. 14:00 UTC; Details vorab durchgesickert, erste Angriffe gemeldet. Laut Leaks (unbestätigt) Use-after-free bei
`session.upload_progress`, ausgelöst durch `multipart/form-data`-POST.

Betroffen: Live 8.4 (Poker, ondrej-PPA) und 8.1 (`teamcar`, `feedbck`, Ubuntu); Staging 8.2/8.3/8.4.
Seit der Konsolidierung am selben Tag (B-23) auf beiden Servern nur noch 8.4 – ein Patch, ein Dienst.
- Übergangsweise auf beiden Servern `session.upload_progress.enabled = Off` in
  `/etc/php/<v>/fpm/conf.d/99-php2shell.ini` (Poker nutzt weder POST noch Sessions noch Uploads).
- 8.4.27 im ondrej-PPA am 21.10. hochgeladen, Pakete wurden noch gebaut (Launchpad zeitweise 503).
- Nach dem Einspielen: `php8.4-fpm` (Live zusätzlich `php8.1-fpm`) neu starten, `supervisorctl restart poker-msg`.
- PHP 8.1 von Ubuntu kommt über `unattended-upgrades` automatisch; Stand auf
  https://ubuntu.com/security/CVE-2026-109618 („jammy / php8.1“).
- Danach Kompromittierungs-Check: neue `.php`-Dateien seit 20.10., Prozesse/Crontab von `www-data`,
  ausgehende Verbindungen.

**Stand 2026-10-21 abends:**
- Alle drei Server (Live, Staging, dritter Server `vps-b9348783` mit Nebenprojekten) laufen nur noch auf PHP 8.4
  (B-23). Live-8.1 (`teamcar`, `feedbck`) damit erledigt.
- Notbremse `session.upload_progress.enabled = Off` (offizielle Empfehlung von PHP, zusammen mit **Neustart aller
  Worker** – `restart`, nicht `reload`) erst gegen 17:30 UTC auf allen drei Servern gesetzt; vorher fehlte sie auf
  Live und Staging. Laut PHP schließt sie nur einen Angriffsweg – nur das Update schützt vollständig.
- Laut PHP-Advisory: CVE-2026-109618 = Speicherkorruption bei Out-of-Memory mitten im Request; CVE-2026-109619 =
  Use-after-free durch Zustand, der zwischen Requests im selben Worker hängen bleibt. Fix in 8.5.12, 8.4.27,
  8.3.36, 8.2.35; 8.1 und älter offiziell ohne Fix. Teils als aktiv ausgenutzt gemeldet.
- 8.4.27 auf Launchpad gebaut, Binärpakete aber noch „Pending publication“ – noch nicht installierbar.
- Kompromittierungs-Check auf allen drei Servern **ohne Befund**: neue `.php`-Dateien nur aus dem Sprint-3-Deploy
  (20.10.), WordPress-Sprachupdate, AIOS-Firewall-Settings (`__halt_compiler`) und leere WP-Optimize-Cachedateien;
  keine fremden Prozesse, keine Crontab für `www-data`, keine unerwarteten Verbindungen.

**Akzeptanzkriterium:** PHP 8.4.27 (oder neuer) auf allen drei Servern, `php8.4-fpm` und `poker-msg` neu
gestartet, Check ohne Befund (✓).

**Erledigt 2026-10-21 (Andreas):** PHP 8.4.27 auf Live, Staging und dem dritten Server eingespielt (Launchpad hatte
die Pakete stundenlang auf „Pending publication“), supervisor/`poker-msg` dabei über die needrestart-Abfrage mit
neu gestartet, alle drei Server anschließend neu gebootet. Notbremse (`99-php2shell.ini`) bleibt vorerst liegen,
schadet nicht. Nicht umgesetzt (bewusst): nginx-Sperre für POST bei Poker, `memory_limit = -1`; automatische
PHP-Updates aus dem PPA (vorerst nicht gewünscht).

### B-29 WordPress `www.komplexitaeter.de`: Backups waren öffentlich – Nacharbeiten
Betrifft nicht die Poker-App, läuft aber auf dem Staging-Server. `www.komplexitaeter.de` ist die WordPress-Seite aus
`/home/ubuntu/neu.komplexitaeter.de/neu/`. UpdraftPlus legt täglich DB-Backups in `wp-content/updraft/` ab und
löscht keine alten (bis 2026-10-21 rund 8 GB). Das Verzeichnis war **öffentlich abrufbar** (`.htaccess` wirkt unter
nginx nicht); seit 2026-10-21 gesperrt (`location ^~ /wp-content/updraft/ { deny all; }`, `403`).

Ob Backups abgerufen wurden, lässt sich nicht feststellen: `.gz`/`.zip` sind per `access_log off` vom Logging
ausgenommen, Logs reichen nur 14 Tage zurück. Dateinamen enthalten eine zufällige ID, keine Verzeichnisliste →
Abruf unwahrscheinlich, aber nicht ausgeschlossen.

Offen:
- Passwörter aller WP-Konten mit Admin-/Redakteursrechten ändern, Salts in `wp-config.php` neu erzeugen.
- In Plugin-Einstellungen gespeicherte Zugangsdaten (SMTP, API-Schlüssel, Backup-Ziele) rotieren.
- Vorfall kurz dokumentieren; klären, ob die Seite personenbezogene Daten speichert (DSGVO).
- UpdraftPlus: Aufbewahrung begrenzen (z. B. 14 DB-Backups), Backups extern speichern.
- nginx-Logs länger aufbewahren (z. B. 30 Tage); `access_log off` für `.gz`/`.zip` überdenken.
- WordPress auf PHP 8.4 umstellen (siehe B-23).

### B-30 Server auf Ubuntu 24.04 heben (vor April 2027)
Die reguläre Unterstützung für Ubuntu 22.04 endet im April 2027 (danach nur noch ESM über Ubuntu Pro). Beide Server
auf 24.04 heben, zuerst Staging, vorher Snapshot beim Hoster; Live danach an einem Wochenende.
Zu beachten: ondrej-PHP-PPA wird beim Upgrade abgeschaltet und muss für `noble` neu eingerichtet werden (sonst fehlt
PHP 8.4); `ev` für `poker-msg` neu bauen (B-19); nginx wird 1.24; weitere Seiten auf beiden Servern mittesten.
Offene Fragen: Zeitpunkt; ob Ondřej für Ubuntu langfristig beim PPA bleibt oder auf `packages.sury.org` umzieht;
vorher Staging auf eine PHP-Version konsolidieren (B-23).

### B-31 API-Review / HTTP-Semantik (Spike)
Die API ist RPC-artig (ein Skript pro Aktion in `api/*.php`), Schreibzugriffe laufen über GET, Fehler werden ohne
sauberen HTTP-Statuscode behandelt (`validate_team(...) or exit;` → leerer 200). B-11 (POST statt GET) ist nur ein
Symptom davon.

**Spike (Analyse, risikofrei, ändert nichts am Live-Verhalten):** Bestandsaufnahme über alle `api/*.php` (+ `stats.php`):
je Endpunkt Methode, GET/POST-Parameter, Team-Check (`validate_team`), Response (JSON? leer? Echo?), Statuscode bei
Fehler, Auffälligkeiten. Ergebnis: eine **priorisierte Liste kleiner, einzeln deploybarer Verbesserungen**, z. B.
(1) HTTP-Semantik: Schreibzugriffe → POST (= B-11, im Kontext), (2) saubere Statuscodes + `Content-Type` statt leerem
`exit`, (3) einheitliche Response-Form, (4) Team-Check-Abdeckung bestätigen, (5) ggf. Endpunkte konsolidieren.

**Kein REST-Redesign** (widerspricht dem pragmatischen Grundsatz; hoher Aufwand/Risiko an der Live-App bei kaum
Nutzerwert). Umsetzung einzelner Punkte optional im selben Sprint, wenn sie sich als lohnend zeigen; sonst werden sie
als eigene kleine Backlog-Einträge priorisiert.

**Spike-Ergebnis (2026-10-22):** Team-Check-Abdeckung nach B-01 **vollständig** (alle team-bezogenen Schreib-Endpunkte
rufen `validate_team()` vor dem Write; Endpunkte ohne VT sind user-/SID-scoped) – keine Sicherheitslücke. Vorbilder im
Repo: `update_promo.php` (saubere Statuscodes), `update_topic.php` (bereits POST). Maßnahmen: **M1** Fehler-Contract
(leerer 200 → Statuscodes), **M2** JSON-Header (`addteam.php`, `get_promo.php`), **M3** letzte SQL-Konkatenation in
`update_user.php`, **M4 = B-11** GET→POST (~30 fetch-Stellen, eigener Sprint), **M5** Umbenennungen/Konsolidierung
(nur notiert, u. a. `get_promo.php` ist faktisch `create_promo`). **In Umsetzung (Sprint 4):** M2 + M3 + M1-Minimal
(403 statt leerem 200 bei ungültigem Team) auf `feature/B-31-api-hygiene`. Kein REST-Redesign.

### B-32 CI: `playwright install --with-deps` beschleunigen
In `.github/workflows/e2e.yml` lädt der Schritt „Install Chromium" per `npx playwright install --with-deps chromium`.
Der Browser selbst wird über `actions/cache` gecacht (Key an `package-lock.json`), aber `--with-deps` macht zusätzlich
jedes Mal ein `apt-get` für die OS-Bibliotheken. Normal in Sekunden durch, am 2026-10-22 bei B-11 aber **~12 min**
(langsamer apt-Mirror auf dem Runner) – knapp unter dem 15-min-Job-Timeout. Idee: `--with-deps` weglassen (die
`ubuntu-24.04`-Runner bringen die Playwright-Libs i. d. R. mit) oder die Deps separat cachen/robuster machen
(Retry/Timeout). Klein, reine CI, kein App-Code. Nice-to-have, nicht dringend.

**Erledigt (release, 2026-10-22, PR #24):** `--with-deps` entfernt → `npx playwright install chromium`. Der
`ubuntu-24.04`-Runner bringt die nötigen Shared Libraries mit; der Browser-Binary bleibt über `actions/cache`
gecacht. Ergebnis: der e2e-Job lief in **~1 min** (vorher bis ~12 min, knapp am 15-min-Timeout). Vorgezogen, weil der
langsame apt-Schritt jeden Lauf bremste.

### B-33 Namensänderung setzt Karte auf `break01`; Verlassen räumt die Karte nicht
**Beim Staging-Test Sprint 5 gefunden (Andreas), Bestandsbug (auch auf Master).** Benennt sich ein aktiver Spieler um,
während die Runde „alle fertig" ist, bekommt er plötzlich die Kaffeetasse (`break01`) – das Nachzügler-Verhalten.
Ursache: `api/name.php` (Zweig „Spieler existiert & ist PLAYER") setzt im UPDATE
`ppt.card_key = if(all_players_ready=1,'break01',card_key)`. Diese `break01`-Logik ist für echte Nachzügler gedacht
(INSERT-Zweig + zurückkehrender entfernter Spieler), greift hier aber auch bei einer reinen Umbenennung/Observer-Toggle
eines aktiven Spielers.

Zusätzlich fiel auf: Beim **Verlassen/Entfernen** wird nur `player_type='REMOVED'` gesetzt (`name.php` Leername,
`delete.php`) – `card_key` bleibt stehen (ein „Geist-Vote"). Geleert wird `card_key` sonst nur bei neuer Runde
(`newround.php`) und beim Zurücknehmen (`setc.php`).

**Fix (kombiniert, mit Andreas abgestimmt):**
1. Beim Verlassen/Entfernen zusätzlich `card_key = null` setzen (in `name.php`-Leername **und** `delete.php`).
2. In `name.php` die Umbenennung: `ppt.card_key = if(? = 1 and card_key is null, 'break01', card_key)` – Kaffeetasse
   nur für kartenlose (Wieder-)Einsteiger, aktive Spieler behalten ihre Karte.

**AK:** Umbenennen eines Spielers mit gelegter Karte (auch in fertiger/ aufgedeckter Runde) lässt die Karte
unverändert; ein entfernter Spieler hat keine Karte mehr; ein kartenloser Spieler, der in eine fertige Runde
(wieder) eintritt, bekommt weiterhin `break01`. E2E-Test deckt „Umbenennen behält Karte" ab. Reiner Backend-Fix,
kein `?v=`-Bump.

### B-34 Synchrone XMLHttpRequest (deprecated) auf async umstellen
Browser-Konsole meldet „Synchronous XMLHttpRequest on the main thread is deprecated" (Bestandscode, nicht neu).
Drei synchrone XHR (`open(..., false)`):
- `script/script.js:1050` `loadTextFileAjaxSync()` (via `loadJSON()`) – lädt eine JSON-Konfig synchron. Der Name sagt's
  schon; Refactor etwas größer, weil der Aufrufer einen synchronen Rückgabewert erwartet (→ async/await oder die
  Config anders laden).
- `script/script_feedback.js:502` (Sortierung ändern) und `:511` (Anonymität umschalten) – trivial auf async
  `fetch(...).then()` umstellbar.
Harmlos (nur Konsolen-Warnung; synchroner Request blockiert kurz den Main-Thread). **Niedrige Priorität.**

### B-35 Bilder/Assets verschlanken (SVG, PNG, Icons)
Thema „schlank" auf der Ausliefer-Seite. `src/` enthält ~97 Bilder; auffällig groß sind `brand_light.svg`/
`brand_dark.svg` (je ~140 KB) und die Karten-PNGs (~44 KB je Stück). Jedes davon geht ungeprüft über die Leitung.

**Refined (2026-10-22):** Reine Asset-Optimierung, **kein** sichtbarer Unterschied im Ergebnis.
- SVGs durch `svgo` o. ä. verkleinern (Metadaten, Nachkommastellen, unnötige Gruppen) – oft 50–80 % kleiner.
- Karten-PNGs verlustfrei optimieren (`oxipng`/`pngquant` nur, wenn optisch identisch); prüfen, ob WebP sinnvoll ist
  (Browser-Support unkritisch, aber doppelte Pflege → erst messen).
- Nur tatsächlich ausgelieferte Bilder anfassen; `src/xcf/` (GIMP-Quellen) bleibt unberührt.
- Prüfen, welche Assets überhaupt noch referenziert werden (tote Bilder = B-36-Nachbarthema).

**AK:** gleiche Darstellung in Light/Dark und auf dem Board; messbar kleinere Dateigrößen (vorher/nachher notieren);
E2E bleibt grün. Klein, reines Frontend/Assets, kein Code.

**Spike-Funde (2026-10-22):** Ausgeliefert (ohne `src/xcf/`) ~1,75 MB: 82 PNG (1,25 MB), 14 SVG (321 KB),
3 Vendor-JS (184 KB), 1 favicon.ico (15 KB). Größte Einzelposten: `brand_dark.svg`/`brand_light.svg` (je ~140 KB,
**bei jedem Board-Load** geladen), `logo_qr_code.png` (64 KB), `apple-touch-icon.png` (49 KB), Sterne-Karten
(`c_*stars*.png` ~42 KB je). Die Brand-SVGs sind **sauber** (512 `<path>`, kein Base64, keine Editor-Reste, keine
Überpräzision) → `svgo`-Gewinn vermutlich nur moderat.
- **Höchster Hebel = Server-Kompression (erledigt auf Live 2026-10-22).** Befund: `gzip on` war aktiv, CSS/JS wurden
  bereits gzipped, aber `image/svg+xml` fehlte in `gzip_types` (nginx.conf) → die Brand-SVGs (281 KB, bei jedem
  Board-Load) gingen ungepackt raus. Fix: `image/svg+xml` an `gzip_types` angehängt, `nginx -t` + `reload`.
  Gegencheck Live: `content-encoding: gzip` auf `brand_dark.svg` bestätigt (~180 KB/Board-Load gespart). brotli nicht
  einkompiliert – bewusst nicht nachgezogen (gzip reicht für diese Größen). **Staging ebenfalls erledigt**
  (2026-10-22): dort war die ganze `gzip_types`-Zeile auskommentiert (nginx-Default = nur `text/html`, also CSS/JS/SVG
  ungepackt); einkommentiert + `image/svg+xml` ergänzt, Gegencheck gzip bestätigt. Rand-Notiz: auf Staging bleiben
  `gzip_vary`/`gzip_comp_level`/`gzip_buffers`/`gzip_http_version` auskommentiert (nginx-Defaults statt Live-Werte) –
  funktional egal, optional für volle Parität nachziehbar.
- **9 wirklich tote Bilder (~130 KB), löschbar** (je einzeln gegengeprüft, 0 Treffer in HTML/CSS/JS/PHP/cards.json):
  `brand.png`, `brand_nobg.png`, `cta_home.png`, `edit.png`, `follow_us.png`, `home.svg`, `info_news.png`,
  `star_h.png`, `twitter.png`. **Achtung Gegenbeispiel:** `c_done001.png`/`c_prgrss1.png`/`c_prgrss2.png` wirken „tot",
  sind aber `display_card_key`-Zustände (script.js:296) → **nicht** löschen. Karten-PNGs (`c_*.png`) werden dynamisch
  aus `cards.json` gebaut (`'src/c_'+card_key+'.png'`) → nicht tot.
- Karten-PNGs verlustfrei mit `oxipng`/`pngquant` optimieren, nur wenn optisch identisch.

### B-36 Totes/redundantes CSS entfernen, `style.css` aufräumen
`style/style.css` ist ~1.950 Zeilen mit vielen mehrfach/ähnlich definierten Regeln (laut Andreas „drei-/vierfach").
Bestandsaufnahme (2026-10-22): 311 Selektoren, 0 `!important`, 144 `var(--)`-Nutzungen bei 30 Definitionen, 23
`-webkit-`-Präfixe, 0 `@media`, 34 Hex-Farben (25 verschiedene, teils Dubletten der Tokens).

**Refined (2026-10-22):** Aufräumen ohne sichtbare Änderung.
- Tote Selektoren finden (gegen `board.html`/`init.html` und die im JS gesetzten Klassen) und entfernen.
- Dubletten/ähnliche Blöcke zusammenführen; wiederkehrende Werte auf die vorhandenen Tokens (`var(--…)`) ziehen,
  Hex-Dubletten durch Tokens ersetzen.
- Überflüssige Vendor-Präfixe (`-webkit-`) prüfen – vieles ist heute unnötig (nur lassen, was Safari/iOS real braucht).
- **Vorsicht:** visuell Pixel-genau gegenprüfen (Board, init, Light/Dark, Overlays). Klassen werden teils dynamisch
  per JS gesetzt – „im HTML nicht gefunden" heißt nicht automatisch tot. Konservativ vorgehen, im Zweifel behalten.

**AK:** kein sichtbarer Unterschied (Sichtprüfung Board/init, Light/Dark, Topnav-Boxen); messbar kleinere `style.css`;
`?v=`-Bump für `style.css`; E2E grün. Mittel groß; erst nach dem Schlank-Spike schneiden.

### B-37 Responsive per CSS statt JS (`.mobile`/`.desktop`)
Das Layout schaltet derzeit teils über JavaScript zwischen Mobil- und Desktop-Darstellung (Klassen `.mobile`/
`.desktop`, an `window`-Größe gebunden) statt über CSS. `style.css` enthält **0 `@media`-Queries** – die Umschaltung
passiert im JS. Das ist fragil (kein echtes Reflow bei Rotation/Resize ohne JS-Lauf, mehr Code) und war Teil der
Karten-Bug-Historie (Karten wurden „riesig" beim Öffnen der DevTools).

**Noch zu refinen:** Umfang hängt vom Schlank-Spike ab (wie tief steckt die Größenlogik im JS?). Idee: Breakpoints
über `@media`/Container-Queries in CSS, JS-Größenlogik entfernen oder auf das Nötige reduzieren. Größerer Umbau mit
Regressionsrisiko → sorgfältig schneiden, viel E2E/Sichtprüfung. Erst nach B-36. Niedrige–mittlere Priorität.

**Spike-Funde (2026-10-22):** `adaptToDevice()` (script.js:842) setzt per `document.body.clientWidth`
(`getBrowserWidth`, Schwellen 800/991/1199) die Klassen `.mobile`/`.desktop` an **alle** `.sizefit`-Elemente; 98 der
311 CSS-Regeln hängen daran, **0 `@media`**. Der `resize`-Handler `handleResize()` (script.js:1082) ruft nicht nur
`adaptToDevice()`, sondern rendert **bei jedem Resize alle Spielerkarten neu** (`updatePlayersCards` + `showCardUsage`)
– genau das war die Ursache der „Riesen-Karten beim DevTools-Öffnen". Umbau auf echtes CSS-Responsive = größter
**struktureller** Gewinn (weniger JS, robuster bei Rotation/Resize), aber auch größtes Regressionsrisiko. Reihung:
nach B-36, ggf. zusammen mit B-14.

### B-40 Look & Feel / UX-UI-Überarbeitung (Epic)
Größeres Thema **nach** dem CSS-Refactoring (B-36 als technische Voraussetzung: erst aufräumen, dann umgestalten).
Ziel: Oberfläche modernisieren und mobil deutlich verbessern – **ohne den bestehenden Charme der App zu verlieren**.
Dafür eine eigene Design-Rolle (siehe `.claude/agents/`), die gestalten **und** technisch umsetzen kann.

Ideen-Sammlung von Andreas (2026-10-22, unsortiert, wird im Refinement geschärft und in einzelne Einträge
geschnitten):
- **Menüs als modales Voll-Overlay** (halbtransparent zum Hintergrund, wie „Become Observer/Player"), dadurch auch
  mobil sinnvoller mit responsiven Elementen aufbaubar.
- **Menüs userfreundlicher strukturieren und aufräumen.**
- **Kartenlayout verbessern** – z. B. die Spielernamen besser unter den Karten platzieren.
- **Karten mit Beschriftungen** ermöglichen (z. B. um echtes Delegation Poker zu spielen).
- **Content und Theming der Karten trennen** – z. B. Fibonacci-Zahlen mal mit Sommer-, mal mit Winterfarben.
- **Kartenziffern modernisieren.**
- **„Karte nach dem Aufdecken geändert"**: als zusätzliche Karte dargestellt, die auf die erste gelegt wird, wobei
  der ursprüngliche Wert noch erkennbar bleibt.
- **Kartenauswahl für Mobile deutlich verbessern.**
- **Mobile-Darstellung allgemein deutlich verbessern.**

Hinweis: Überschneidet sich mit B-37 (Responsive per CSS) – das Responsive-Fundament ist Teil dieses Themas. Vor
Umsetzung je Punkt eine REQ-artige Schärfung (Ziel, Umfang, Akzeptanzkriterien) und Schnitt in kleine, einzeln
deploybare Schritte; Verhalten/Datenmodell nur ändern, wo ausdrücklich gewollt (z. B. Karten-Beschriftungen und
Content/Theming-Trennung berühren Datenmodell/`cards.json` – dann Ben einbinden).

### B-39 Resize: Karten sofort neu positionieren statt zu animieren
Aus dem Schlank-Spike (2026-10-22) / B-37. Die Kartenpositionen hängen von Bildschirmgröße, Kartengröße, Anzahl und
Sortierung ab (mehrere Zeilen möglich, muss auch mobil gehen). Bei jedem `resize` berechnet `handleResize()`
(`script.js:1082`) die Positionen neu und setzt `card.style.left/top`. Auf `.c` liegt aber
`transition: left 1s, top 1s` (`style.css:415`), sodass die Karten beim Resizen **langsam gleiten** statt sofort zu
springen – es wirkt, als würden sie kurz verschwinden und wiederkommen. Die Slide-Animation ist für echte
Zustandsänderungen gedacht (Umsortierung, neue Karte), nicht fürs Resizen.

**Fix (klein, Frontend-only, abgestimmt mit Andreas 2026-10-22):** Beim Resize die Transition kurz abschalten,
Positionen sofort setzen, danach wieder aktivieren – plus Debounce gegen Ruckeln beim Ziehen. Konkret: `#cbox` eine
Klasse `.no-anim` geben (`#cbox.no-anim .c { transition: none; }`), in `handleResize()` vor dem Neupositionieren
setzen und nach zwei `requestAnimationFrame` wieder entfernen. Echte Umsortierungen animieren unverändert weiter.

**AK:** Beim Resizen/Rotieren springen die Karten sofort an die richtige Position (kein 1-s-Gleiten, kein
„Verschwinden"); eine echte Umsortierung (z. B. neue Runde, Aufdecken) animiert weiterhin wie bisher; Board und
Mobil geprüft; `?v=`-Bump für `script.js`/`style.css`; E2E grün. Unabhängig vom größeren B-37 (kann davor laufen).

### B-38 `dao.php`-Payload und Render-Pfad verschlanken (Spike)
`api/dao.php` ist der am häufigsten aufgerufene Endpunkt (jeder Client lädt nach jedem `pull` den kompletten
Team-Zustand neu). Vor einer Optimierung erst **messen/verstehen** (Spike): Wie groß ist die JSON-Antwort typisch?
Enthält sie Felder, die der Client nicht nutzt? Rendert das Frontend nach jedem `pull` alles neu oder nur Deltas?

**Spike-Ziel:** Bestandsaufnahme `dao.php`-Antwort (Felder, Größe, Häufigkeit) + Frontend-Render-Pfad (`updateDao`
in `script.js`). Ergebnis: priorisierte Liste (z. B. ungenutzte Felder weglassen, Caching/`ETag`, Delta-Updates) oder
Entscheidung „so lassen" wie bei B-09. Kein Umbau im Spike. Niedrige Priorität, aber hoher Hebel wegen der Frequenz.

**Spike-Funde (2026-10-22):** `api/dao.php` ist nur eine Hülle (`echo json_encode($data_obj)`); den Payload baut
`getDao()` in `api/lib.php`. Antwort: 25 Skalar-Felder (`name`, `topic`, `timer_*`, `all_players_ready`, …) + ein
`players`-Array (im Schnitt ~5–6 Einträge). Grob **1–2 KB** – **Payload-Reduktion lohnt nicht** (Tendenz „so lassen"
wie B-09; ungenutzte Felder wegzulassen spart kaum etwas).
- `cards.json`-Lesung: pro dao-Request **einmal** (über `sort_players_by_sequence`, `api/lib.php:95`); die zweite
  Lesung (`:447`) steckt in `add_team()` und läuft nur beim Team-Anlegen. Eine kleine Datei einmal lesen + decoden
  ist vernachlässigbar (OS-Filecache) → **kein Fix nötig** (ursprünglich fälschlich als „zweimal/Request" notiert).
- **Render-Pfad:** Das Frontend rendert nach jedem `pull` den **kompletten** Zustand neu (`updateDao`), keine Deltas.
  Delta-Rendering wäre der eigentliche Hebel, aber größerer Umbau – überschneidet sich mit B-14 (JS-Module) und B-37
  (Resize-Logik). Erst nach denen sinnvoll; hier nur notiert.
