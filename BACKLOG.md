# Backlog

Gemeinsames Backlog für Wartung und Weiterentwicklung. Ablauf siehe `CLAUDE.md`, Abschnitt „Zusammenarbeit“.

Status: `neu` → `refined` (gemeinsam verstanden, bereit für einen Sprint) → `im Sprint` → `erledigt`.
Reihenfolge = grobe Priorität, wird im Refinement angepasst.

## Aktueller Sprint

Sprint 1: B-04

## Backlog

| ID | Thema | Status |
|---|---|---|
| B-01 | SQL-Injection in `api/` beheben | neu |
| B-02 | `stats.php` absichern (XSS, Zugriffsschutz) | neu |
| B-03 | PHP-8.1-Deprecations und kleine Bugs | neu |
| B-04 | Lokale Testumgebung und erste E2E-Tests mit CI | im Sprint |
| B-05 | E2E-Tests für weitere Funktionen | neu |
| B-06 | Testfälle gemeinsam reverse-engineeren | neu |
| B-07 | Repo-Hygiene (`.gitignore`, `config.php`, README) | neu |
| B-08 | MySQL-Statistik-Job ins Repo aufnehmen | neu |
| B-09 | Wachstum von `pok_analytics_events_tbl` begrenzen | neu |
| B-10 | `poker-msg` modernisieren und absichern | neu |
| B-11 | Schreibende API-Aufrufe per POST statt GET | neu |
| B-12 | Zeichensätze auf `utf8mb4` vereinheitlichen | neu |
| B-13 | MySQL-Zugriff von außen einschränken | neu |
| B-14 | `script/script.js` in Module aufteilen | neu |
| B-15 | CDN-Abhängigkeiten festnageln oder selbst ausliefern | neu |
| B-16 | Fremddateien und phpMyAdmin in den Webroots absichern | neu |

### B-01 SQL-Injection in `api/` beheben
Einige Queries setzen Eingaben direkt in SQL ein: `validate_team()` in `api/lib.php` (läuft bei fast jedem Request),
`api/delete.php`, `api/feedback.php`, `api/setc.php`, `getDao()` und weitere Stellen in `api/lib.php`. Umstellen auf Prepared Statements.
Offene Fragen: alle Stellen einzeln oder `lib.php` gleich mit einer kleinen Query-Hilfsfunktion?

### B-02 `stats.php` absichern
Feedback-Texte werden ungefiltert ausgegeben (XSS), die Seite ist ohne Login erreichbar.
Offene Fragen: Zugriffsschutz per nginx (Basic Auth/IP) oder in PHP? Wird `stats.php` neben Grafana überhaupt noch gebraucht?

### B-03 PHP-8.1-Deprecations und kleine Bugs
`FILTER_SANITIZE_STRING` an 13 Stellen ersetzen; `strlen($tool>0)` in `index.php`.
Offene Fragen: Welche PHP-Version läuft auf beiden Servern, ist ein Update auf 8.3 geplant?

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
README auf aktuellen Stand bringen.
Offene Fragen: Wie ist `config.php` auf den Servern heute vor `git pull` geschützt?

### B-08 MySQL-Statistik-Job ins Repo aufnehmen
Die `_stats`-Tabellen werden von einem MySQL-Event befüllt, das nicht im Repo liegt.
Definition exportieren (`SHOW CREATE EVENT`) und versionieren.

### B-09 Wachstum von `pok_analytics_events_tbl` begrenzen
Tabelle wächst unbegrenzt. Aufbewahrungsdauer festlegen, alte Daten löschen oder verdichten.
Offene Fragen: Wie lange werden Rohdaten gebraucht? Wie groß ist die Tabelle heute?

### B-10 `poker-msg` modernisieren und absichern
Ratchet 0.4 wird kaum gepflegt; der Prozess läuft unter supervisor als `root`; keine Begrenzung von Verbindungen
oder Nachrichtengröße. Läuft nicht als root, Abhängigkeiten aktualisieren oder Alternative prüfen.

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

### B-16 Fremddateien und phpMyAdmin in den Webroots absichern
Auf dem Staging-Server lagen neben dem Repo `info.php` (phpinfo), `config.php.live` und ein Symlink
`db -> /usr/share/phpmyadmin` im Webroot; phpMyAdmin ist damit öffentlich erreichbar und wird genutzt.
`info.php` und `config.php.live` sind entfernt (2026-10-16). Offen:
- phpMyAdmin per nginx Basic Auth (`location ^~ /db/` mit `auth_basic`) oder nur per SSH-Tunnel erreichbar machen.
- Live-Server auf dieselben Fremddateien prüfen (`git status`, Symlinks im Webroot).
