# Benachrichtigung und Neuladen des Boards (B-81 und Folgen)

Stand nach B-81, B-82, B-86, B-92, B-110, B-127, B-135 und B-94. Die ursprüngliche Prüfliste zu B-81
(alle `push`-Aufrufe, `expectPull`, Deploy-Reihenfolge) ist umgesetzt und steht in der Git-Historie dieser Datei.

## Server

- Jeder schreibende Endpunkt mit Board-Effekt ruft nach `require_team()` und erfolgreichem Schreiben
  `notify_team($t)` auf (`api/lib.php`): UDP `pull:<team_id>` an `127.0.0.1:8444` (Port per `_POKER_MSG_NOTIFY_PORT`),
  fire and forget. Mehrere Teams (z. B. `delete_user.php`): `notify_teams()`.
- `api/dao.php` benachrichtigt **nie** (jeder `pull` lädt `dao.php` → Endlosschleife).
- poker-msg schickt allen Verbindungen des Teams ein `pull` (je Team in 100-ms-Fenstern zusammengefasst) und jeder
  Verbindung alle 30 s ein `hb`. Der Browser sendet nur `subscribe:<team_id>`, kein `push`.

## Browser (`script/script.js`)

- **Schreiben:** `apiWrite()` (POST, Timeout 15 s). Idempotente Endpunkte (`WRITE_RETRY_SCRIPTS`) werden nach einem
  reinen Netzfehler einmal nach 300 ms wiederholt, außer ein neuerer Schreibvorgang desselben Ziels kam dazwischen
  (B-135). Danach – Erfolg oder nicht – lädt der Schreiber das Board selbst (`afterWrite()` → `updateDao()`), ist also
  nicht auf das `pull` angewiesen.
- **Laden:** `updateDao()` nummeriert jede Anfrage; eine Antwort, die älter ist als der angezeigte Stand, wird verworfen
  (B-92, `gDaoSeq`/`gDaoShownSeq`). Die Antwort beim Seitenaufruf wird immer übernommen.
- **Fehlschlag beim Laden (B-94):** Netzfehler, HTTP-Fehler oder kein JSON → einmal nach 800 ms erneut laden
  (`DAO_RETRY_MS`), nicht in Schleife. Nur die jüngste Anfrage wird wiederholt; ein neuerer `updateDao()`-Aufruf
  ersetzt den ausstehenden Retry. Kein Hinweis an der Oberfläche, nur eine Log-Zeile.
- **Heartbeat (B-110, B-127):** Auf jedes `hb` ruft das Board 0–5 s später einmal `api/seen.php` auf (hält
  `last_callback_time` frisch, liefert nur `away_sig`). `dao.php` wird nur geladen, wenn sich `away_sig` geändert hat,
  unbekannt ist oder der Aufruf scheitert. Jeder andere Ladevorgang ersetzt den ausstehenden Heartbeat-Aufruf.
- **Verbindung (B-81, B-82, B-86):** Kommt 40 s lang weder `hb` noch `pull` (`HB_TIMEOUT_MS`) oder schließt die
  Verbindung, wird sie neu aufgebaut; ebenso beim Zurückkehren in den Tab, `online` und aus dem Seiten-Cache. `onopen`
  lädt das Board. Dauert die Störung länger als 1,2 s, zeigt `#conn_hint` „Reconnecting …“.

## Tests

`tests/e2e/specs/reconnect.spec.ts` (B-81, B-82, B-86), `dao-order.spec.ts` (B-92, B-94),
`post-writes.spec.ts`; Retry der Schreibvorgänge (B-135) in den zugehörigen Specs.
