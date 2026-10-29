# Backlog

Gemeinsames Backlog für Wartung und Weiterentwicklung. Ablauf siehe `CLAUDE.md`, Abschnitt „Zusammenarbeit“.

Status: `neu` → `refined` (gemeinsam verstanden, bereit für einen Sprint) → `im Sprint` → `erledigt`.
Reihenfolge = grobe Priorität, wird im Refinement angepasst.

## Aktueller Sprint

**Nächster Sprint (Sprint 8, geplant, Andreas 2026-10-23):** Fundament für B-40 – B-46 bis B-51 (Seitengerüst,
Touch, Topnav-Buttons, fluide Karten, Kleinpaket Qualität, Menüs neu denken). Planning läuft: Mockup `mockups/` (Delia) – Andreas hat Variante C (Panel/Dock) und Menüs als Side Panel am
Desktop gewählt; Runde 2 mit „Console Style“, Ergebnisdarstellung (B-53) und Topic-Liste (B-52).
**Entscheidung Andreas (2026-10-23): Console Style wird der Look der App, ohne Theme-Umschalter (Light/Dark bleibt).**
Mockup-Runde 3 abgenommen (Andreas, 2026-10-23), Entscheidungen: Board settings als Gruppen; gemerkter Wert wird
gespeichert (UI noch offen, mit B-52/B-53); Emojis sparsam (Emotions, Ampel, ☕, ✋); „New round“ bleibt Hauptbutton;
Delegation-Poker-Namen später. Desktop: Menüpunkt öffnet direkt das Side Panel, nur Schließen, kein „<“ zur
Menü-Übersicht (die gibt es nur mobil). Backlog-Ansicht im Detail später nachschärfen. Karten-Gleiten (FLIP, B-41)
bleibt genau so. Umsetzung in Schritten: 1 Console-Grundlage + Header/Buttons (B-48, Teile B-50) → 2 Seitengerüst
Panel/Dock (B-46, B-47) → 3 Menüs als Side Panel/Bottom-Sheet (B-51) → 4 fluide Karten (B-49, notfalls schieben);
parallel Ben: `symbol` und XXL-Fix in `cards.json`. Danach B-53 (Ergebnisse), B-52 (Topics).
**Stand 2026-10-27 abends (Sprint 8 umgesetzt):** In `release` zusätzlich: Teaser ausgebaut (#47; Backend-Feld
`hide_teaser` + DB-Spalte bleiben vorerst), Fit-Korrekturen (#48: Seitenabstand, Zone New Round/Stoppuhr bzw. Dock immer
reserviert, Lösch-Icon nach Eingabegerät statt Breite, Namen mit „…“), `--card-min` 64 px (#49: 375×667 bis 20 Spieler,
393×852 bis 25 ohne Scrollen). B-50 teilweise, B-55 offen (Andreas überlegt), `mockups/` bleibt. Nächstes: Andreas
sichtet Staging, dann PR `release` → `master` (Rollout 1).
**Rollout-Plan (Andreas, 2026-10-23):** Zwei Rollouts auf Live, ca. eine Woche auseinander.
1. **Rollout 1 (Ende Sprint 8): neuer Look, gleicher Ablauf** – Schritte 1–3 (+ 4, falls fertig). Topic, Ergebnisse,
   Durchschnittszeiger und Kartenstatistik fachlich wie heute (Topic im neuen Design am alten Ort als Übergang).
   Dazu B-55 (Hinweis-Toast + Umfrage). Vor dem Rollout klären: `mockups/` aus `release` nehmen oder mitlaufen lassen.
2. **Rollout 2 (Andreas, 2026-10-28 neu gedacht):** B-66 Basic Controls (Rundenknopf + Timer unten rechts) und B-67 Timer
   (T-Minus). Ergebnis-Seitenleiste (B-53) erst mit Rollout 3. Vorher geplant: B-53 (Ergebnisdarstellung) und B-52 (Topic-Backlog,
   History), mit Ben und Sina. Beginn erst, wenn Rollout 1 als PR nach `master` liegt.

Offen aus Sprint 2: Nachkontrolle von B-19 und B-24 nach der nächsten Werktags-Spitze
(`FD_SETSIZE`-Warnungen, Spitzenwert und Nachtverlauf von `active_users`). Offen aus Sprint 5: B-20-Nachkontrolle
(FPM-grep + `free -m`).

Abgeschlossen:
- **Nach Rollout 1 (live 2026-10-28, PRs #57–#66):** B-64 `stats.php` neu (Tabs Live/Usage/Ideas & Bugs/Tech,
  Runden pro Tag, aktive Tische = Runde in den letzten 60 min), B-63 eigene Anmeldeseite gegen die nginx-htpasswd
  (bcrypt, Cookie 30 Tage, `limit_req` nur auf `/stats.php`, Basic Auth entfernt), Feedback-Menü öffnet auf
  „Backlog“, Promo-Teaser aus, CI-Regel (kein Lauf bei PR → `master` und bei `*.md`, lokal nur betroffene Specs).
- **Sprint 8 – „Neuer Look“ = Rollout 1** (live 2026-10-28 mit PR #56): Console-Look, Seitengerüst, Menüs als Side
  Panel/Bottom-Sheet, fluide Karten (B-46 bis B-49, B-51, Teile B-50), Ideas & Bugs (B-57), Promo-Teaser „THE AGILE
  GAME“ abgeschaltet (#57, Code bleibt). Nächstes: Rollout 2 (B-53, B-52) etwa eine Woche später; Feedback über B-57
  beobachten, Basis-Kennzahl wiederkehrende User-IDs vorher/nachher.
- **Sprint 7 – „Konfiguration & CSS aufräumen"** (2026-10-23, live mit PR #35):
  - B-42: Sortier-Option „im Spiel wählen“ gestrichen, nur noch Kartenwert/Name; im Anonym-Modus fest „Card value“.
  - B-36 (mit B-37): `style.css` um gut ein Drittel kleiner, Responsive per CSS (ein Breakpoint, 800 px) statt
    `.mobile`/`.desktop` per JS, gemeinsame Klassen und Tokens. Danach Delias Einschätzung → B-46 bis B-51.
- **Sprint 6 – „Schlank & performant"** (2026-10-22/23, live mit PR #25 und #28):
  - Schlank-Spike (Assets, CSS, JS, `dao.php`) mit priorisierten Ergebnissen in B-35 bis B-38. Bewusst nicht verfolgt:
    tote Bilder löschen (kein Laufzeiteffekt), `dao.php`-Payload (1–2 KB, zu klein für Reduktion).
  - B-35 (Teil): gzip für SVG auf Live und Staging (~180 KB je Board-Load). Rest von B-35 (SVG/PNG optimieren) offen.
  - B-39: kein Gleiten beim Resize. B-32: CI-Install ~1 min statt ~12 min.
  - B-41: Kartenbereich per CSS-Flex statt JS-Positionen, Sortier-Glide per FLIP, Höhe gleitet bei Reihenwechsel;
    Ursache des Resize-Wobbelns (Timing-Fehler im B-39-Fix) per E2E-Test belegt und behoben; Nachfix für den Abstand
    des Löschen-Icons.
  - B-08: MySQL-Event-Jobs als `db_jobs_pok.sql` im Repo. Neu angelegt: B-40 (Design-Epic), B-42 (refined), Design-
    Agentin Delia.
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
| B-08 | MySQL-Statistik-Job ins Repo aufnehmen | erledigt |
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
| B-32 | CI: `playwright install --with-deps` beschleunigen | erledigt |
| B-33 | Namensänderung setzt Karte auf Kaffeetasse; Verlassen räumt Karte nicht | erledigt |
| B-34 | Synchrone XMLHttpRequest (deprecated) auf async umstellen | neu |
| B-35 | Bilder/Assets verschlanken (SVG, PNG, Icons) | refined |
| B-36 | CSS vereinfachen inkl. `.mobile`/`.desktop` → Responsive per CSS (mit B-37) | erledigt |
| B-37 | Responsive per CSS statt JS (`.mobile`/`.desktop`) | in B-36 aufgegangen |
| B-38 | `dao.php`-Payload und Render-Pfad verschlanken (Spike) | refined |
| B-39 | Resize: Karten sofort neu positionieren statt zu animieren | erledigt |
| B-40 | Look & Feel / UX-UI-Überarbeitung (Epic) | neu |
| B-41 | Kartenbereich auf CSS-Flex + FLIP umstellen (behebt Resize-Wobble) | erledigt |
| B-42 | Konfiguration vereinfachen: Sortier-Option „im Spiel wählen“ | erledigt |
| B-43 | `survey_intro` per `innerHTML` prüfen (Sina) | neu |
| B-44 | Startseite Light-Mode: Logo ohne Schriftzug | neu |
| B-45 | Toten Stern-Bewertungscode im Feedback entfernen | neu |
| B-46 | Seitengerüst neu (Kopf / Kartenbereich / Kartenleiste, `dvh`) | erledigt (release) |
| B-47 | Touch von der Breite trennen, Touch-Ziele ≥ 44 px | erledigt (release) |
| B-48 | Topnav aus echten Buttons, Hinweise als Text | erledigt (release) |
| B-49 | Fluide Kartengrößen | erledigt (release) |
| B-50 | Kleinpaket Qualität (Bewegung, Kontrast, Auswahl, Farbschema) | teilweise (release) |
| B-51 | Menüs neu denken: Overlays und sinnvolle Struktur | erledigt (release) |
| B-52 | Topics als Backlog-Items: Topic-Liste, aktives Topic, Historie je Topic | neu |
| B-53 | Ergebnisdarstellung neu (Verteilung, Zeiger nicht über der Eingabe, Historie) | neu |
| B-54 | Feedback-Text ohne `encodeURIComponent()` in der URL | erledigt (release) |
| B-55 | Rollout 1: Hinweis „New look – same game“ und Umfrage zur neuen Optik | verworfen (→ B-57) |
| B-56 | Players-Menü: Spielerliste mit Status, Entfernen statt Lösch-Icon auf den Karten | neu |
| B-57 | Ideas & Bugs: Meldungen mit Typ, öffentliche Liste mit Status und Abstimmung, Moderation | neu |
| B-58 | Geänderte Karte sichtbar machen: ursprüngliche Karte versetzt darunter (statt Sperren) | neu |
| B-59 | Aufdecken, bevor alle gewählt haben („reveal now“) | neu |
| B-60 | Spaß-Funktionen: Reaktionen/Emojis, Werfen, Fun-Karten | neu |
| B-61 | Eigene Kartenwerte / eigene Decks | neu |

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

**Erledigt (2026-10-23):** Export von Live (`mysqldump --events --routines --triggers`, keine Routinen/Trigger vorhanden)
liegt als `db_jobs_pok.sql` im Repo. Drei Events, `event_scheduler = ON`:
- `pok_active_users_evt` (minütlich) → `pok_active_user_stats`: aktive Spieler je Zeitfenster.
- `pok_daily_team_stats_evt` (täglich 23:55) → `pok_daily_teams_stats`: je Team mit Aktivität in 24 h; **`RECURRING`, wenn
  mehr als 2 Spieler aktiv waren, sonst `EXPLORING`**. Teams mit höchstens 2 aktiven Spielern werden nur am ersten Tag
  (`team_age < 1`) erfasst.
- `pok_active_use_evt` → `pok_active_use_stats_tbl`: **deaktiviert, lief nie** – Tabelle bleibt leer (Kandidat zum
  Aufräumen, nicht dringend).

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

**Neu-Zuschnitt (2026-10-23, Andreas):**
- **Analyse (Kai, 2026-10-23):** Kaum echte Doppel-Selektoren (5, fast nur Keyframe-Schritte). Die Redundanz steckt
  in gleichen Deklarationsblöcken für verschiedene Elemente (32 Blöcke, 90 Vorkommen, z. B. `display:none` 15× in
  zwei Schreibweisen) – jeder Button/jede Box einzeln gestylt statt über eine gemeinsame Basis – und in 117
  `.mobile`/`.desktop`-Varianten. Dazu 24 verschiedene Hex-Farben neben 30 Tokens, 25 `-webkit-`-Präfixe.
- **`.mobile`/`.desktop` wird mit aufgeräumt** (B-37 geht in B-36 auf): Responsive über CSS (`@media`) statt über die
  per JS gesetzten Klassen.
- **Vereinheitlichen ist ausdrücklich erwünscht:** Elemente, die faktisch gleich aussehen oder gleich aussehen
  *sollten* (z. B. Buttons, Boxen), bekommen eine gemeinsame Gestaltung, auch wenn ihre Werte heute auseinanderliegen
  (Rand, Radius, Abstände, Farben). „Kein sichtbarer Unterschied“ heißt: keine ungewollte Veränderung, nicht
  pixelgenau.
- **Kein Screenshot-Vergleichstest:** Andreas nimmt auf Staging per Sichtprüfung ab. Delia liefert zur Übergabe
  Vorher-nachher-Bilder der geänderten Ansichten (einmalig, nicht als dauerhafter Test).
- Nach B-42, damit die wegfallende Sortier-Leiste nicht mit aufgeräumt wird. Planning folgt nach B-42.
- Beim B-42-Review gefunden (Delia, 2026-10-23), mit erledigen: Menü-Label „Set players transparency (only **effects**
  new rounds)“ → „affects“; bei 320 px Breite überlappt das Schloss-Icon den Text von „Show average“, und „Hide names on
  results (anonymous)“ wird abgeschnitten.
  Außerdem (Delia): Beim Sortier-Hinweis steht auf Desktop das letzte Wort „value.“ allein in der zweiten Zeile
  (z. B. `text-wrap: pretty`).

**Planning (Delia, 2026-10-23, freigegeben von Andreas):** 3 PRs mit je einer kurzen Abnahme auf Staging.
- **PR 1 Aufräumen** (Delia): tote Regeln (u. a. LinkedIn, alte Info-Box, `marquee`/`reaction1`, `#teamlink`/
  `#teamlist`, leere Blöcke), `-webkit-` auf die 4 nötigen Zeilen, letzte feste Farben als Tokens, Tippfehler
  „affects“, `text-wrap: pretty` beim Sortier-Hinweis. Bleibt: Tabellen-Regeln (`stats.php` nutzt `style.css`).
- **PR 2 Responsive per CSS** (Delia CSS/Markup, Fred JS/Tests): ein Breakpoint bei 800 px per `@media` statt
  `.mobile`/`.desktop`/`sizefit`; Regeln an derselben Stelle umschreiben (Spezifität). JS: `adaptToDevice()` und
  `sizeClass` raus, `toggleMobileMenu` per `matchMedia`. **`getBrowserWidth()`/`gDisplayType` bleibt für Analytics**
  (`display_type` in `pok_analytics_events_tbl`, Grafana). Startseite mobil: Logo, Farbschalter und Feedback zeigen
  (heute fehlt der Farbschalter). Löschen-Icon: auf Touch-Geräten (`hover: none`) immer sichtbar, sonst bei Hover –
  gleiches Prinzip wie heute, nur nach Gerät statt nach Breite. Neue `responsive.spec.ts` (Burger-Menü, Umschalten
  ohne Neuladen, `display_type` xs/lg, keine `mobile`/`desktop`/`sizefit`-Klassen mehr).
- **PR 3 Vereinheitlichen** (Delia): gemeinsame Basis für Buttons, Felder, Menü-Boxen, Overlays (Radius-/Abstands-
  Tokens); Fixes bei 320 px (Schloss-Icon). Button-Form orientiert sich an den Menü-Grafiken (abgerundet, wie die
  Topnav-Icons). Lange Menütexte bei 320 px bleiben vorerst (Menüs kommen mit B-40).
- Bleibt draußen (B-40): Menüs als Overlay, Segment-Schalter, Kartengestaltung, Kartenauswahl mobil, Platz-
  Konkurrenz, Tastaturbedienung von Burger/Schließen, grundsätzlich bessere Lösung zum Löschen von Spielern.

**Umgesetzt (2026-10-23, PR #32, #33, #34; auf Staging abgenommen von Andreas):** `style.css` 1.918 → 1.219 Zeilen
(−36 %). PR 1 tote Regeln/Präfixe/Farb-Tokens; PR 2 ein Breakpoint bei 800 px per `@media`, `.mobile`/`.desktop`/
`sizefit` und `adaptToDevice()` entfernt (Analytics-`display_type` bleibt über `getBrowserWidth()`), Löschen-Icon auf
Touch-Geräten immer sichtbar, Startseite mobil mit Farbschalter, neue `responsive.spec.ts`; PR 3 gemeinsame Basis
(`.btn`, `.btn-box`, `.field`, `.menu_box`, `.overlay_panel`, Radius-/Abstands-Tokens), einheitlicher Fokusring,
Felder mobil 16 px, Fixes bei 320 px. Nachgetragen: `script_feedback.js?v=1.9`.

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

**Querverweis (Delia, 2026-10-22):** Die konkrete Layout-Engine-Umstellung des Kartenbereichs (von JS-`getCardPos`/
`position:absolute` auf echtes Flex-Layout mit `gap`, Sortier-Glide per **FLIP**) ist in **B-41** ausgearbeitet –
sie löst zugleich das Resize-Wobbeln. Mit Fred gemeinsam schneiden.

### B-44 Startseite Light-Mode: Logo ohne Schriftzug
Beim B-36-Review gefunden (Delia, 2026-10-23), schon vorher so: Auf der Startseite (`init.html`) zeigt das Logo im
Light-Mode nur das Bildzeichen, der Schriftzug fehlt (Screenshot `init_w375_light.png` aus Delias PR-3-Vergleich).
Klein; vermutlich falsches Bild oder fehlender Light-Mode-Tausch auf der Startseite.

### B-45 Toten Stern-Bewertungscode im Feedback entfernen
Die Bewertungssterne im Feedback sind seit jeher per CSS ausgeblendet (`display: none`); der Stern-Code in
`script/script_feedback.js` (u. a. `fb_star_*`, `.blink`) ist damit toter Code. Bei Gelegenheit entfernen (Fred),
oder bewusst entscheiden, die Sterne wieder einzuführen.

### B-46 bis B-51: Fundament für B-40 (aus Delias Einschätzung, 2026-10-23)
Nach B-36 hat Delia CSS, Bildschirmgrößen und Touch bewertet: CSS gelb-grün (gut gegliedert, kein `!important`), aber
**nicht State of the Art** bei Touch und Seitengerüst, Bedienbarkeit rot (Bilder mit `onclick` statt Buttons). Kein
Big-Bang auf Mobile-first – Desktop-first mit einem Breakpoint bleibt –, aber das Fundament vor der Umgestaltung (B-40)
verbessern, damit neue Menüs und Karten nicht auf dem starren Gerüst landen. Andreas (2026-10-23): alle sechs Punkte im
nächsten Sprint angehen. Reihenfolge laut Delia: B-46 → B-47 → B-48 → B-49, B-50 nebenher; B-51 neu dazu (Andreas).
Bewusst „gut genug“, nicht anfassen: ein Breakpoint und Desktop-first, Durchschnittszeiger per JS,
`getBrowserWidth()` für Analytics, Invert-Filter für Icons, `opacity: 0` am `body` gegen Flackern.

### B-46 Seitengerüst neu (Kopf / Kartenbereich / Kartenleiste)
Heute: `.container` `100vh`, `.up-container` `89vh`, Kartenleiste `position: fixed` (feste 89/11-Aufteilung). Am Handy
ist `vh` wegen der Adressleiste unzuverlässig, im Querformat bleibt kaum Höhe; das ist die technische Wurzel der
„Platz-Konkurrenz“ (Timer, Topic, „New Round“ vs. Karten, B-40). Ziel: CSS-Grid mit `100dvh`, Kartenbereich scrollt
allein, Topic/Timer/New Round bekommen feste Zonen, Querformat mitbedacht, Safe-Area optional. Aufwand M (Delia).
Sichtprüfung auf echten Handys (iOS Safari) hoch und quer.

### B-47 Touch von der Breite trennen, Touch-Ziele ≥ 44 px
Heute wird „schmal“ mit „Touch“ gleichgesetzt: iPad/Touch-Laptop (≥ 800 px) bekommen Desktop-Größen (Icons 32 px,
Lösch-Icon 20 px, Thumbnails 27 px), Hinweise nur per Hover, iOS zoomt in Felder (16-px-Regel nur unter 800 px).
Ziel: `@media (pointer: coarse)` bzw. `(any-pointer: coarse)` für größere Ziele (≥ 44 px) und 16-px-Felder,
Touch-Alternative zu Hover-only-Elementen, `touch-action: manipulation` (der `body` reagiert auf `ondblclick`).
Aufwand S (Delia).

### B-48 Topnav aus echten Buttons, Hinweise als Text
Heute: Topnav-Icons sind `<img onclick>` mit festen `right: …px`-Positionen (bzw. `%` im Burger-Menü), Hinweisblasen
sind Text in PNGs (`cta_*.png`, nur per Hover, nicht themebar). Ziel: Flex-Leiste mit echten `<button>`-Elementen,
Hinweise als Text/Tooltips, per Tastatur bedienbar (Fokus, Screenreader). Aufwand M (Delia Markup/CSS, Fred
Öffnen/Schließen und Fokus). Passt zu B-51.

### B-49 Fluide Kartengrößen
Heute: Karten fest 100×148 px, Kartenleiste 45/55 px. Ziel: Größe über eine Variable (`--card-w: clamp(…)` +
`aspect-ratio`) für Tischkarten und Kartenleiste – am kleinen Handy passen mehr Karten nebeneinander, auf großen
Bildschirmen dürfen sie wachsen. Seit B-41 (Flex-Layout) einfach umsetzbar. Achtung: E2E-Test zum Kartenabstand
(B-41) prüft feste Abstände → mit anpassen. Aufwand S–M (Delia + Fred; Ben, falls Kartenbilder betroffen). Vor
„Kartenlayout“ und „Kartenauswahl mobil“ aus B-40.

### B-50 Kleinpaket Qualität
- `prefers-reduced-motion` auch für CSS-Animationen (Wackeln, Aufblitzen, Einblenden, Konfetti), heute nur fürs
  Karten-Gleiten in JS.
- `user-select: none` nur noch gezielt (Karten, Kartenleiste) statt auf dem ganzen `body` – Topic-Text kopierbar.
- Kontraste anheben: Datenschutz-Links und deaktivierte Elemente (`--box-disabled` in Dark ca. 1,6:1).
- Tokens für z-Index und Schriftgrößen; Token-Namen nach Bedeutung statt Einsatzort, einheitliche Schreibweise.
- Erster Besuch: Farbmodus aus `prefers-color-scheme` (eigener Schalter bleibt).
- Kleinkram: `font-family: Arial, serif` → `sans-serif`, Alt-Text „Se tup“, leere `<label>`s.
Aufwand S (Delia), kann nebenher laufen.

### B-51 Menüs neu denken: Overlays und sinnvolle Struktur
Aus B-40 herausgelöst (Andreas, 2026-10-23): die Menüdialoge als modales Voll-Overlay (halbtransparent zum
Hintergrund, wie „Become Observer/Player“), damit auch mobil sinnvoll mit responsiven Elementen; dabei die Menüs
**grundsätzlich überdenken** – welche Einstellungen es gibt, wie sie gruppiert und benannt sind, was in welches Menü
gehört (vgl. B-42: Sortierung in die Konfiguration, nicht ins Spiel). Delias Idee zur Spieler-Liste („Players“ statt
Lösch-Icon auf jeder Karte, siehe B-40) passt hierher. Dazu: Ein-/Ausblenden einheitlich machen (heute drei
Mechanismen: Hilfsklassen, `style.display` in `script_feedback.js`, `style.visibility`), lange Menütexte bei 320 px,
Segment-Schalter statt Selects, Tastaturbedienung von Burger/Schließen. Erst Konzept (Delia, mit Andreas abstimmen),
dann Umsetzung (Delia + Fred). Baut auf B-46 und B-48 auf.

### B-65 Zeitpunkt der gewählten Karte speichern (`card_time`)
Andreas (2026-10-28), später: Neue Spalte `pok_players_tbl.card_time`, gesetzt in `api/setc.php` beim Kartenlegen.
Damit ließe sich „aktiv“ in `stats.php` genau als „hat in den letzten X Minuten eine Karte gewählt“ definieren
(heute: Runde in der letzten Stunde abgeschlossen, B-63/B-64). Schemaänderung online (ca. 72.000 Zeilen), Ben + Sina.

### B-64 `stats.php` neu: Tabs, Live-Ansicht, sinnvollere Kennzahlen
Andreas (2026-10-28), sofort umsetzen (unabhängig von den Nutzern, passt zur Beobachtung nach Rollout 1). Refinement:
- **Tabs** (Console-Look wie die App, ohne Bibliotheken): Live | Nutzung | Ideas & Bugs | Technik.
- **Live:** aktive Teams/Clients (letzte 5 min), Runden letzte Stunde; Liste laufender Tische **mit Teamnamen**
  (geschlossener Bereich, Andreas) – Spielerzahl, Beobachter, Deck, Runden heute, aktiv seit, aufgedeckt ja/nein;
  Verlauf aktive Clients heute. Automatisch neu laden (ca. 30 s). Nie die Team-ID anzeigen (= Zugangsschlüssel).
- **Nutzung:** nur, was Grafana nicht zeigt (Grafana hat: Daily Teams exploring/recurring, New Rounds, Active Use,
  Peak Usage). Neu: neue vs. wiederkehrende User-IDs je Woche (Vergleich vor/nach Rollout 1, Tag markieren),
  Nutzung von Menüs/Funktionen über `pok_analytics_events_tbl` (veraltete Events wie Info-Box/Simulation-Links raus),
  Anteil Handy. Einfache CSS-Balken.
- **Ideas & Bugs:** Eingang + öffentliche Liste wie bisher, eigener Tab, Zähler für offene Meldungen.
- **Technik (klein):** Tabellengrößen (v. a. `pok_analytics_events_tbl`), PHP-Version, Release-Stand.
- Alle Abfragen mit Zeitbereich und `MAX_EXECUTION_TIME`; Ausgabe nur escaped (Namen sind Nutzereingaben).
Umsetzung Ben (Abfragen, Struktur), Delia (Look), Review Sina.

### B-63 `stats.php`: eigene Anmeldeseite statt Basic Auth
**Wieder aufgenommen (Andreas, 2026-10-28), vereinfacht:** Anmeldeseite prüft gegen die vorhandene nginx-Datei
`/etc/nginx/poker-stats.htpasswd` (eine Stelle für Zugangsdaten, Pflege weiter mit `htpasswd -B`; Einträge bcrypt,
auf Live umgestellt). Kein Passwort-Hash und kein Secret in `config.php` nötig. Danach `auth_basic` in nginx entfernen.
Andreas (2026-10-28): Chrome füllt den Basic-Auth-Dialog von `stats.php` nicht aus, und nach jedem Browser-Neustart
muss man sich neu anmelden. Idee: normales Login-Formular in `stats.php` (Benutzer + Passwort), damit
Passwortmanager speichern und ausfüllen; danach angemeldet bleiben (z. B. 30 Tage).
- Passwort nur als Hash in `config.php` (`password_hash`), Vorlage in `config.example.php`.
- „Angemeldet bleiben“ per signiertem Cookie (HMAC mit Secret aus `config.php`), nicht per PHP-Session: die
  Session-Dateien räumt Ubuntu nach `session.gc_maxlifetime` (24 min) ab. CSRF-Token für die Moderation bleibt.
- Schutz gegen Durchprobieren (z. B. Verzögerung nach Fehlversuch oder nginx `limit_req` auf `/stats.php`).
- nginx-Basic-Auth danach entfernen (Schritt auf beiden Servern) – oder als zweite Schicht behalten? → Sina.
- `docs/stats-basic-auth.md` und `CLAUDE.md` anpassen.
Umsetzung Ben, Review Sina.

### B-62 E2E-Tests für den Feedback-Pfad (rudimentär)
Vorschlag Tessa, Andreas (2026-10-27): ja, aber nur rudimentär; internes Backlog, nicht in der öffentlichen Liste.
Kernpfad: Meldung absenden (Bug mit Kontext, ohne Team-ID), einmal abstimmen, roter Punkt verschwindet nach dem
Öffnen des Menüs. Keine Randfälle.

### B-58 Geänderte Karte sichtbar machen (statt Karte sperren)
Häufigster Nutzerwunsch im Feedback (≈ 9×, 2022–2026): „Karte nach dem Aufdecken sperren“. Andreas (2026-10-27): intern
heiß diskutiert; Philosophie der App ist „nah an der Physik“ – am Tisch kann man seine Karte auch noch tauschen. Heute
deshalb das (inzwischen dezentere) Wackeln als Hinweis; manchen reicht das nicht, Sperren finden wir aber ein blödes
Feature. **Idee Andreas:** Ändert jemand nach dem Aufdecken seine Karte, liegen zwei Karten leicht versetzt
übereinander; jeder kann nachschauen, was die ursprüngliche Karte war – transparent statt verboten. Refinement nötig
(Darstellung, mehrfaches Ändern, Anonym-Modus, Daten: ursprüngliche Karte je Runde speichern → Ben).
**Erweiterung „Let them explain“ (Andreas, 2026-10-29, zusammen mit B-70):** Der Tipp nach dem Aufdecken bezieht sich
immer auf die **ursprünglich aufgedeckten** Karten. Wer niedrigste/höchste Karte hatte, bleibt in „Let them explain“,
auch wenn er danach ändert – man soll sich nicht durch Umlegen herausnehmen können (oft beobachtet, dann hört man die
Gedanken nicht mehr). Änderungen werden angezeigt, z. B. aufgedeckt B:2 C:2 A:4 D:6 → „Let them explain: B, C (2),
D (6)“; B ändert auf 3 → „Let them explain: B (2→3), C (2), D (6)“. Ggf. kommen neue Extremwerte dazu. Gleiche Datenbasis
wie oben (ursprüngliche Karte je Runde speichern, Backend). Öffentlich in der
Backlog-Liste (B-57)? – noch klären.

### B-59 Aufdecken, bevor alle gewählt haben
Feedback (3×): Button „reveal now“, wenn jemand abwesend ist, statt ihn zu entfernen. Andreas: ins Backlog + öffentlich;
refinen, Zusammenspiel mit dem Players-Menü (B-56) klären – evtl. fällt uns Smarteres ein.

### B-60 Spaß-Funktionen
Feedback (≈ 6×): Reaktionen/Emojis, Papierkugeln werfen, Fun-Karten, Emojis im Namen, Musik. Andreas: Backlog +
öffentlich; er hatte schon einmal ein Mock-up dazu gebaut, fand es cool. Refinement nötig.

### B-61 Eigene Kartenwerte / eigene Decks
Feedback (≈ 4×): eigene Zahlen/Begriffe, Business-Value-Deck. Andreas: Backlog + öffentlich, aber gut durchdenken;
offene Frage, ob so etwas irgendwann hinter eine Paywall gehört.

### B-57 Ideas & Bugs: Meldungen, öffentliche Liste, Abstimmung
**Rolle des Kanals (Andreas, 2026-10-28):** Kommunikationsinstrument zu unseren Usern und Feedbackkanal – keine
Abstimmung über die Roadmap. Wir bleiben Product Owner; Stimmen sind Hinweise, keine Priorisierung.
Andreas (2026-10-27), statt der Umfrage B-55 (Team: Verhalten ist das Hauptsignal, Umfrage-Antworten ohne „was“ wenig
verwertbar): Feedback-Panel erweitern zu „Ideas & Bugs“.
- **Melden:** Typ Bug / Feature / Other + Text; bei Bugs automatisch technischer Kontext (Browser, Fenstergröße, Touch,
  App-Version, Hell/Dunkel; **keine** Team-ID). Speicherung privat (neue Spalten `fb_type`, `fb_context` bzw. eigene
  Tabelle). Bestätigung per Toast („Thanks – we read every message.“).
- **Öffentliche Liste** darunter: Einträge mit Status (planned / in progress / ✅ done), von uns selbst formuliert
  (nie Nutzertexte direkt → keine Moderation fremder Inhalte nötig). Reaktion je Eintrag (z. B. ❤️ / 🙈), eine Stimme pro
  User-ID. Erster Eintrag: „New look ✅“ (ersetzt die Umfrage; einige Tage nach Rollout 1).
- **Moderation:** Eingang abhaken; Liste anlegen/ändern/Status setzen – in `stats.php` (seit Sprint 3 per nginx Basic
  Auth geschützt), Aktionen per POST an `stats.php` selbst. Sina reviewt.
- Aus B-55-Analyse noch offen, falls die Survey-Funktion je wieder genutzt wird: `get_survey.php` `bind_param('i')`
  → `'s'`; `fillBars[vote_option.id - 1]` → Index; Survey-Box auf `textContent` (B-43). Emojis: Tabellen sind `utf8mb3`
  → für ❤️/🙈 `utf8mb4` bzw. Codes statt Zeichen speichern.
- Ergänzend (Team-Konsens): Basis-Kennzahlen vor Rollout 1 festhalten (Ben): wiederkehrende User-IDs, Runden je
  Session, Menü-Nutzung – Vergleich vorher/nachher.
Umfang: 2–3 PRs (DB, API, Moderation in `stats.php`, Panel, Tests). **Zeitpunkt (Andreas, 2026-10-27): noch vor Rollout 1.**
- **Team-Einschätzung nach Umsetzung (2026-10-27), Entscheidungen Andreas:** Kanal = qualitatives Signal, Stimmen sind
  ein Stimmungsbild, keine Zählung. Bewusst **nicht**: Begrenzung der Stimmen pro Tag (wer den Aufwand treibt, sendet
  auch ein Signal; echte Absicherung bräuchte mehr als die User-ID), roter Punkt bei neuen Einträgen erneut (nervt
  Leute, die keine Rückmeldung geben wollen), Textfeld nach 👎 (dafür gibt es „New issue“), Sessions beobachten (zu
  aufwändig; bekannte Nutzer melden sich, wenn etwas klemmt). Tests: B-62.

### B-56 Players-Menü
Delias Idee aus B-40/B-51, von Andreas für nach Rollout 1 gewünscht („freue mich sehr“, 2026-10-27): eigener Menüpunkt
„Players“ im Side Panel / Bottom-Sheet mit Liste aller Spieler und Beobachter (Name, Rolle, Status, z. B. „inaktiv
seit …“), Entfernen mit Rückfrage. Das Lösch-Icon auf den Karten fällt dann weg (bis dahin: Icon bei Touch immer, mit
Maus nur bei Hover). Inaktive Spieler auf dem Tisch ggf. blasser. Für „inaktiv seit“ und Beobachter in der Liste
braucht es Ben (DAO liefert `last_callback_time` heute nur für Spieler). Sina prüfen lassen (Entfernen anderer).

### B-55 Rollout 1: Hinweis und Umfrage zur neuen Optik
Idee Andreas (2026-10-23): Nutzer nach Rollout 1 fragen, ob die Richtung passt. Bestehende Umfrage-Funktion nutzen
(`pok_survey_tbl`, `pok_survey_vote_options_tbl`, `pok_survey_votes_tbl`, `api/get_survey.php`, `toggleSurvey()`),
vermutlich nur per DB-Eintrag: „How do you like the new look?“ (z. B. Love it / Fine / Takes getting used to / Prefer
the old one), Intro verweist für Freitext auf die Feedback-Funktion. Dazu einmaliger Toast beim ersten Besuch nach dem
Rollout („New look – same game. Menus moved to the right.“, Toast-Mechanismus aus Schritt 2). Umfrage nicht
gleichzeitig mit dem Toast, eher ab dem zweiten Besuch. Delia: Umfrage-Box im neuen Look (Schritt 3). Ben: SQL für die
Umfrage, prüfen ob „ab zweitem Besuch“ ohne Code geht. Sina: B-43 (`survey_intro` per `innerHTML`) dabei miterledigen.
Auswertung nach einigen Tagen per SQL, getrennt nach wiederkehrenden und neuen Teams.

### B-54 Feedback-Text ohne `encodeURIComponent()`
Beim B-48-Review gefunden (Fred, 2026-10-23), schon vorher so: `feedback_submit()` in `script/script_feedback.js`
hängt den Text als `'&text=' + fb_text` an die URL. Mit `&` oder `#` im Feedback kommt der Text abgeschnitten an.
Fix: `encodeURIComponent()` (Konvention aus CLAUDE.md). Klein (Fred). Ebenso: „Delete User“ ist ein `<a>` ohne
`href` und per Tastatur nicht erreichbar → `<button>` im Link-Stil (mit B-51 erledigen).

### B-66 „Basic Controls“: Kartenleiste mit Rundenknopf und Timer (Rollout 2)
Andreas (2026-10-28): Die untere Leiste wird das „Basic Controls Panel“ – alles, was man mindestens zum Spielen
braucht: Karten wählen, Runde starten, Timer (optional). Desktop: Karten in der Leiste, Rundenknopf + Timer rechts
in einer Box, die so hoch ist wie die Leiste und (sobald es die rechte Leiste gibt) so breit wie die rechte Leiste –
es ergibt sich unten rechts ein sauberes „Kreuz“. Mobil: Timer + Rundenknopf liegen über den Karten (ähnlich heute).
Übergang bis zur rechten Ergebnis-Leiste (Rollout 3): Streuung (Spreads) und optional der Durchschnittszeiger über den
Controls anzeigen, wenn eine Runde aufgedeckt ist. Mockup-Runde 3 war in dieser Ecke noch unruhig. Erst Konzept
(Delia), dann Umsetzung (Delia + Fred).
**Entscheidungen Andreas (2026-10-28) nach Delias Konzept:** Optik wie im ursprünglichen Mockup (Runde 3): Timer
**über** dem Button, bei aktivem Timer unten rechts für alle die Standard-Symbole Pause/Reset (wie im Mockup). Spreads
bleiben vorerst, wo sie heute sind (über den Karten); Umzug ins Seitenpanel erst in der nächsten Iteration.

### B-67 Timer statt Stoppuhr (T-Minus)
Andreas (2026-10-28): Timer nach Raketenstart-Schema. Timebox 0 = wie heute, zählt T+ hoch (Stoppuhr). Timebox z. B.
5 Minuten = startet bei T−05:00 und läuft gegen 0, danach weiter ins T+. Offen (UX, Delia): Anzeige und Steuerung
trennen? Einstellungen (an/aus, Timebox, Pause/Reset) im Menü, für alle nur die Anzeige – oder Pause/Reset weiter
direkt unten? Braucht Ben (Timebox je Team speichern) und Fred.
**Entscheidungen Andreas (2026-10-28):** Eigenes Menü-Panel „Timer“ wie die anderen Menüs: dort Timer aktivieren
(dann sehen alle unten rechts Timer + Pause/Reset) und Timebox-Länge festlegen. Timebox 0 bleibt erlaubt = Stoppuhr;
das muss für den User verständlich erklärt sein. Timer an die Runde gekoppelt: „New round“ und „Cancel round“ setzen zurück und starten bei T−Timebox; Pause/Reset bleiben zusätzlich manuell (Andreas). Im Timer-Panel zusätzlich Schalter „bei jeder Runde neu starten“ an/aus – aus = Timer läuft über
mehrere Runden, z. B. als Timebox für ein Thema oder die ganze Session (dann auch längere Timeboxen).
**Final (Andreas, 2026-10-28, nach Screenshot-Mocks auf Basis der echten App – freigegeben zur Umsetzung):**
Timer-Panel: Timer an/aus · Modus **Stopwatch | Timer** (nur bei Timer: Timebox-Auswahl 3/5/10/15/30/60 + eigene
Minuten, max. 240) · „Auto-start on new round“ an/aus (New round und Cancel round setzen zurück und starten). Kein
Erklärtext für „0 = Stoppuhr“ mehr nötig. Defaults: Timer aus, Modus Stopwatch, Auto-Start aus. Migration: Teams mit
Timer an laufen als Stopwatch ohne Auto-Start weiter – alles wie bisher. Kopfzeile `:timer` (zwischen `:board` und
`:you`), Stoppuhr-Schalter entfällt. Ecke unten rechts: Timer über dem Button, Play/Pause + Reset als Linien-Icons;
„Zeit um“ = T+ in Amber, kein Ton. Kartenleiste und Spreads bleiben unverändert.

### B-68 Rechte Spalte (Desktop) + Primärsteuerung unten rechts
**Gestaltungsprinzip (Andreas, 2026-10-28):** Wer die App das erste Mal öffnet, soll sie einfach finden und nicht
erschlagen werden – wenige Elemente, klare Hierarchie (Karte wählen, Runde starten), im Zweifel weglassen. Console Style
ist die Denkrichtung für Gestaltungselemente, nicht für mehr Text oder `//`-Labels. Keine „Border-Schlacht“: Zonen wie
bei einem Armaturenbrett erkennbar, aber nicht alles mit Linien getrennt.
Andreas (2026-10-28), nach Team-Runde zu den Controls unten rechts; Umsetzung freigegeben („macht es mal so“):
- Desktop ab ca. 1200 px: rechte Spalte **immer** sichtbar (kein Ein-/Ausschieben je Runde, Kartengröße bleibt stabil).
  Oben ein **Status, wo wir gerade sind** (z. B. Abstimmung läuft · 3/5 voted, aufgedeckt, warten auf Spieler) plus
  Thema; nach dem Aufdecken Spread und optional Durchschnittszeiger (heute über den Karten-Controls).
- Unten rechts: Timer + Rundenknopf als Teil der unteren Leiste (Primärsteuerung wie im Mockup), so breit wie die Spalte.
  Der Rundenknopf **ändert seine Position nicht**, wenn der Timer an-/ausgeschaltet wird.
- Menü-Side-Panel legt sich über die Spalte. Unter ca. 1200 px (Tablet, Phone) wie heute.
- Themenliste (B-52) und Historie später.

### B-69 Kartenleiste: Blätter-Leisten `<` / `>` statt Scrollleiste
Andreas (2026-10-28): Passen die Karten nicht in die Leiste, scrollt sie waagerecht. Die Scrollleiste ist unschön
(besonders auf Mobile), und man versteht nicht, dass man scrollen soll. Idee: am linken bzw. rechten Rand bei Bedarf
eine schlanke `<`- bzw. `>`-Leiste, die zeigt, dass es weitergeht; Scrollleiste ausblenden, Wischen und Mausrad
bleiben. Entschieden (Andreas, 2026-10-28): Die Leisten sind nur Hinweis, kein Klick-Blättern. **Geändert (Andreas,
2026-10-29): Die Leisten sind doch klickbar** – Klick/Tipp blättert um etwa eine sichtbare Breite minus eine Karte
(Buttons ohne Tab-Stopp). Tasten 1–9/0 holen eine Karte außerhalb des sichtbaren Bereichs ins Bild. Status: auf `release` (#77), Test auf Staging offen.

### B-70 Tipps in der rechten Spalte: was jetzt zu tun ist
Andreas (2026-10-28), aus der Team-Runde zu B-68: Unter dem Status (und unter dem Spread) ein kurzer Tipp für den
aktuellen Spieler, wie im Mockup. Allein am Board → Board-Link kopieren und Team einladen; noch nicht gewählt → Karte
wählen, Ergebnis kommt, sobald alle gewählt haben; gewählt → warten auf (Namen); aufgedeckt → niedrigste und höchste
Karte (Namen) erklären ihre Wahl; alle gleich → neue Runde. Texte englisch, Ausgabe nur per `textContent`. Erst
Desktop, Phones später. „Da kommt später noch mehr hin.“ Form wie im Mockup: „Let them explain: **Chris (2)** and
**Emil (20)**“. Status: auf `release` (#76), Test auf Staging offen.

### B-71 Löschen von Spielern auf Touch-Geräten
Andreas (2026-10-28): Auf dem Handy trägt jede Spielerkarte dauerhaft einen Mülleimer – unruhig, wirkt für Neue riskant.
Lieber mit den vorhandenen Karten arbeiten statt eines eigenen Menüs (vgl. B-56). Langes Drücken ist kaum zu erraten,
Antippen zum Ein-/Ausblenden der Kontext-Icons muss man auch erst herausfinden. Offen: Lösung (Vorschlag Kai: Mülleimer
nur auf Karten von Spielern, die nicht mehr verbunden sind – das ist der eigentliche Anwendungsfall). Andreas:
„geht stark in die richtige Richtung“; zusätzlich anzeigen, dass jemand „off“ ist (Blitz oder farbiger Punkt). Ben prüft,
wie zuverlässig „nicht verbunden“ erkennbar ist (`last_callback_time`).
Andreas (2026-10-28): im Kern eine Frage, wie Browser/OS mit Tabs im Hintergrund umgehen. Kai: Desktop drosselt Timer,
WebSocket bleibt offen (Ping/Pong ohne JS); Handy friert die Seite ein, Verbindung reißt ab. „Off“ = keine Verbindung,
nicht „Tab unsichtbar“. `last_callback_time` taugt nicht (nur bei Pulls aktualisiert). Vorschlag: Anwesenheit aus
`poker-msg` (Client meldet User-ID beim Verbinden, `poker-msg` verteilt die Liste der Verbundenen je Team, Karenz
1–2 min). Betrifft das Repo `poker-msg`. Weitere Varianten (Andreas): (A) `poker-msg` schreibt Status in MySQL;
(B) `poker-msg` schickt je Board alle ~30 s ein `pull`, wer `dao.php` lädt, setzt `last_callback_time` (Kai empfiehlt B,
Last ca. +4 `dao.php`/s zur Spitze, ggf. schlanker Ping); (B′) Client fragt selbst alle 30 s (Timer-Drosselung im
Hintergrund). **Vertagt** (Andreas, 2026-10-28): „noch sind wir da nicht dran“.

### B-72 Aufräumen: Layout- und Spread-Logik in `script.js`
Fred (2026-10-28): Nach den B-68-Runden hängt das Layout an mehreren Messwegen (`resize`, `ResizeObserver`, globaler
Bild-`load`-Listener, `no-anim`-Umschalter); der Spread liest seine Spalten aus dem DOM der Kartenleiste statt aus den
Daten. Vorschlag: eine `relayout()`-Funktion mit einem Observer, Spread direkt aus JSON und `cards.json`. Ca. 1–2 h,
ohne Verhaltensänderung.

### B-73 Wackelnder Timer-E2E-Test
Tessa/Delia (2026-10-28): `timer.spec.ts` schlug lokal vereinzelt fehl („Clicking the checkbox did not change its
state“), vermutlich Race zwischen Klick und Neu-Rendern nach `pull`. Robust machen, bevor es in der CI rot wird.

### B-74 Overlay-Menü schließt bei Klick daneben
Andreas (2026-10-29): Ist ein Overlay-Menü offen (Side-Panel), soll ein Klick irgendwo außerhalb es schließen. Status:
auf `release` (#78).

### B-75 Kartenleiste auf dem Handy als Karussell
Andreas (2026-10-29): Auf dem Handy statt Scrollleiste bzw. `<`/`>`-Leisten (B-69) ein Karussell – „ein Highlight für
mobile“. Desktop bleibt wie B-69. Prototyp: https://claude.ai/artifact/81tkhDGzDCUYKnGymAaNgT (Delia). Entscheidungen:
Karte in der Mitte größer (alle Karten vertikal zentriert), Positionsanzeige als Punkte ○○⦿○ (Tipp springt), Antippen
wählt sofort, Einrasten eine Karte pro Wisch (`scroll-snap-stop: always`), Haptik an (nur Android), kein Ton. Wischen
und Wählen strikt getrennt (Wischen wählt nie, ein Tipp, der nur den Schwung stoppt, wählt nicht; „gewählt“ sieht anders
aus als „in der Mitte“). Das Element sitzt immer unten am Bildschirm und rutscht nie unter den unteren Rand – die
Unterkante am iPhone ist für System-Wischgesten empfindlich (Safe Area, Abstand zum Home-Indikator). Status: auf
`release` (#81), Test auf dem iPhone (Staging) offen.
Andreas (2026-10-29): Karussell nur auf Touch-Geräten (unter 800 px **und** `(hover: none) and (pointer: coarse)`);
schmale Fenster mit Maus/Trackpad bekommen die normale Kartenleiste mit den `<`/`>`-Leisten aus B-69 (Mausrad, Tasten
1–9/0). Zentrieren nach dem Antippen einer Randkarte mit eigenem rAF-Tween statt nativem Smooth-Scroll (ruckelte auf
dem iPhone). Status: Branch `feature/B-75-touch-only`.
Idee für später (Andreas/Kai, 2026-10-29, nur notiert): Karussell auch auf Tablets (Touch ab 800 px), wenn die Karten
sonst unter eine bequeme Tippgröße (~44 px) schrumpfen würden; mit Maus nie Karussell.

### B-76 Kartenbilder: Name über die Karte, Symbole vertikal zentriert
Andreas (2026-10-29), „zeitnah“: In den Kartenbildern (`src/c_*.png`, Quellen in `src/xcf/`) ist oben Platz für den
Spielernamen reserviert, der gar nicht immer genutzt wird (Kartenleiste, Karussell B-75, Spread). Dadurch sitzen die
Symbole nicht mittig – „etwas mittelhübsch“. Ziel: Den Namen aus der Karte heraus **über** die Karte bringen, danach
die Symbole in allen Kartenbildern vertikal zentrieren (neu exportieren). Offen: Darstellung des Namens am Tisch
(über der Karte, Länge/Ellipse, Anonym-Modus), alle Kartensets aus `cards.json` betroffen, Cache-Busting der Bilder,
Auswirkung auf Kartengröße am Tisch (B-49). Beteiligt: Delia (Gestaltung, Bilder), Fred (Tisch-Rendering).

### B-77 Karussell auf allen Touch-Geräten (auch iPad, schwebende Leiste)
Andreas (2026-10-29): Auf dem iPad (≥ 800 px, Desktop-Layout) kommt bisher kein Karussell; die Karten der Leiste
schrumpfen bis 26 px – mit dem Finger fummelig. Entscheidung: **Touch → immer Karussell**, unabhängig von der Breite,
also auch in der schwebenden Leiste. Dazu: Abstufung an der Leistenbreite statt pro Karte, Karten auf Touch mind. ca.
44 px, Leiste höher (Mittelkarte, Punkte, Hinweiszeile), Knopf/Timer gehen mit. Überzeugt es nicht, bleibt das iPad
bei der normalen Leiste (Variante 1). Status: auf `release` (#85), Test auf Geräten offen.

### B-78 Hinweis „Gerät drehen“ bei Handys quer
Andreas (2026-10-29), iPhone 12 mini: Hochformat geht gut, quer muss man fast überall scrollen. Ein halbtransparentes
Overlay mit Dreh-Icon bittet darum, das Gerät zu drehen – nur wenn (1) es ein drehbares Touch-Gerät ist (nicht
Desktop), (2) es quer gehalten wird und (3) die Höhe so knapp ist, dass Querformat keinen Sinn ergibt. Tablets nicht.
Status: auf `release` (#86), Test auf Geräten offen.

### B-79 Vor Rollout 2: Stoppuhr ohne „T+“, Tipps je Kartenart und Anonym-Modus
Andreas (2026-10-29), aus der Nutzer-Runde vor Rollout 2 (kein Toast, keine Erklärungen – der Menüpunkt `:timer` spricht
für sich):
- Stoppuhr-Modus zeigt die Zeit ohne `T+` (nur `03:12`); `T−`/`T+` nur im Timer-Modus.
- Tipp nach dem Aufdecken (B-70): Anonym-Modus **immer** allgemein und sanft („Take the chance and talk about what you
  see.“), keine Ansage, wer erklären soll. Sind unter den tatsächlich gewählten Karten Emoticons oder Ampel-Karten
  (neues Flag in `cards.json`), allgemein „Talk about the cards you chose.“ (Emoticons haben keine Range, Ampel nur 3
  Werte → sonst lange Namenslisten). Kontrollkarten (Kaffee, ?, !) bleiben dabei neutral. Sonst wie bisher niedrigste/
  höchste Karte. Status: auf `release` (#87). Ergänzt: ohne Zahlen-Spanne (nur ∞/✋) ebenfalls „Talk about the cards you chose.“

Ergänzung (Andreas, 2026-10-29, noch in Rollout 2): Wer **?** oder **!** gewählt hat, steht mit Namen in „Let them
explain“ (außer Anonym-Modus), z. B. „Let them explain: Andreas, Paul (3), Petra (8), Hannes, Maria (?), Jogi (!)“; ohne
Zahlen-Spanne nur „Let them explain: Maria (?), Jogi (!)“; bei Ampel/Emoticons „Talk about the cards you chose – Maria
(?), Jogi (!) first.“ Hat jemand **☕** gewählt, kommt „Maybe take a short break.“ dazu (auch anonym); haben alle die
Tasse genommen, steht nur dieser Satz. Status: auf `release` (#88).

### B-80 Wunsch aus Ideas & Bugs: Topic per API setzen → API dokumentieren
Feedback (2026-10-29, FEATURE): „Add API to allow setting the topic.“ Andreas (2026-10-29): Die API gibt es faktisch
schon (`POST /api/update_topic.php?t=<team-id>`, Formularfeld `topic`, max. 2000 Zeichen, Team-ID als Geheimnis);
es fehlt die Dokumentation. Kern also: kurze öffentliche Doku (Seite oder README-Abschnitt), ggf. auch der
Anlege-Link `?tool=…&team=…&text=…`. Offen: Eine Änderung von außen erscheint bei offenen Boards erst beim nächsten
`pull` (der `push` über poker-msg kommt heute nur vom Client) – reicht das, oder braucht es einen serverseitigen
Push? Welche weiteren Endpunkte dokumentieren wir als „stabil“? Bezug zu B-52.
Andreas (2026-10-29): Erst mit B-52 (Topics im Plural) zusammen durchdenken – eine öffentliche API ist sofort
eine Abhängigkeit mehr. Signal an alle Clients siehe B-81.

### B-81 Update-Signal vom Webserver an poker-msg
Idee von Andreas (2026-10-29): Heute schickt nur der Browser nach einer Änderung `push` an poker-msg. Ändert der
Server selbst etwas (z. B. B-80 per API, später Jobs), erfahren offene Boards nichts. Ein Kanal PHP-Webserver →
poker-msg, über den PHP „Update Team-ID …“ meldet; poker-msg verteilt dann wie bisher `pull`. Varianten: MQTT o. ä.
(eigener Broker), Redis Pub/Sub, oder schlicht ein zweiter Listener in poker-msg nur auf localhost (UDP/Unix-Socket
im selben ReactPHP-Loop, ohne neuen Dienst). Entschieden (Andreas, 2026-10-29): keine Zustellgarantie nötig – die gibt es beim `push` aus dem Browser auch nicht.
Damit reicht „fire and forget“; Favorit ist der lokale Listener ohne neuen Dienst.


### B-52 Topics als Backlog-Items
Idee von Andreas (2026-10-23, beim B-51-Mockup): Statt eines einzelnen Topics legt das Team mehrere Topics an (+),
das oberste ist aktiv. Zu ihm werden so viele Schätzrunden gespielt wie nötig, dann geht es zum nächsten. Die
Rundenhistorie wird heute schon geschrieben (`pok_roundstats_tbl`, `pok_roundstat_details_tbl`) und ließe sich je
Topic rückwirkend anzeigen. Berührt Datenmodell/API (Ben). Erst im Mockup (Delia, B-51) zeigen, dann refinen.

### B-53 Ergebnisdarstellung neu
Aus dem B-51-Mockup (Andreas, 2026-10-23): Bewusst **kein Durchschnittswert als Zahl** (fachlich schlecht, nicht alle
Karten numerisch); der Average-Indicator ist die charmante Lösung, liegt aber über der Kartenleiste (Eingabe), wo auch
die Häufigkeitsbalken (`show_card_stats`) stehen. Ziel: Ergebnisse separat und anders darstellen (Verteilung,
Konsens/Ausreißer, Zeiger-Idee erhalten), ggf. mit gespeicherter Historie (passt zu B-52). Vorschlag kommt im
Mockup (Delia).
Idee Andreas (2026-10-24) zur Sidebar: Beim ersten Besuch gibt es noch kein Topic, keine Historie, keine Spreads →
Sidebar zunächst eingeklappt, Board clean wie in Rollout 1; Lösung nötig für „New Round“ und eine aktivierte Stoppuhr.

### B-43 `survey_intro` per `innerHTML` prüfen (Sina)
Beim B-36-Planning gefunden (Delia, 2026-10-23): `script/script_feedback.js:~302` schreibt den Einleitungstext von
Umfragen (`survey_intro`, aus der API) per `innerHTML` in die Seite. Der Inhalt ist Admin-Content aus der DB, keine
Nutzereingabe. Sina soll einordnen, ob das bleiben kann (gewollte Formatierung) oder auf `textContent`/remarkable
ohne HTML umgestellt werden sollte. Nicht dringend.

### B-42 Konfiguration vereinfachen: Sortier-Option „im Spiel wählen“
Andreas möchte die Konfiguration userfreundlicher machen. Erster Kandidat: die Option „Define the sort order in-game“
(`results_order = 'CHOOSE:…'`, zeigt nach dem Aufdecken die Name/Value-Leiste unter den Karten).

**Analyse (Live, letzte 180 Tage, Stand 2026-10-23; Runden aus `pok_roundstats_tbl`, Team-Typ aus
`pok_daily_teams_stats`, Personen aus `pok_roundstat_details_tbl`):**
- ~40.300 Runden: nach Kartenwert (`SEQUENCE`) 85,2 %, nach Name (`NAME`) 14,2 %, im Spiel wählen (`CHOOSE`) **0,6 %**
  (232 Runden).
- `CHOOSE`: 5 Teams (alle recurring), 3 davon an ≥ 3 Tagen; monatlich stabil 1–4 Teams, 0,4–0,7 % der Runden.
  Je Person: 35 Personen, 23 an ≥ 3 Tagen – von 5.102 regelmäßigen Nutzern (≥ 3 Tage) ≈ 0,5 %; jede nur in einem Team.
- **Kein einziges Team hat im Spiel auf „Name“ umgeschaltet**: keine Runde mit `CHOOSE:NAME`, nur `CHOOSE:SEQUENCE`.
  Faktisch sortieren diese Teams immer nach Kartenwert. (Einschränkung: Umschalten innerhalb einer Runde mit
  Zurückstellen vor der nächsten Runde ist in den Daten nicht sichtbar; ein Analytics-Event dafür gibt es nicht.)
- Die Wahl Name vs. Kartenwert wird dagegen genutzt: 78 recurring Teams spielen bewusst nach Name.

**Optionen (noch nicht entschieden):**
1. `CHOOSE` streichen: Auswahl nur noch Name / Kartenwert; die 5 Teams einmalig auf `SEQUENCE` umstellen (für sie
   ändert sich nur, dass die Leiste wegfällt). Klein (Ben: API/Validierung + DB-Update, Fred: Board-Logik).
2. Umschalter Name/Wert für alle direkt aufs Board, Eintrag im Menü entfällt – Gestaltungsfrage für B-40 (Delia),
   mehr Platzbedarf unter den Karten.

**Refined (2026-10-23, Andreas, nach UX-Einschätzung von Delia): Option 1.**
- Begründung (Andreas, Delia): Die Sortierung ist eine Rahmenbedingung, die man einmal festlegt, keine Spielhandlung.
  Auf dem Board stehen nur Dinge, die man jede Runde tut; die Leiste nimmt Platz und Aufmerksamkeit genau dort, wo nach
  dem Aufdecken alle hinschauen, und wird nie bedient. Ob nach Karte oder Name sortiert wird, hängt vom Spielkontext ab
  (Schätzen → Karte; z. B. Emotionskarten als Stimmungsumfrage → Name, Reihenfolge bleibt stabil).
- **Kein automatischer Standard je Kartenset** (wäre „versteckte Magie“, z. B. für Teams, die bewusst „nach Name“
  gewählt haben). Stattdessen steht die Einstellung direkt unter der Kartenset-Auswahl, damit man beides zusammen sieht.
  Später denkbar (eigener Eintrag, nur wenn Daten es tragen): beim Kartenset-Wechsel einmal vorschlagen statt umstellen.

**Zuschnitt:**
- „Define the sort order in-game“ (`CHOOSE`) entfällt, ebenso die Name/Value-Leiste nach dem Aufdecken.
- Einstellung im Menü, **direkt unter der Kartenset-Auswahl**: Beschriftung „Arrange revealed cards by“, zwei Optionen
  **„Card“** (`SEQUENCE`, Standard) und **„Player name“** (`NAME`). Für B-42 reicht das bestehende `<select>`; ein
  Segment-Schalter fürs ganze Menü kommt mit B-40.
- **Anonym-Modus:** Dort wird nach dem Aufdecken immer nach Karte sortiert (`api/lib.php`, Zeile ~375), „Player name“
  greift also nicht. Die Option „Player name“ im Anonym-Modus ausgrauen bzw. mit kurzem Hinweis versehen (Text Delia),
  damit die Einstellung nicht kaputt wirkt.
- Bestehende Teams: `CHOOSE:*` → `SEQUENCE` (die 5 Teams sehen dieselbe Reihenfolge wie bisher, nur ohne Leiste).
  `NAME`-Teams unverändert. Rundenhistorie (`pok_roundstats_tbl`) bleibt unangetastet.

**Umsetzungsplan:**
- **Ben (BE):** `api/update_results_order.php` nimmt nur noch `NAME` und `SEQUENCE` an (Rest → 400), `CHOOSE`-Logik
  raus. `getDao()` liefert gespeicherte `CHOOSE:*` bis zum Daten-Update robust als `SEQUENCE` aus. SQL für den
  Betreiber (in `db_schema_pok_inc.sql` dokumentieren, Andreas spielt es nach dem Deploy ein):
  `update pok_teams_tbl set results_order = 'SEQUENCE' where results_order like 'CHOOSE%';` (vorher Anzahl zählen).
  Spaltenkommentar von `results_order` auf `[NAME|SEQUENCE]` anpassen.
- **Fred (FE):** Leiste `#order_by_div` samt `updateOrderByButtons`/`toggleOrderBy` und `CHOOSE`-Zweige in
  `script.js` entfernen; Menü-Logik (`updateOrderByConfig`, `changeSortOrder`) auf zwei Werte; Anonym-Hinweis
  (Ausgrauen/Hinweis abhängig von `anonymous_mode`) anbinden. `?v=`-Bumps.
- **Delia (DES):** Beschriftung, Reihenfolge im Menü (unter Kartenset), Hinweistext und Optik des ausgegrauten
  Zustands; CSS der Leiste entfernen.
- **E2E:** Einstellung „Player name“ sortiert nach Name, „Card“ nach Karte; keine Leiste mehr nach dem Aufdecken;
  Anonym-Modus zeigt den Hinweis und sortiert nach Karte; API lehnt `CHOOSE` ab.

**AK:** Menü zeigt unter dem Kartenset „Arrange revealed cards by“ mit „Card“ / „Player name“, Standard „Card“; nach
dem Aufdecken keine Name/Value-Leiste mehr; Umstellen im Menü sortiert die aufgedeckten Karten sofort um (Gleiten wie
bei B-41); im Anonym-Modus ist „Player name“ ausgegraut bzw. erklärt; API nimmt nur `NAME`/`SEQUENCE`; nach dem
Daten-Update keine `CHOOSE`-Werte mehr in `pok_teams_tbl`; E2E grün.

**Nachfix nach Staging-Test (Andreas, 2026-10-23):** Option heißt **„Card value“** statt „Card“ (Karte ist zu
abstrakt, sortiert wird nach dem Kartenwert); Hinweis entsprechend „…arranged by card value.“ Im Anonym-Modus ist das
**ganze Auswahlfeld deaktiviert** und zeigt fest „Card value“, egal was gespeichert ist; der gespeicherte Wert bleibt
und erscheint nach dem Ausschalten des Anonym-Modus automatisch wieder.

**Live (2026-10-23, PR #31):** Daten-Update von Andreas eingespielt: 40 Teams umgestellt (29 `CHOOSE:SEQUENCE`,
11 `CHOOSE:NAME`; die Analyse zählte nur Runden der letzten 180 Tage, die Tabelle enthält alle Teams seit Beginn).
Alle auf `SEQUENCE` (wie geplant). Für die 11 `CHOOSE:NAME`-Teams wäre `NAME` genauer gewesen; Auswirkung gering
(keine Runde in den letzten 180 Tagen), Umstellen im Menü ist ein Klick. Lehre: bei Daten-Updates die betroffenen
Werte vorher sichern bzw. nach altem Wert unterscheiden.

### B-41 Kartenbereich auf CSS-Flex + FLIP umstellen (behebt Resize-Wobble)
**Umgewidmet (2026-10-22, Andreas):** Aus dem Wobble-Finding wird ein eigenständiger, bounded Umbau – **entkoppelt**
von den großen Epics B-40/B-37. Scope **nur Kartenbereich** (`#cbox` + Karten-Rendering): Positionierung von
JS-`getCardPos`/`position:absolute` auf echtes **CSS-Flex** (`flex-wrap` + `justify-content:center` + `gap`)
umstellen; Sortier-Glide per **FLIP** erhalten; beim Resize kein Glide (B-39 bleibt). **Draußen (bleibt B-37/B-40):**
Karten-*Größe* kommt vorerst weiter über die bestehenden `.mobile`/`.desktop`-Klassen (`adaptToDevice`) – nur die
Positionierung wird getauscht, nicht das Sizing; Menüs/Overlays/restliches Responsive später. Delia (CSS) + Fred
(JS/FLIP), ein Branch. Ablauf: kurzes gemeinsames Planning zuerst, dann Umsetzung.

**Planning-Ergebnis (2026-10-22, freigegeben von Andreas nach Mockup-Vergleich):**
- **Präzisierung „Wobbeln" (Andreas):** gemeint ist nur, dass die **Links-rechts-Abstände benachbarter Karten** beim
  Resize nicht konstant bleiben. Im Mockup (heutige Logik nachgebaut) bleiben sie konstant, auf Staging nicht → die
  Ursache steckt in der echten App, nicht in der Anordnung. Sie ist unbekannt, verschwindet aber sehr wahrscheinlich mit
  der JS-Positionierung.
- **Gewählt: Variante B** – Anordnung bleibt wie heute (jede Reihe zentriert), aber reines CSS-Flex statt
  `position:absolute` + `getCardPos`, Sortier-Glide per FLIP (Web Animations API).
- **CSS (Delia, `style/style.css`):** `div#cbox` → `display:flex`, `flex-wrap:wrap`, `justify-content:center`,
  `align-content:flex-start`, `gap:15px 10px`; `transition:height` raus (die Höhe animiert künftig JS, siehe unten).
  `.c`: `position:absolute`/`left`/`margin` raus, **`position:relative`** rein (Delete-
  Button und Name sind absolut positioniert). `.c_move` und `#cbox.no-anim .c` entfallen. Hinweis: `#cbox` hat
  `sizefit` und bekommt `.mobile`/`.desktop`.
- **JS (Fred, `script/script.js`):** `getCardPos` und alle `left/top`-/`cbox.style.height`-Schreibzugriffe entfernen.
  DOM-Reihenfolge = Anzeige-Reihenfolge: nur falsch stehende Karten per `appendChild` verschieben (sonst starten
  Wackel-/Fade-in-Animationen neu). FLIP: First (inkl. laufendem Transform) → laufende `flip`-Animationen abbrechen →
  DOM ändern → Last → `animate()` mit `id:'flip'`, 1 s, `ease`; nur Karten mit First-Position. `cardValueChanged`
  über das FLIP-Delta auslösen (Verzögerung 1 s bei Bewegung) und per `animationend` wieder entfernen. Anonym-Modus:
  kein FLIP. `handleResize`: nur `adaptToDevice` + `showCardUsage`, laufende `flip`-Animationen beenden.
  `prefers-reduced-motion`: kein FLIP. **Höhe springt nicht (Andreas):** Ändert sich durch neue Daten die Zahl der
  Reihen, gleitet die `#cbox`-Höhe in 1 s mit (Höhe vor/nach der DOM-Änderung messen, `animate()` mit `id:'height'`,
  wie Mockup mit „Höhe gleitet"). Beim Resize keine Höhenanimation.
- **Schmale Bildschirme (< 800 px):** heute beginnt die letzte Reihe links im Raster, mit B wird sie zentriert
  (bewusst, wie Desktop; auf Staging prüfen).
- **E2E (Fred):** zuerst neuer Test „Abstand benachbarter Karten bleibt beim Resize konstant" (Breiten-Sweep, ±1 px) –
  muss auf dem **heutigen** Stand fehlschlagen (belegt, dass er Andreas' Wobbeln erfasst), nach dem Umbau grün.
  `resize-no-anim.spec.ts` auf FLIP umstellen (kein laufendes `flip` nach Resize). Neu: Umsortieren löst `flip` aus;
  Anonym-Modus löst keins aus. `card-reuse.spec.ts` bleibt (Kommentar anpassen).
- **Ablauf:** Delia legt `feature/B-41-flex-layout` von `release` an und committet das CSS → Fred: Test zuerst, dann JS,
  E2E, `?v=`-Bumps (`style.css`, `script.js` in `board.html`/`init.html`) → Review durch Kai → Andreas auf Staging.
- **AK:** Abstände benachbarter Karten beim Resize konstant (E2E); Umsortieren gleitet, auch über Reihen hinweg;
  Höhe gleitet bei Reihenwechsel durch neue Daten (springt nicht); kein Gleiten beim Resize; Anonym-Modus ohne Gleiten; kein `getCardPos`/`position:absolute` mehr im Kartenbereich; alle
  E2E grün.

**Ursprüngliches Wobble-Finding (bleibt als Begründung):**
Nach B-39 (Karten springen beim Resize sofort statt zu gleiten) fiel auf: Beim langsamen Ziehen der Fensterbreite
„wobbeln" die Karten – die Abstände werden kleiner, größer, wieder kleiner. **Kein Regressionsbug** von B-39: Die
1-Sekunden-Transition hat diesen Effekt vorher nur weichgezeichnet; B-39 hat ihn sichtbar gemacht. Tritt nur beim
aktiven Fenster-Ziehen auf, nicht im normalen Spiel/auf fester Größe.

**Ursachenspuren (für die Untersuchung):**
- `getCardPos()` (script.js:243) rechnet mit fixer Slotbreite **110 px**; Karten pro Zeile = `floor(gScreenWidth/110)`.
  Das ist eine Stufenfunktion → an jedem Vielfachen von 110 bricht eine Karte in die nächste Zeile um, die Restzeile
  wird neu zentriert (`margin`) → Sprung. Dazwischen wandert der Zentrier-Rand stetig. Ergebnis: Sägezahn.
- Zweites Schwellensystem: `adaptToDevice()`/`getBrowserWidth()` schalten `.mobile`/`.desktop` bei 800/991/1199 um.
  `.c.mobile` ist real **100 px** breit, der JS-Slot aber **110 px** – Slot ≠ tatsächliche Kartenbreite.
- Andreas' Hypothese: hängt evtl. auch an **wann/wie oft** das `resize`-Event feuert (kein Throttle/Debounce;
  `handleResize` rendert pro Event alle Karten neu). Prüfen.

**Harte Vorgabe (Andreas):** Die Animation, dass Karten an ihre neue Position **gleiten, wenn sich die Sortierung
ändert** (z. B. nach Aufdecken/neuer Runde), **muss erhalten bleiben**. Geändert werden darf nur das Resize-Verhalten;
die „kein Gleiten beim Resize"-Eigenschaft aus B-39 bleibt.

**Richtung:** Delia untersucht (Throttle/Debounce des Resize, gleichmäßige Zentrierung ohne Sägezahn, ggf. echtes
CSS-Layout mit `gap`+`justify-content` statt JS-Pixelmath) und schlägt einen kleinen Fix vor. Die saubere
Gesamtlösung gehört zu „Kartenlayout verbessern"/Responsive (B-40/B-37).

**Analyse-Ergebnis (Delia, 2026-10-22): kein kleiner sauberer Fix – Lösung in B-40/B-37.** Verifiziert per
Code-Analyse + numerischer Simulation von `getCardPos` über einen Breiten-Sweep:
- Das Wobbeln entsteht am **Umbruchpunkt** (alle 110 px Breite): eine Karte bricht in die nächste Zeile, jede Zeile
  wird unabhängig neu zentriert → Sprung ≈ halbe Slotbreite (~55 px). Innerhalb einer Zeile ist der Abstand konstant,
  dort gibt es kein Wobbeln; sobald alle Karten in **eine** Zeile passen, driftet der Block nur noch sauber mittig.
- **Event-Frequenz ist NICHT die Ursache** (Hypothese widerlegt): Throttle/Debounce ändert nichts am Sägezahn, der in
  der Stufenfunktion steckt. Ein reiner Trailing-Debounce (erst nach Drag-Ende neu positionieren) entfernt zwar das
  sichtbare Wobbeln, bringt aber Lag **und** horizontales Scrollbar-Flackern beim Schmaler-Ziehen (kein
  `overflow-x`-Clipping) – nicht besser.
- Der 110-px-Slot vs. echte 100-px-Karte ergibt nur einen konstanten 2-px-Spalt, **kein** Wobbeln – Angleichen löst
  nichts.
- **Das Umbrechen-und-Neuzentrieren ist jedem Wrap-Layout eigen** (auch CSS `flex-wrap` springt an seinen Grenzen).
  Wegrechnen geht nur, indem man das Layout vom JS-Pixelmath auf **echtes CSS** umstellt.

**Wurzel-Lösung (Vorschlag für B-40/B-37), mit Fred gemeinsam zu schneiden:**
1. Karten von `position:absolute` + JS-`left/top` (`getCardPos`) auf normalen Flow im bestehenden Flex-Container
   `#cbox` (`display:inline-flex; flex-wrap:wrap; justify-content:center`) umstellen, `gap` statt JS-Margin,
   `getCardPos` und die manuelle `#cbox`-Höhe entfallen. Umbruch/Zentrierung macht der Browser kontinuierlich und
   korrekt; der 110-vs-100-Mismatch verschwindet.
2. **Sortier-Glide erhalten (harte Vorgabe):** Die 1-s-`left/top`-Transition (`.c_move`) funktioniert ohne
   Absolut-Positionierung nicht mehr → Ersatz per **FLIP** (First-Last-Invert-Play: vor Reorder Positionen messen,
   nach Reflow per `transform` an alte Stelle setzen, auf `transform:none` animieren). Das ist der eigentliche
   Zusatzaufwand und der Grund, warum es nicht in ein kleines B-41 passt.
3. **Kein Glide beim Resize (B-39) bleibt:** beim Resize einfach keine FLIP-Animation auslösen (analog zum heutigen
   `.no-anim`). Aufwand/Risiko mittel (FLIP + E2E, Animation flaky-anfällig), aber die einzige Lösung, die das Wobbeln
   glättet UND den Glide erhält. Berührt JS-Verhalten → Fred mit einbinden; CSS/Tokens/Responsive macht Delia.

Optionaler Mini-Hygiene-Gewinn (kein B-41-Fix, entfernt das Wobbeln NICHT): `requestAnimationFrame`-Coalescing des
Resize-Handlers (max. ein Reposition pro Frame) – bei der B-40-Umstellung mitnehmen.

**Entscheidung Anonym-Modus (Andreas, 2026-10-23):** Im Anonym-Modus gleiten die Karten grundsätzlich nicht (so war es
schon vor B-41: `c_move` wurde entfernt; heute `flip = !anonymousMode` in `updatePlayersCards`). Grund: Beim Aufdecken
werden die Namen durch `******` ersetzt und nach Wert sortiert; eine Gleitbewegung würde verraten, wer welchen Wert
gewählt hat – ebenso beim Ändern einer Karte nach dem Aufdecken. Eine Verfeinerung (nur bei Aufdecken/neuer Runde
abschalten) wurde bewusst verworfen: so ist es einfacher und sicherer.

### B-40 Look & Feel / UX-UI-Überarbeitung (Epic)
Größeres Thema **nach** dem CSS-Refactoring (B-36 als technische Voraussetzung: erst aufräumen, dann umgestalten).
Ziel: Oberfläche modernisieren und mobil deutlich verbessern – **ohne den bestehenden Charme der App zu verlieren**.
Dafür eine eigene Design-Rolle (siehe `.claude/agents/`), die gestalten **und** technisch umsetzen kann.

Ideen-Sammlung von Andreas (2026-10-22, unsortiert, wird im Refinement geschärft und in einzelne Einträge
geschnitten):
- **Menüs als modales Voll-Overlay** (halbtransparent zum Hintergrund, wie „Become Observer/Player"), dadurch auch
  mobil sinnvoller mit responsiven Elementen aufbaubar. → jetzt **B-51**.
- **Menüs userfreundlicher strukturieren und aufräumen.** → jetzt **B-51**.
- **Kartenlayout verbessern** – z. B. die Spielernamen besser unter den Karten platzieren.
  Andreas (2026-10-27): Namen später **über** die Karten setzen; heute passen bei ~100-px-Karten in Mono-Schrift nur
  ~8–9 Zeichen (Rest „…“, voller Name als Tooltip).
- **Karten mit Beschriftungen** ermöglichen (z. B. um echtes Delegation Poker zu spielen).
- **Content und Theming der Karten trennen** – z. B. Fibonacci-Zahlen mal mit Sommer-, mal mit Winterfarben.
- **Kartenziffern modernisieren.**
- **„Karte nach dem Aufdecken geändert"**: als zusätzliche Karte dargestellt, die auf die erste gelegt wird, wobei
  der ursprüngliche Wert noch erkennbar bleibt. **Im Anonym-Modus deaktivieren** (Andreas, 2026-10-23): sonst ließe
  sich über die geänderte Karte zuordnen, wer welchen Wert gewählt hat.
- **Kartenauswahl für Mobile deutlich verbessern.**
- **Mobile-Darstellung allgemein deutlich verbessern.**
- **Platz-Konkurrenz auflösen:** Timer, Notiz-/Topic-Zettel, „Neue Runde"-Knopf u. a. konkurrieren mit den Karten um
  den Platz – das nervt. Layout so umbauen, dass diese Elemente den Kartenbereich nicht verdrängen (z. B. eigene
  Zonen/Leiste, Overlay, oder Karten-Bereich bekommt verlässlich seinen Raum).

- **Spieler entfernen ohne Lösch-Icon auf jeder Karte** (Andreas: heute schlechte UX; Ideen von Delia, 2026-10-23):
  1. Spieler-Liste im Menü („Players“) mit Name, Status (aktiv / inaktiv seit …), Rolle und „Remove“ mit Rückfrage –
     Delias Empfehlung als Basis (Karten bleiben ruhig, gut mit Touch/Tastatur; Ben müsste „inaktiv seit“ liefern).
  2. Karte antippen/anklicken öffnet ein kleines Kontextmenü („Remove from table“, später z. B. „Make observer“) –
     optional als Ergänzung (muss entdeckbar sein).
  3. Inaktive Spieler blasser darstellen und nur dort „Remove?“ anbieten – als visuelle Hilfe zu 1 (braucht ein
     verlässliches Aktivitätssignal, Ben/Fred).
  Bis dahin bleibt das Icon (B-36: auf Touch-Geräten immer sichtbar, sonst bei Hover).

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
