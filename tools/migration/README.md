# R3: Prüfung der Kartenset-Migration (B-98)

Mit Rollout 3 werden die alten Kartensets der Teams (`pok_teams_tbl.cardset_flags`, Bitmaske nach `cards.json` v1)
beim ersten Laden des Boards migriert (`getDao()` → `deck_from_cardset_flags()` / `migrate_team_deck_locked()` in
`api/lib.php`, `migrate_mixed_deck()` in `api/lib_custom.php`):

| Kategorie | altes Set | neues Set |
|---|---|---|
| `preset` | entspricht genau einer Variante | diese Variante (`deck_id`, `deck_cards` = null) |
| `subset` | Teilmenge einer Gruppe | Variante mit den alten Karten eingeschaltet (`deck_cards`) |
| `mixed` | Karten aus mehreren Gruppen | eigenes Set „Our deck“ (`deck_id` = `c-<id>`) |
| `empty` | keine Karte (nur Kontrollkarten oder nichts, z. B. `needs_setup`) | Default-Deck mit allen Karten (so gewollt) |

Kontrollkarten (☕ ? ! ✋) werden übernommen; ✋ entfällt nur bei J.U.D.G.E. mit „6 veto“.
Später überschreibt `store_team_deck()` `cardset_flags` – deshalb vorher ein Backup.

Werkzeuge (nur PHP-CLI; per Web-Aufruf liefern sie 404):

- `check_deck_migration.php` – **schreibt nichts** (Sitzung `read only`). Trockenlauf: jedes Muster der Teams ohne
  `deck_id` läuft durch die echten Funktionen dieses Checkouts und wird geprüft: die neuen Karten müssen genau die alten
  sein (Position aus `cards.json` v1 und Zahlenwert), die Kontrollkarten ebenso, keine unbekannte `deck_id`, Spalten
  nicht zu lang. Status `FAIL` = Abweichung, `WARN` = ansehen (leeres altes Set → Default-Deck, Deck mit nur einer
  Karte, Bits ohne Karte), `OK`. Exit-Code 2 bei FAIL. Ausgabe nur Muster und Zahlen, keine Team-IDs oder Namen.
  Optionen: `--days=N` (nur Teams mit Board-Aufruf oder angelegt in den letzten N Tagen), `--json`,
  `--config=<config.php>`, `--verify` (nach dem Deploy, siehe Schritt 7).
- `make_test_teams.php` – **nur Staging.** Legt aus der JSON-Ausgabe von Live je Muster ein Team „Migration test
  <Nr>“ an (normales Anlegen wie `addteam.php`, danach altes `cardset_flags`, `deck_id` = null) und gibt die
  Board-Links aus. Bricht ohne `--i-am-on-staging` und bei der Datenbank `pok_db` ab. Optionen:
  `--categories=mixed,subset` (Default; `all` für alle), `--top=N` (Muster mit den meisten Teams), `--dry-run`,
  `--base-url=…`, `--config=…`.
- Backup: Block `B-98 backup` in `db_schema_pok_inc.sql` → Tabelle `pok_teams_deck_backup_r3`
  (`id`, `cardset_flags`, `needs_setup`, `deck_id`, `deck_cards`, `deck_controls`, `creation_date`, `backup_date`).
  Idempotent, überschreibt nie einen früheren Stand.

## Ablauf

Die Befehle führt der Betreiber aus. Live: Code `/home/ubuntu/poker/public_html/`, DB `pok_db`.
Staging: Code `/home/ubuntu/poker-staging.komplexitaeter.de/public_html/` (Branch `rollout-3`), DB `pok_staging`.

### 1. Live: R3-Code zum Prüfen bereitstellen (außerhalb des Web-Roots)

Live läuft noch `master`; der Trockenlauf braucht den R3-Code. Deshalb ein eigener Checkout neben `public_html`,
die Zugangsdaten kommen aus der Live-`config.php`:

```bash
git clone --depth 1 --branch rollout-3 "$(git -C /home/ubuntu/poker/public_html remote get-url origin)" /home/ubuntu/poker-r3-check
# später aktualisieren: git -C /home/ubuntu/poker-r3-check pull --ff-only
```

### 2. Live: Trockenlauf

Funktioniert auch vor den R3-Schemaänderungen (ohne Spalte `deck_id` zählen alle Teams als nicht migriert).

```bash
cd /home/ubuntu/poker-r3-check
php8.4 tools/migration/check_deck_migration.php --config=/home/ubuntu/poker/public_html/config.php
php8.4 tools/migration/check_deck_migration.php --config=/home/ubuntu/poker/public_html/config.php --days=90
php8.4 tools/migration/check_deck_migration.php --config=/home/ubuntu/poker/public_html/config.php --json > /home/ubuntu/r3-patterns.json
```

Die Ausgabe (Text und JSON) enthält keine Team-IDs oder Namen und kann ans Team bzw. an Claude gehen.
Jedes `FAIL` muss vor dem Deploy geklärt sein.

### 3. JSON nach Staging kopieren

z. B. vom eigenen Rechner: `scp <live>:/home/ubuntu/r3-patterns.json <staging>:/home/ubuntu/`

### 4. Staging: Testteams anlegen

```bash
cd /home/ubuntu/poker-staging.komplexitaeter.de/public_html
git pull --ff-only
php8.4 tools/migration/make_test_teams.php --i-am-on-staging --input=/home/ubuntu/r3-patterns.json --top=20 --dry-run
php8.4 tools/migration/make_test_teams.php --i-am-on-staging --input=/home/ubuntu/r3-patterns.json --top=20
```

Ausgegeben werden je Team Name, Kategorie, Zahl der Live-Teams mit diesem Muster, die alten Karten und der Link.
Danach auf Staging (bevor die Links geöffnet werden) das Backup laufen lassen, damit Schritt 5 auch `--verify` testet:

```bash
sed -n '/^\/\* B-98 backup:/,/^\/\* end B-98 backup/p' db_schema_pok_inc.sql | sudo mysql --defaults-file=/etc/mysql/debian.cnf pok_staging
```

### 5. Staging: von Hand prüfen

Jeden Link öffnen: Sind genau die alten Karten da (Liste aus Schritt 4), die alten Kontrollkarten, bei `mixed` ein
eigenes Set „Our deck“ in der alten Reihenfolge, daneben das Beispielset „Animals (Example)“? Danach:

```bash
php8.4 tools/migration/check_deck_migration.php --verify
```

### 6. Live: Deploy (abends oder am Wochenende)

1. R3-Schemaänderungen aus `db_schema_pok_inc.sql` (wie im Release geplant).
2. Backup, **unmittelbar vor** `git pull`:
   ```bash
   cd /home/ubuntu/poker/public_html
   git fetch origin
   git show origin/master:db_schema_pok_inc.sql | sed -n '/^\/\* B-98 backup:/,/^\/\* end B-98 backup/p' \
     | sudo mysql --defaults-file=/etc/mysql/debian.cnf pok_db
   ```
   Die letzte Abfrage des Blocks zeigt `teams` = `backed_up`.
3. `git pull --ff-only`

### 7. Live: Validierung nach dem Deploy

Nach einigen Minuten und am nächsten Werktag noch einmal (Teams werden erst beim ersten Laden migriert):

```bash
php8.4 /home/ubuntu/poker/public_html/tools/migration/check_deck_migration.php --verify
```

Vergleicht jedes Team, das beim Backup noch kein Deck hatte, mit dem erwarteten Ergebnis aus seinem gesicherten
`cardset_flags`: `ok`, `mismatch` (Exit-Code 2, mit erwartetem und tatsächlichem Deck je Muster), `changed_by_team`
(Team hat das Set inzwischen geändert, `deck_rev` > 0), `not_loaded_yet`. Dazu SQL
(`sudo mysql --defaults-file=/etc/mysql/debian.cnf pok_db`), nur Zahlen:

```sql
/* 1. Backup vollständig: Teams, die vor dem Deploy angelegt wurden, fehlen nicht */
select (select count(*) from pok_teams_deck_backup_r3) backed_up,
       (select count(*) from pok_teams_tbl t
         where t.creation_date <= (select min(backup_date) from pok_teams_deck_backup_r3)
           and not exists (select 1 from pok_teams_deck_backup_r3 b where b.id = t.id)) missing_in_backup;

/* 2. Noch nicht migriert: insgesamt und davon aktiv (Board in den letzten 10 Minuten geladen) - aktiv muss 0 sein */
select /*+ MAX_EXECUTION_TIME(60000) */ count(*) not_migrated,
       coalesce(sum(exists (select 1 from pok_players_tbl p
                             where p.team_id = t.id and p.last_callback_time >= now() - interval 10 minute)), 0)
         active_not_migrated
  from pok_teams_tbl t where t.deck_id is null;

/* 3. Sets "Our deck": Zahl der Sets und Teams, Teams mit mehr als einem (muss 0 sein) */
select count(*) sets, count(distinct team_id) teams from pok_custom_sets_tbl where name = 'Our deck' and deleted = 0;
select count(*) teams_with_two_our_decks from (select team_id from pok_custom_sets_tbl
  where name = 'Our deck' and deleted = 0 group by team_id having count(*) > 1) x;

/* 4. Teams mit deck_id, aber ohne gültiges Set (muss 0 sein): eigenes Set fehlt, gelöscht, gehört nicht zum Team oder
      hat keine aktiven Karten; bzw. unbekannte Variante (Liste wie card_catalog.json) */
select /*+ MAX_EXECUTION_TIME(60000) */ count(*) custom_deck_without_set from pok_teams_tbl t
 where t.deck_id like 'c-%'
   and not exists (select 1 from pok_custom_sets_tbl s
                    where s.id = cast(substring(t.deck_id, 3) as unsigned) and s.team_id = t.id and s.deleted = 0
                      and exists (select 1 from pok_custom_cards_tbl c
                                   where c.set_id = s.id and c.active = 1 and c.card_key is not null));
select /*+ MAX_EXECUTION_TIME(60000) */ deck_id, count(*) teams from pok_teams_tbl
 where deck_id is not null and deck_id not like 'c-%'
   and deck_id not in ('fib-classic', 'fib-short', 'fib-true', 'numbers', 'tshirt', 'traffic', 'emotions', 'mood',
                       'stars', 'judge', 'delegation')
 group by deck_id;

/* 5. Vergleich mit dem Backup: migrierte Teams je Ergebnis (eigenes Set bzw. Variante). Teams mit eigenem Set
      sollten ungefähr den bereits geladenen "mixed"-Teams aus dem Trockenlauf entsprechen. */
select /*+ MAX_EXECUTION_TIME(60000) */ if(t.deck_id like 'c-%', 'custom set', t.deck_id) deck,
       sum(t.deck_rev = 0) unchanged, sum(t.deck_rev > 0) changed_by_team, count(*) teams
  from pok_teams_deck_backup_r3 b join pok_teams_tbl t on t.id = b.id
 where b.deck_id is null and t.deck_id is not null
 group by 1 order by teams desc;
```

### Notfall: einzelne Teams zurücksetzen

Das Backup enthält den alten Stand. Ein Team zurück auf seine alten Flags setzen (die R3-App migriert es beim
nächsten Laden erneut; ein vorhandenes „Our deck“ mit gleichen Karten wird wiederverwendet):

```sql
update pok_teams_tbl t join pok_teams_deck_backup_r3 b on b.id = t.id
   set t.cardset_flags = b.cardset_flags, t.deck_id = null, t.deck_cards = null, t.deck_controls = null
 where t.id = '<team id>';
```

Nach einem Code-Rollback auf `master` liest die alte App wieder `cardset_flags`; Teams, die ihr Set in R3 geändert
haben, behalten die von `store_team_deck()` geschriebenen Flags.

Nach dem erfolgreichen Abschluss von R3 kann die Backup-Tabelle (nach Rücksprache) gelöscht werden; der
Prüf-Checkout auf Live mit `rm -rf /home/ubuntu/poker-r3-check`.
