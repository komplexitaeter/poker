# Anmeldung für stats.php (B-02, B-63)

`stats.php` hat eine eigene Anmeldeseite (B-63). Benutzer und Passwort stehen weiterhin an **einer** Stelle: in
der htpasswd-Datei `/etc/nginx/poker-stats.htpasswd` (früher für nginx Basic Auth, B-02). Chrome und
Passwortmanager können die Zugangsdaten speichern und ausfüllen; nach dem Login bleibt man 30 Tage angemeldet,
auch nach einem Browser-Neustart.

Claude/die Agenten haben keinen Server-Zugriff. Die Schritte unten führt der Betreiber (Andreas) von Hand aus.

## Ablauf

- Ohne gültiges Cookie zeigt `stats.php` nur das Login-Formular, ohne Daten und ohne DB-Abfrage.
- Login (POST an `stats.php`): Zeile des Benutzers in der htpasswd-Datei, Prüfung mit `password_verify()`.
  **Nur bcrypt** (`$2y$`/`$2b$`, `htpasswd -B -C 12`). Andere Formate (z. B. `$apr1$`) werden abgelehnt, im PHP-Log
  steht dann `... has no bcrypt hash, re-hash with htpasswd -B -C 12`. Fehlversuch: 1 s Verzögerung, Meldung „Wrong
  user or password.“ Unbekannte Benutzer werden gegen einen vorhandenen Hash der Datei geprüft (gleiche Dauer, die
  Antwortzeit verrät keine Benutzernamen).
- Gegen Durchprobieren zusätzlich nginx `limit_req` auf POSTs an `/stats.php` (siehe Umstellung, Schritt 4):
  `stats.php` läuft im FPM-Pool `www` wie die App, viele parallele Fehlversuche mit je 1 s würden sonst Worker binden.
- **Passwörter lang und zufällig wählen (mindestens 16 Zeichen)**, z. B. aus dem Passwortmanager.
- Angemeldet bleiben: Cookie `pokstats_auth` = `user|expires|hmac` (HMAC-SHA256), 30 Tage, HttpOnly,
  SameSite=Strict, Secure bei HTTPS, Pfad `/stats.php`. Schlüssel des HMAC wird aus dem Hash-Eintrag des Benutzers in der
  Datei und dem Server-Secret `STATS_COOKIE_SECRET` (`config.php`) gebildet. Das Cookie wird bei jedem Aufruf gegen die aktuelle Datei geprüft: **Passwort ändern oder Benutzer löschen
  meldet alle Browser dieses Benutzers ab**, ein neues `STATS_COOKIE_SECRET` alle Benutzer. Keine PHP-Session für das
  Angemeldet-Bleiben (Ubuntu räumt Session-Dateien nach 24 min ab); eine Session (Formular-Token) gibt es nur für
  angemeldete Aufrufe.
- Moderation (POSTs im Tab „Ideas & Bugs“) nur mit gültigem Cookie und zusätzlich dem Formular-Token (Session).
- Abmelden: Button „Log out“ oben rechts (POST mit Formular-Token, löscht das Cookie).
- Ist die Datei nicht lesbar oder fehlt `STATS_COOKIE_SECRET` (mindestens 32 Zeichen): „Login not configured“
  (HTTP 503), Hinweis im PHP-Log, kein Zugang.
- Pfad der Datei: Default `/etc/nginx/poker-stats.htpasswd`, überschreibbar mit `const STATS_HTPASSWD` in
  `config.php` (nur für Tests nötig). `STATS_COOKIE_SECRET` ist Pflicht, siehe `config.example.php`.

## Benutzer pflegen

Benötigt `htpasswd` aus `apache2-utils`. Immer mit `-B -C 12` (bcrypt, Kosten 12):

```bash
sudo htpasswd -B -C 12 /etc/nginx/poker-stats.htpasswd <user>   # anlegen oder Passwort ändern
sudo htpasswd -D /etc/nginx/poker-stats.htpasswd <user>     # löschen
```

`-c` legt die Datei neu an und überschreibt sie – nur beim allerersten Benutzer verwenden.

## Umstellung auf den Servern (einmalig, Live und Staging/Release)

Reihenfolge: Secret, Code, dann nginx. Solange nginx noch Basic Auth davor hat, funktionieren beide
Anmeldungen hintereinander – das ist unkritisch.

1. Cookie-Secret in `config.php` ergänzen (pro Server ein eigenes; schon vor dem Deploy, die Konstante stört den
   alten Code nicht, sonst zeigt `stats.php` bis dahin „Login not configured“):

   ```bash
   php -r 'echo bin2hex(random_bytes(32)), "\n";'
   ```

   Ausgabe in `config.php` (Live: `/home/ubuntu/poker/public_html/config.php`) eintragen:

   ```php
   const STATS_COOKIE_SECRET = '<ausgabe>';
   ```

2. Code deployen (`git pull --ff-only`).
3. Datei prüfen – nur bcrypt-Einträge, und der PHP-FPM-User `www-data` muss sie lesen können:

   ```bash
   sudo awk -F: '{print $1, substr($2,1,7)}' /etc/nginx/poker-stats.htpasswd   # erwartet: <user> $2y$12$
   ls -l /etc/nginx/poker-stats.htpasswd
   sudo -u www-data test -r /etc/nginx/poker-stats.htpasswd && echo lesbar
   ```

   Falls nicht lesbar (z. B. `-rw------- root root`):

   ```bash
   sudo chown root:www-data /etc/nginx/poker-stats.htpasswd
   sudo chmod 640 /etc/nginx/poker-stats.htpasswd
   ```

   Andere Einträge (nicht `$2y$`, oder niedrigere Kosten) neu setzen:
   `sudo htpasswd -B -C 12 /etc/nginx/poker-stats.htpasswd <user>`.
4. **Vor** dem Entfernen von Basic Auth: Begrenzung der POSTs (Login, Logout, Moderation) je IP. Neue Datei
   `/etc/nginx/conf.d/poker-stats-limit.conf` (wird im `http`-Kontext geladen):

   ```nginx
   # stats.php (B-63): POSTs per IP limited, GETs (live reload) are not
   map $request_method $pokstats_post_key { POST $binary_remote_addr; default ""; }
   limit_req_zone $pokstats_post_key zone=pokstats_post:1m rate=6r/m;
   ```

   Die Zone muss technisch im `http`-Kontext stehen (daher die eigene Datei mit dem eindeutigen Namen
   `pokstats_post`), sie **wirkt aber nur dort, wo `limit_req zone=pokstats_post` steht**. Die beiden Zeilen
   unten deshalb **ausschließlich im Block `location = /stats.php`** der Poker-Site eintragen – nirgends sonst,
   nicht im `server`-Block, nicht in `location ~ \.php$`. Andere Seiten und Pools (teamcar, feedback, WordPress,
   flowgame, kaffeeklatsch) und die App selbst (`/api/*.php`, `/poker-msg`) sind dadurch nicht betroffen.

   ```nginx
   location = /stats.php {
       # ... bestehende Zeilen (include, fastcgi_pass, bis Schritt 6 auch auth_basic) ...
       limit_req        zone=pokstats_post burst=10 nodelay;
       limit_req_status 429;
   }
   ```

   Kontrolle, dass die Zone nur dort benutzt wird (genau ein Treffer, in `location = /stats.php`):

   ```bash
   grep -Rn 'pokstats_post' /etc/nginx/
   ```

   Hinweis: 10 POSTs am Stück, danach einer je 10 s. Bei sehr schneller Moderation vieler Einträge kann ein
   `429` kommen – kurz warten, neu laden.
5. Im Browser `https://<server>/stats.php` öffnen: nach dem Basic-Auth-Dialog muss das neue Login-Formular kommen,
   Login klappen.
6. Basic Auth in nginx entfernen: im Block `location = /stats.php` die beiden Zeilen löschen (der Block selbst mit
   `include`/`fastcgi_pass`/`limit_req` bleibt):

   ```nginx
   auth_basic           "Poker Stats";
   auth_basic_user_file /etc/nginx/poker-stats.htpasswd;
   ```

   Finden: `grep -Rn 'auth_basic' /etc/nginx/sites-enabled/`
7. Config testen und neu laden:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

8. Prüfen:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<server>/stats.php      # 200 (Login-Formular), nicht 401
   curl -sI http://<server>/stats.php | head -3                               # 301 nach https://
   # Begrenzung: 15 Login-POSTs, am Ende 429
   for i in $(seq 15); do curl -s -o /dev/null -w '%{http_code} ' -d 'action=login&user=x&password=x' https://<server>/stats.php; done; echo
   # gleich danach: die App ist nicht begrenzt, 20 schnelle POSTs auf eine API-URL (nur lesend) liefern 200, kein 429
   for i in $(seq 20); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://<server>/api/get_roadmap.php; done; echo
   ```

## Secrets

- Die echte `poker-stats.htpasswd` wird **nie committet** und liegt nur auf den Servern, außerhalb des Webroots.
- Im Repo liegt nur `poker-stats.htpasswd.example` als Formatbeispiel mit Platzhalter-Hash.
