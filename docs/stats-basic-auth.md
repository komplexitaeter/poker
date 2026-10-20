# stats.php per nginx Basic Auth schützen (B-02)

`stats.php` ist bisher ohne Authentifizierung öffentlich erreichbar. Dieses
Dokument beschreibt, wie der Endpunkt auf Live- und Staging/Release-Server per
nginx HTTP Basic Auth geschützt wird.

Claude/die Agenten haben keinen Server-Zugriff. Die folgenden Schritte führt der
Betreiber (Andreas) von Hand aus.

## Reihenfolge

1. **Zuerst Code deployen** (`git pull --ff-only` auf dem jeweiligen Server).
   Das Output-Escaping in `stats.php` (B-02, Teil 1) muss aktiv sein, bevor der
   Endpunkt wieder geöffnet wird.
2. Danach die nginx-Location und die htpasswd-Datei einrichten (siehe unten).
3. Config testen und nginx neu laden:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

Diese Reihenfolge gilt identisch auf **beiden** Servern (Live + Staging/Release).

## 1. nginx-Location-Snippet

In den `server`-Block der Poker-Site (auf beiden Servern gleich) aufnehmen:

```nginx
# stats.php nur mit Basic Auth erreichbar.
# Wichtig: "location =" ist ein exakter Match und hat Vorrang vor dem
# generischen "location ~ \.php$". Ohne diesen Block griffe der generische
# PHP-Block und stats.php bliebe offen.
location = /stats.php {
    auth_basic           "Poker Stats";
    auth_basic_user_file /etc/nginx/poker-stats.htpasswd;

    # Gleiche FastCGI-Weiterleitung wie im bestehenden "location ~ \.php$"-Block.
    # Werte an die vorhandene Site-Config angleichen (Socket-Pfad etc.).
    include              snippets/fastcgi-php.conf;
    fastcgi_pass         unix:/run/php/php8.4-fpm.sock;
}
```

Hinweise:

- Die htpasswd-Datei liegt **außerhalb des Webroots**
  (`/etc/nginx/poker-stats.htpasswd`), damit sie nie über HTTP ausgeliefert wird.
- Die FastCGI-Direktiven (`include`, `fastcgi_pass`) müssen zum bestehenden
  PHP-Block der Site passen (gleicher Socket `php8.4-fpm.sock`, ggf.
  `fastcgi_param`-Zeilen übernehmen). Nur `auth_basic` + `auth_basic_user_file`
  kommen zusätzlich hinzu.
- Spezifität entscheidet: `location = /stats.php` (exakt) schlägt den
  Regex-Block `location ~ \.php$`. Deshalb braucht es keinen weiteren Umbau am
  generischen Block.

## 2. htpasswd-Datei anlegen

Benötigt `htpasswd` aus dem Paket `apache2-utils`:

```bash
sudo apt-get install -y apache2-utils
```

Datei anlegen und ersten Nutzer setzen (`-c` legt die Datei NEU an und
überschreibt sie dabei):

```bash
sudo htpasswd -c /etc/nginx/poker-stats.htpasswd <user>
```

Weitere Nutzer hinzufügen (ohne `-c`, sonst wird die Datei überschrieben):

```bash
sudo htpasswd /etc/nginx/poker-stats.htpasswd <weiterer_user>
```

Das Passwort wird interaktiv abgefragt. Danach Config testen und neu laden
(siehe "Reihenfolge").

## 3. Secrets

- Die echte `poker-stats.htpasswd` wird **nie committet** und liegt nur auf den
  Servern.
- Im Repo liegt nur `docs/poker-stats.htpasswd.example` als reines Formatbeispiel
  mit Platzhalter-Hash (kein echtes Passwort).
