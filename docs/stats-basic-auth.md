# Anmeldung für stats.php (B-02, B-63)

`stats.php` hat eine eigene Anmeldeseite (B-63). Benutzer und Passwort stehen weiterhin an **einer** Stelle: in
der htpasswd-Datei `/etc/nginx/poker-stats.htpasswd` (früher für nginx Basic Auth, B-02). Chrome und
Passwortmanager können die Zugangsdaten speichern und ausfüllen; nach dem Login bleibt man 30 Tage angemeldet,
auch nach einem Browser-Neustart.

Claude/die Agenten haben keinen Server-Zugriff. Die Schritte unten führt der Betreiber (Andreas) von Hand aus.

## Ablauf

- Ohne gültiges Cookie zeigt `stats.php` nur das Login-Formular, ohne Daten und ohne DB-Abfrage.
- Login (POST an `stats.php`): Zeile des Benutzers in der htpasswd-Datei, Prüfung mit `password_verify()`.
  **Nur bcrypt** (`$2y$`/`$2b$`, `htpasswd -B`). Andere Formate (z. B. `$apr1$`) werden abgelehnt, im PHP-Log steht
  dann `... has no bcrypt hash, re-hash with htpasswd -B`. Fehlversuch: 1 s Verzögerung, Meldung „Wrong user or
  password.“
- Angemeldet bleiben: Cookie `pokstats_auth` = `user|expires|hmac` (HMAC-SHA256), 30 Tage, HttpOnly,
  SameSite=Strict, Secure bei HTTPS, Pfad `/stats.php`. Schlüssel des HMAC ist der Hash-Eintrag des Benutzers in der
  Datei. Das Cookie wird bei jedem Aufruf gegen die aktuelle Datei geprüft: **Passwort ändern oder Benutzer löschen
  meldet alle Browser dieses Benutzers ab.** Kein Secret in `config.php` nötig, keine PHP-Session (Ubuntu räumt
  Session-Dateien nach 24 min ab).
- Moderation (POSTs im Tab „Ideas & Bugs“) nur mit gültigem Cookie und zusätzlich dem Formular-Token (Session).
- Abmelden: Button „Log out“ oben rechts (POST mit Formular-Token, löscht das Cookie).
- Ist die Datei nicht lesbar: „Login not configured“ (HTTP 503), Hinweis im PHP-Log, kein Zugang.
- Pfad der Datei: Default `/etc/nginx/poker-stats.htpasswd`, überschreibbar mit `const STATS_HTPASSWD` in
  `config.php` (nur für Tests nötig, siehe `config.example.php`).

## Benutzer pflegen

Benötigt `htpasswd` aus `apache2-utils`. Immer mit `-B` (bcrypt):

```bash
sudo htpasswd -B /etc/nginx/poker-stats.htpasswd <user>     # anlegen oder Passwort ändern
sudo htpasswd -D /etc/nginx/poker-stats.htpasswd <user>     # löschen
```

`-c` legt die Datei neu an und überschreibt sie – nur beim allerersten Benutzer verwenden.

## Umstellung auf den Servern (einmalig, Live und Staging/Release)

Reihenfolge: erst Code deployen, dann nginx. Solange nginx noch Basic Auth davor hat, funktionieren beide
Anmeldungen hintereinander – das ist unkritisch.

1. Code deployen (`git pull --ff-only`).
2. Datei prüfen – nur bcrypt-Einträge, und der PHP-FPM-User `www-data` muss sie lesen können:

   ```bash
   sudo cut -d: -f1,2 /etc/nginx/poker-stats.htpasswd | cut -c1-30   # Einträge müssen mit $2y$ beginnen
   ls -l /etc/nginx/poker-stats.htpasswd
   sudo -u www-data test -r /etc/nginx/poker-stats.htpasswd && echo lesbar
   ```

   Falls nicht lesbar (z. B. `-rw------- root root`):

   ```bash
   sudo chown root:www-data /etc/nginx/poker-stats.htpasswd
   sudo chmod 640 /etc/nginx/poker-stats.htpasswd
   ```

   Nicht-bcrypt-Einträge neu setzen: `sudo htpasswd -B /etc/nginx/poker-stats.htpasswd <user>`.
3. Im Browser `https://<server>/stats.php` öffnen: nach dem Basic-Auth-Dialog muss das neue Login-Formular kommen,
   Login klappen.
4. Basic Auth in nginx entfernen: im `server`-Block der Poker-Site im Block `location = /stats.php` die beiden
   Zeilen löschen (der Block selbst mit `include`/`fastcgi_pass` kann bleiben):

   ```nginx
   auth_basic           "Poker Stats";
   auth_basic_user_file /etc/nginx/poker-stats.htpasswd;
   ```

   Finden: `grep -Rn 'auth_basic' /etc/nginx/sites-enabled/`
5. Config testen und neu laden:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

6. Prüfen: `curl -s -o /dev/null -w '%{http_code}\n' https://<server>/stats.php` liefert `200` (Login-Formular),
   nicht mehr `401`.

## Secrets

- Die echte `poker-stats.htpasswd` wird **nie committet** und liegt nur auf den Servern, außerhalb des Webroots.
- Im Repo liegt nur `poker-stats.htpasswd.example` als Formatbeispiel mit Platzhalter-Hash.
