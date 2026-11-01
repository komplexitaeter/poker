# B-81 – Prüfliste: Benachrichtigung aus der API statt `push` aus dem Browser

Stand: `release` @ `bbc587d` (poker), poker-msg `release` @ `36c6f8e`. Nur gelesen, nichts geändert.

## 1. Alle `pushDomChange()`-Aufrufe (14)

`pushDomChange()` (script.js:1080) ist ein No-op ohne Board (`gConn === null`, z. B. init.html) → `sendPush()` → `expectPull()` (B-86).

| # | Datei:Zeile | Aktion (Auslöser) | API davor | push abhängig vom Erfolg? | Hinweise |
|---|---|---|---|---|---|
| 1 | script.js:67 | Neue Runde (`newRound`) | `newround.php?t` POST fetch | `.then` – auch bei HTTP-Fehler, nicht bei Netzfehler | |
| 2 | script.js:148 | Spieler entfernen (`deletePlayer`) | `delete.php?mkey&t` POST fetch | wie 1 | |
| 3 | script.js:175 | Karte legen/zurücknehmen (`setC`) | `setc.php?id&cardkey&t` POST fetch | wie 1 | kein Aufruf und kein push, wenn `url === null` (Karte abwählen nach Aufdecken) |
| 4 | script.js:1298 | Beitreten als Spieler/Beobachter (`becomeUser`) | `name.php?id&type&name&t` POST fetch | wie 1 | |
| 5 | script.js:1564 | Timer: Start/Pause/Reset/Sichtbarkeit/Modus/Timebox/Auto-Restart (`timerAction`) | `timer.php?t&action[&value]` POST fetch | **ja**, nur bei `response.ok`; bei Fehler `updateDao` | einziger Aufruf mit Erfolgsprüfung |
| 6 | script.js:2221 | Konto löschen (`deleteUser`) | `delete_user.php?id` POST fetch | wie 1 | **Sonderfall:** `localStorage.clear()`, dann push, dann sofort `document.location='about:blank'` → Senden vor dem Seitenwechsel nicht garantiert; push geht nur an das aktuelle Team, obwohl die API den User aus **allen** Teams löscht |
| 7 | script_feedback.js:321 | „Dark side“/Durchschnitt (`pushJediBtn`) | `update_show_avg.php?id&show_avg&t` POST fetch | wie 1 | `id` wird von der API ignoriert |
| 8 | script_feedback.js:609 | Thema speichern (`save_topic`) | `update_topic.php?t` POST **XHR async**, Body `topic=` | `onload` (auch bei HTTP-Fehler) | danach zusätzlich `measureEvent("TOPIC_SAVED")` |
| 9 | script_feedback.js:642 | Kartenset ändern (`updateCardset`, aus `toggleCSet` und `preSet`) | `update_cardset.php?cardset_flags&t` POST fetch | wie 1 | |
| 10 | script_feedback.js:684 | Sortierung (`changeSortOrder`) | `update_results_order.php?t&results_order` POST **XHR synchron** | nein – push immer nach `send()`, auch bei 400/Netzfehler | synchrones XHR blockiert die UI |
| 11 | script_feedback.js:693 | Anonymität (`changeAnonymity`) | `update_team.php?t&anonymous_request_toggle` POST **XHR synchron** | nein, wie 10 | |
| 12 | script_feedback.js:714 | Teamname ändern (`updateTeamName`) | `update_team.php?name&t` POST fetch | wie 1 | |
| 13 | script_feedback.js:723 | Eigenen Namen ändern (`updateUserName`) | `name.php?name&t&id&type` POST fetch | wie 1 | Name gilt nur in diesem Team (`pok_players_tbl` je `id`+`team_id`) |
| 14 | script_feedback.js:731 | Spieler ↔ Beobachter (`toggleUserType`) | `name.php?name&t&id&type` POST fetch | wie 1 | |

Ergebnis: Jeder push folgt genau **einem** API-Aufruf; kein push ohne vorherigen Schreibaufruf, kein push nach mehreren Aufrufen. Auf init.html gibt es keinen push (dort nur `addteam`, `feedback`, `update_user`, `measure_event`).

Weitere `push`-Quelle: `sendPush()` aus `initializeWSConnection` → `onopen`, wenn `gPushPending` (B-82-Wiederholung) – kein eigener Schreibvorgang.

## 2. Alle Endpunkte

| Endpunkt | Art | Team-ID woher | push heute | Benachrichtigung künftig | Bemerkung |
|---|---|---|---|---|---|
| `dao.php` | lesend (+ schreibt `last_callback_time`, legt `pok_user_tbl`-Zeile an, setzt `survey_id`) | `t` | – | **nein, nie** | Notify hier → Endlosschleife (pull → dao → notify → pull) |
| `setc.php` | schreibend | `t` (require_team) | ja (#3) | ja | |
| `newround.php` | schreibend (Runde, Stats, Timer-Auto-Restart, Anonymität, alte Spieler löschen) | `t` | ja (#1) | ja | |
| `delete.php` | schreibend (Spieler → REMOVED) | `t` | ja (#2) | ja, nur wenn `mkey` gesetzt | ohne `mkey` kein `require_team`, kein Schreiben |
| `name.php` | schreibend (Insert/Update Spieler) | `t` | ja (#4, #13, #14) | ja | |
| `timer.php` | schreibend | `t` | ja (#5) | ja, nicht bei 400 (`bad_request`) | unbekannte `action` → 200 ohne Schreiben (Notify harmlos) |
| `update_show_avg.php` | schreibend | `t` | ja (#7) | ja | |
| `update_topic.php` | schreibend | `t` (GET), Topic per POST-Body | ja (#8) | ja | |
| `update_cardset.php` | schreibend | `t` | ja (#9) | ja | |
| `update_results_order.php` | schreibend | `t` | ja (#10) | ja, nicht bei 400 | |
| `update_team.php` | schreibend (Name und/oder Anonymität) | `t` | ja (#11, #12) | ja | |
| `delete_user.php` | schreibend (löscht User aus **allen** Teams, Feedback, Stats, Votes) | **nur `id`** | ja (#6, nur aktuelles Team, unsicher) | **ja, alle Teams des Users** | Team-IDs **vor** dem `DELETE` per `select distinct team_id from pok_players_tbl where id=?` holen |
| `addteam.php` | schreibend (neues Team) | erzeugt | – | nein | noch kein Board offen |
| `index.php` (`?tool=…`, `add_team`) | schreibend (neues Team, Redirect) | erzeugt | – | nein | Integrationseinstieg; kein Board offen |
| `update_user.php` | schreibend (`color_mode`, `survey_skipped`, `survey_vote`, `hide_teaser`) | nur `id` | – | nein | nur eigene Ansicht; Survey-Skip lädt selbst (`updateDao` nach 100 ms) |
| `feedback.php` | schreibend (Feedback) | – (bewusst ohne Team) | – | nein | team-unabhängig |
| `vote_roadmap.php` | schreibend (Reaktion „Ideas & Bugs“) | nur `id` | – | nein | team-unabhängig, Antwort liefert Eintrag zurück; Liste wird beim Öffnen geladen |
| `measure_event.php` | schreibend (Analytics) | nur `id` | – | nein | kein Board-Effekt |
| `get_promo.php` | schreibend (Promo-Insert), POST | `team_id` | – | nein | Promo seit Rollout 1 abgeschaltet |
| `update_promo.php` | schreibend (Promo-Tracking) | Promo-`id` | – | nein | |
| `get_user.php`, `get_survey.php`, `get_roadmap.php` | lesend | – | – | nein | |
| `stats.php` `feedback_done`, `roadmap_save` | schreibend (Admin) | – | – | nein | team-unabhängig, kein Live-Effekt auf Boards |

**Lücken heute**

- Schreibend mit Board-Effekt ohne push: **keine**. Alle board-relevanten Endpunkte haben einen push; die ohne push (Feedback, Roadmap, Survey, Farbe, Teaser, Analytics, Promo, neues Team) ändern nichts, was andere Boards sehen – Absicht, kein Bug.
- `delete_user.php`: push nur ans aktuelle Team und knapp vor `about:blank`; andere Teams des Users zeigen ihn weiter bis zum nächsten pull dort → **heutiger Bug**, B-81 behebt ihn.
- push ohne erfolgreichen Schreibvorgang: #10/#11 immer (synchrones XHR ohne Statusprüfung), #1–4, 6–9, 12–14 auch bei HTTP 4xx/5xx. Harmlos (nur unnötiger pull), entfällt mit B-81.
- Nicht benachrichtigt, obwohl serverseitig etwas passiert: nur `dao.php` (gewollt). Spätere Server-Jobs/B-80 brauchen B-81.

## 3. Besonderheiten

| Thema | Befund |
|---|---|
| Mehrere Teams | Nur `delete_user.php`. Namensänderung (`name.php`) gilt nur im aktuellen Team, kein Mehrfach-Team-Fall. `update_user.php` (Farbe, Survey) ist user-weit, aber ohne Board-Effekt für andere. |
| Timer | Läuft clientseitig (`updateTimerInterval`, Basis `timer_time` aus `dao.php`); Server speichert nur Start/Pause/Modus. Push nur bei Aktionen; Auto-Restart kommt über `newround.php`. Timebox-Ablauf (TIMER → T+) braucht keinen push. Kein Änderungsbedarf außer Notify in `timer.php`. |
| `measure_event` | Kein Board-Effekt, kein Notify. Wird oft aufgerufen (Board-Load, Topic) – Notify dort wäre teuer und falsch. |
| Feedback / Ideas & Bugs | Team-unabhängig (Feedback bewusst ohne Team-ID, Roadmap-Votes je User). Kein Notify. Live-Aktualisierung der Liste wäre ein eigenes Thema. |
| Survey | `update_user.php` (`survey_skipped`, `survey_vote`) betrifft nur den eigenen User; Client lädt selbst nach. Kein Notify. |
| `dao.php` | Schreibt nebenbei; **darf nie notifizieren** (Schleife). In der Doku zu `notify_team()` festhalten. |
| Fehlerpfade | Notify nur nach erfolgreichem Schreiben: nach `require_team` (403) und Validierung (400). Einfachste Regel: Aufruf als letzte Zeile vor `$link->close()`; frühe `exit`s erreichen ihn nicht. |
| poker-msg-Protokoll | `onMessage` prüft per `str_contains` auf `subscribe:` bzw. `push`; push verteilt an das Team der sendenden Verbindung, inkl. Absender. Ohne Subscription kein Effekt. |

## 4. Technik-Skizze

**PHP (zentral in `api/lib.php`):**

```php
/* B-81: tell poker-msg that the team changed (fire and forget, never blocks, never fails the request) */
function notify_team(string $team_id): void {
    $sock = @stream_socket_client('udp://127.0.0.1:' . (defined('_POKER_MSG_NOTIFY_PORT') ? _POKER_MSG_NOTIFY_PORT : 8444), $errno, $errstr, 0.05);
    if ($sock === false) return;
    @fwrite($sock, 'pull:' . $team_id);
    fclose($sock);
}
function notify_teams(array $team_ids): void { foreach (array_unique($team_ids) as $t) notify_team($t); }
```

- Aufruf am Ende der 11 board-relevanten Endpunkte (`setc`, `newround`, `delete` (nur mit mkey), `name`, `timer`, `update_show_avg`, `update_topic`, `update_cardset`, `update_results_order`, `update_team`, `delete_user` mit Team-Liste vor dem Löschen). Später B-80/Jobs genauso.
- **Kanal UDP auf 127.0.0.1** (Favorit): PHP-seitig kein Blockieren, kein Fehler, wenn niemand lauscht (Datagramm geht verloren); keine Dateirechte (poker-msg läuft als root, FPM als `www-data` – beim Unix-Socket müsste man Rechte am Socket-File pflegen). Im Loop ohne neue Composer-Abhängigkeit: `stream_socket_server('udp://127.0.0.1:8444', …, STREAM_SERVER_BIND)` + `$loop->addReadStream()` + `stream_socket_recvfrom()`. Alternative Unix-Socket: `React\Socket\UnixServer` ist vorhanden (react/socket), aber Rechte/Pfad nötig.
- Port nur auf 127.0.0.1 binden (Firewall/Cloud prüfen trotzdem). Missbrauch lokal = nur zusätzliche pulls → unkritisch.

**poker-msg (grob):**

- `bin/msg-server.php`: UDP-Listener am `$server->loop` registrieren, Port per Env (`POKER_MSG_NOTIFY_PORT`, Default 8444).
- `MsgServer`: Verteillogik aus dem `push`-Zweig in `public function pullTeam(string $team)` auslagern; `push` ruft sie weiter auf (Übergang/alte Clients), UDP-Handler auch. Nachricht `pull:<team>` parsen, Länge begrenzen (80), leere ignorieren.
- Optional: Index `team → Verbindungen` statt Schleife über alle (bei 5.000 Verbindungen und mehr Notifies sinnvoll, aber nicht nötig).
- README/supervisor: neuer Port dokumentieren; `tests/e2e/setup.sh` startet poker-msg mit Default-Port → passt.

**Reihenfolge der Deployments:**

1. poker-msg mit UDP-Listener (abwärtskompatibel, `push` bleibt) → release-Server, dann Live (supervisor restart).
2. App: `notify_team()` in den Endpunkten **und** gleichzeitig Browser-`push` entfernen (kein Doppelweg laut Auftrag). Alte, noch offene Tabs senden weiter `push` → doppelter pull, harmlos; ab dem nächsten Reload neuer Code.
3. Später (optional): `push`-Zweig in poker-msg entfernen, wenn kein alter Client mehr da ist (z. B. nach einigen Tagen).

CI: `setup.sh` klont poker-msg `release` → Schritt 1 muss auf poker-msg/`release` gemergt sein, bevor der App-PR grün werden kann.

**Wenn poker-msg nicht läuft:** UDP-Senden gelingt trotzdem (ggf. ICMP-unreachable, ohne Wirkung auf den Request), API antwortet normal. Boards erhalten keinen pull; der Schreiber merkt es über den B-86-Timeout (Hinweis „Reconnecting …“), wie heute.

**Frontend:**

- Wegfallen: `pushDomChange()`, `sendPush()`, `gPushPending` inkl. Nachhol-Logik in `onopen`/`initializeWSConnection`/`expectPull`-Timeout; alle 14 Aufrufe → stattdessen `expectPull()` (oder kleiner Helfer `afterWrite(response)`).
- **Wichtig – Reihenfolge:** Das `pull` kann jetzt **vor** dem Ende des fetch eintreffen (API notifiziert vor dem Senden der Antwort). `expectPull()` nach dem fetch würde dann ein bereits erhaltenes pull verpassen und fälschlich nach 1 s „Reconnecting“ zeigen. Lösung: `expectPull()` **vor** dem API-Aufruf starten (Timer läuft ab Request-Start, `PULL_TIMEOUT_MS` ggf. erhöhen, z. B. 2–3 s, da jetzt DB-Zeit mitzählt) oder pull-Zeitstempel merken und beim Abschluss vergleichen.
- Bei HTTP-Fehler keinen pull erwarten (sonst falscher Hinweis): Erwartung abbrechen + `updateDao`.
- Halb offene Verbindung: Timeout → Neuaufbau → `onopen` lädt per `updateDao` neu; ein „push nachholen“ ist nicht mehr nötig (Zustand liegt in der DB, andere Boards wurden direkt benachrichtigt). Das macht B-82 einfacher.
- `deleteUser`: kein push mehr nötig, `about:blank` sofort nach dem fetch ist unkritisch.
- Synchrone XHRs (#10, #11) können bei der Gelegenheit auf `fetch` umgestellt werden (optional, eigener Punkt).
- Versionsnummern `script.js`/`script_feedback.js` in `board.html`/`init.html` erhöhen.

## 5. Aufwand grob

| Teil | Aufwand | Inhalt |
|---|---|---|
| PHP-Endpunkte | **S** | `notify_team()` in lib.php, 11 Aufrufe, `delete_user` mit Team-Liste; optional Konstante in `config.example.php` |
| poker-msg | **S–M** | UDP-Listener im Loop, Verteilung auslagern, README/supervisor-Doku; eigener PR + Deploy vorab |
| Frontend | **M** | 14 Aufrufe umstellen, push-/Nachhol-Logik entfernen, Timing von `expectPull` (Race) sauber lösen, Fehlerpfade |
| Tests | **M** | `reconnect.spec.ts` (B-82/B-86) anpassen: „push wird wiederholt“ → „Board lädt nach Reconnect / andere Boards ohne Browser-push aktuell“; neuer Test: Schreiben per direktem API-Aufruf (`request.post`) aktualisiert offene Boards; `delete_user` aktualisiert zwei Teams; Test, dass ohne poker-msg die API 200 liefert |

Gesamt: eher **M**, zwei PRs (poker-msg zuerst, dann poker).
