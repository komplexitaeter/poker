# Backlog

Gemeinsames Backlog für Wartung und Weiterentwicklung der Poker-App. Ablauf (Backlog → Refinement → Sprint-Auswahl →
Planning → Umsetzung → Abschluss) siehe `CLAUDE.md`, Abschnitt „Zusammenarbeit“.

**Status:** `neu` → `refined` (gemeinsam verstanden, bereit für einen Sprint) → `im Sprint` → `live (Rollout/Datum)`
bzw. `erledigt` (Betrieb/Doku ohne Rollout) · `verworfen` · `aufgegangen in B-xx`.
Offene Einträge stehen in den drei Abschnitten „Offen: …“ (je Abschnitt `refined` vor `neu`, dann nach ID; Priorität setzt Andreas).
Erledigte und verworfene Einträge stehen nur noch als Kurzzeile unter „Erledigt & verworfen“.

Volltexte und Genese vor dem Aufräumen: `git show 65c605b:BACKLOG.md`.

## Leitidee (Andreas, 2026-11-10)

**Refinement ist ein wiederkehrendes Gespräch.** Schätzen ist die Kommunikationsmethode, nicht das Urteil: Es geht
darum, eine gemeinsame Vorstellung davon zu entwickeln, was man zusammen erreichen will. Items kommen mehrfach ins
Refinement und werden dabei konkreter (erst lose Ideen, dann Notizen, Mockups, erste Umsetzungen). Ein breiter
Spread oder „nochmal mitbringen“ ist kein Fehler, sondern genau das, worüber man reden sollte. Viele Teams erleben
es anders („Item gut vorbereiten, einmal schätzen, umsetzen – alles andere ist ein Fehler“); die App soll den
iterativen Weg leicht und normal machen (Funktionen, aber auch Sprache und Tipps). Betrifft vor allem B-52, B-53, B-129.

**Daten:** Erwachsene Menschen geben Daten ein und teilen einen Link. Die App behält Items, solange das Team sie
braucht; die Teams haben selbst in der Hand, was sie löschen oder absichern. Datensicherheit ist wichtig, aber nicht
die Primärfunktion (Andreas, 2026-11-10).

## Aktueller Sprint

**Sprint 9 – Aufräumen unter der Haube** (Andreas, 2026-11-16): Refactoring und technische Schulden, nichts für die
Nutzer Sichtbares. Schrittweise, je Schritt eigene PRs und Sichtung auf Staging; Rollout danach mit B-12.
1. ✓ live R5 – B-136 Umfrage entfernen · B-93 `push` aus poker-msg · B-94 Neuladen nach Fehler · B-138 CI `php -l`
2. ✓ live R5 – B-137 Prepared Statements (Rest) · B-97 Assets aufräumen
3. ✓ live R6 – B-34 Startdaten asynchron laden (dazu B-140, B-141)
4. ✓ live R7 – B-14 erster Schnitt: `reactions.js`, `timer.js`, `connection.js` aus `script.js`
5. ✓ B-12 Zeichensätze `utf8mb4`: Schema live 2026-11-26 (von Hand, ca. 1 Min.), Code mit dem nächsten Rollout
Jederzeit: B-126 / B-23-Rest (nginx-Sperren, Upload-Grenzen – Befehle für Andreas). Nicht angetastet: B-10.

## Rollouts

Vor R1 gingen die Sprints 1–7 (2026-10-16 bis 2026-10-23) einzeln live, siehe „Erledigt & verworfen“.

- **R1 (2026-10-28) – neuer Look, gleicher Ablauf** (#56; danach #57–#66): B-46 bis B-51 (Console Style, Seitengerüst,
  Menüs als Side Panel/Bottom-Sheet, fluide Karten), B-54, B-57; direkt danach B-63, B-64.
- **R2 (2026-11-01):** B-66, B-67 (Basic Controls, Timer), B-68, B-69, B-70, B-73, B-74, B-75, B-77, B-78, B-79,
  B-81 (Server-Notify, poker-msg#3), B-82, B-86, B-85, B-88, B-89, B-92, B-96; DB-Teile B-83/B-87 vorab (2026-10-30).
- **R3 (2026-11-06) – Karten neu:** B-76, B-98, B-99, B-101, B-102, B-103, B-104, B-106, B-107, B-110, B-112 (Teil),
  B-115, B-116.
- **Release 2026-11-09 (#225):** B-113 (Sidebar ein-/ausklappbar), B-127 (leichter Heartbeat).
- **R8 (2026-11-26, abends):** B-152 Schritte BE-1/FE-1 (UID vom Server, nur noch im Header), B-154 (Entfernte als
  Observer), Promo-Reste und `update_cardset.php` entfernt, B-12-Code (`db_init()`). Dazu B-156 (kryptische Team-IDs für neue Teams)
  und der Deadlock-Fix beim gleichzeitigen Anlegen von Sets (#279, B-155). BE-2 folgt, sobald das Access-Log
  keine `id=`-Aufrufe mehr zeigt.
- **R7 (2026-11-25):** B-14 erster Schnitt (Reaktionen, Timer, Verbindung als eigene Skripte), Topic-Panel: „reopen“
  beim Löschen nicht mehr abgeschnitten; Mockup `mockups/fish-tokens/` (B-145/B-146).
- **R6 (2026-11-18):** B-34 (asynchroner Start), B-140, B-141 (Farbmodus lokal), Farbmodus ohne Board speichern, Notiz im Menü aktuell.
- **R5 (2026-11-16, abends):** B-139 (Emoji-Kontingent), Sprint 9 Schritte 1–2: B-93, B-94, B-97, B-136, B-137, B-138.
- **R4 (2026-11-16):** B-52 (Topic list), B-53 (Median), B-130 (Timer-Auto-Start), B-131, B-133 (Nudge-Ton),
  B-135 (Write-Retry); dazu B-134 (CI).

## Offen: Produkt & Ideen

### B-114 Verdeckt wählen beim Bildschirmteilen
Status: refined. Roadmap „Secret selecting for presenters“ (Stand 2026-11-05: 7 👍, 0 👎).
Problem: Wer den Bildschirm teilt (oft Scrum Master/Moderation), verrät beim Abstimmen die eigene Wahl (Karte im Deck
hervorgehoben, am eigenen Platz offen). Zwei Tabs derselben Person funktionieren heute schon (gleiche User-ID).
Entscheidungen (Andreas, 2026-11-05):
- Reine **Präsentier-Ansicht** in einem zweiten Tab: eigene Karte am Tisch verdeckt bis zum Aufdecken, kein Deck,
  keine Controls (Deck, Round-Button), Menüs weitgehend weg; dort ein Knopf „Return to user view“. Abgestimmt wird
  im normalen Tab. Vermutlich kleiner Aufwand (Frontend).
- Zugang nur für einen in diesem Team bereits registrierten Spieler/Beobachter (User-ID im Browser); sonst normale
  Ansicht mit Namensabfrage. Kein neuer Weg aufs Board ohne Namen.
- Lieber kein Parameter in der URL (kopierte Links bleiben normale Links). Vorschlag Kai: Tab per
  `window.open(url, 'poker-presenter')` öffnen, `window.name` markiert die Ansicht (übersteht Reloads).
Offen: was genau die Präsentier-Ansicht vom Panel zeigt (folgt B-113), Handy.

### B-44 Startseite Light-Mode: Logo ohne Schriftzug
Status: neu. Beim B-36-Review gefunden (Delia, 2026-10-23): Auf `init.html` zeigt das Logo im Light-Mode nur das
Bildzeichen, der Schriftzug fehlt. Klein.
Entscheidung (Andreas, 2026-11-16): offen lassen; Delia prüft bei Gelegenheit, ob es nach R3 noch besteht.

### B-50 Kleinpaket Qualität
Status: live R1 (2026-10-28) zum größten Teil, Rest offen:
- `user-select: none` sitzt noch am ganzen `body` → Topic-Text nicht kopierbar; nur gezielt (Karten, Kartenleiste).
- Erster Besuch: Farbmodus aus `prefers-color-scheme` (eigener Schalter bleibt).
- Token-Namen nach Bedeutung statt Einsatzort, einheitliche Schreibweise. Aufwand S (Delia).

### B-52 Topics als Backlog-Items
Status: live R4 (2026-11-16), #228–#250 (Items-Liste, Note · Open · Done, Next/Finish item, Historie je Item, Export).
Rest offen:
- **Zweck umschaltbar** (eigener Schritt): Team schaltet je Set bzw. je Item/Runde zwischen „agree“ und „show
  perspectives“ (z. B. im Results-Panel); eigene Sets wählen ihn beim Anlegen.
- **Done-Liste** zeigt nur die neuesten 50 Items, ohne „mehr laden“; ältere lassen sich nicht wieder öffnen.
- Nach dem **Löschen eines eigenen Sets** zeigen Done-Items und Export rohe Kartenschlüssel (`c-…`).
- **Aufräumen bei langer Inaktivität** höchstens als Sicherheitsnetz (Frist offen).
- **E-Mail-PIN** (Idee Andreas, 2026-11-09, eigener Eintrag bei Bedarf): E-Mail am User hinterlegen (per PIN
  bestätigt), damit Historie freischalten bzw. die eigene User-ID auf einem neuen Gerät wiederherstellen (leichter
  Account ohne Passwort). Erste E-Mail-Adresse in der DB → Datenschutz, Mailversand (SPF/DKIM), Löschen durch den
  User; Sina prüft vorher. „Ohne Login“ bleibt das Versprechen: Schätzen und Export gehen immer ohne.
- Timeboxen/Agenda → B-129; Set je Item, Metafrage (Reifegrad) → B-132; öffentliche API → B-80.
- Offene Frage: neue Team-IDs mit Zufallsanteil (heute aus dem Teamnamen abgeleitet, `name2id()`, bei kurzen Namen
  erratbar; der Team-Link ist eine Parole, keine Zugangskontrolle).
- Idee (Andreas, 2026-11-10, aus einem anderen Tool): Items als **Kartenstapel** (aktives Item oben, die nächsten
  schauen dahinter hervor), daneben groß der Ergebnisvorschlag. Nur die Idee, Console Style bleibt.

Geltende Entscheidungen (Andreas, 2026-11-07 bis 2026-11-13):
- **Einfachster Fall bleibt einfach:** Wer nur ein Topic eingibt wie früher, hat es nicht komplizierter und braucht
  nicht mehr Klicks. ID, Description, Timebox, Reifegrad sind optional.
- **Notiz bleibt Notiz:** das bisherige Topic-Feld ist ein allgemeiner, immer sichtbarer Hinweis (oben über den
  Karten); Items kommen zusätzlich, durch sie iteriert man. Keine automatische Übernahme alter Topics als Item.
- Items anlegen, bearbeiten, umsortieren, abschließen und wieder öffnen dürfen **alle**.
- **Items bleiben, solange das Team sie braucht** (Leitidee); Löschen und Absichern liegen beim Team (Items, Team,
  ggf. Link erneuern). Kein automatisches Löschen kurz nach der Session (verworfen 2026-11-10).
- „Next item“/„Finish item“ fragt **immer** nach (Overlay mit Cancel, passende Option vorausgewählt): „Close with
  <Wert>“ · „Close without a value“ · „Bring it back later“ (ans Ende, Runden/Verteilung bleiben); bei
  Perspektiven-Sets nur „Close“ · „Bring it back later“. Backend prüft dieselbe Regel. In der schmalen Leiste
  Variante „Split“ (zwei Hälften „next item“/„finish item“ und „new round“).
- **Generisch, nie am Set-Namen:** Entscheidend ist der Zweck – Einigung (ein Wert) oder Perspektiven nebeneinander
  (nur Verteilung). Merkmal am Set mit Default aus dem Katalog (`"range": false` = Perspektiven), Prüfung an genau
  einer Stelle; „Ziel Einigung“ auch an eigenen Sets einstellbar.
- **Ergebnisregel:** Am abgeschlossenen Item wird immer die Verteilung gespeichert (Anzahl je Karte, ohne
  Personenbezug). Ein Ergebniswert nur bei Sets mit Ziel Einigung: vorbelegt der höchste gelegte Wert mit
  `numeric_value` (∞ zählt nicht), vom Team änderbar (Balken im Spread oder Dropdown). Ohne Karte mit Wert kein
  automatisches Ergebnis, manuell wählbar.
- **Reifegrad** am Item optional (vom PO gesetzt), in Voting/Results nur angezeigt (Dreieck + Stufenname, Erklärtext
  sichtbar bzw. aufklappbar, kein reiner Tooltip). Eingabe seit 2026-11-13 ausgeblendet, siehe B-132.
- **dao.php klein halten:** dao liefert nur das aktive Item, Anzahlen und `topics_rev`; die Liste kommt über
  `api/get_topics.php` nur bei geändertem `topics_rev` (Done erst beim Öffnen des Tabs). **Jede** Änderung an Items
  zählt `topics_rev` hoch (an einer Stelle erzwungen, per Test abgesichert). Kein neuer Signaltyp in poker-msg.
- Historie nur je Item (Timeline: Datum / Items / Zukunft), keine eigene Rundenhistorie; wer was gelegt hat, vorerst
  nicht. Export „Copy results“ im Format für Jira/Linear statt eigener Integration.

### B-53 Ergebnisdarstellung
Status: live R4 (2026-11-16) mit Median-Linie, #237, #241, #242, #256. Rest offen (Ideen aus einem anderen Tool,
Andreas 2026-11-10, Fragen für Delia):
1. Phasen sichtbar als Schritte (z. B. Discuss → Estimate → Review) mit einer Zeile, was jetzt zu tun ist.
2. Durchgehende Farbskala nach Wert (niedrig → hoch) für Deck, Balken und gelegte Karten, damit Ausreißer auffallen.
3. Ergebnis nach Wert gruppiert: je Wert eine Karte mit den Personen darauf (bei vielen Spielern übersichtlicher).
Keine bunten Verläufe, Avatare oder Fächer-Deck – Console Style bleibt.
Geltend: bewusst **kein Durchschnittswert als Zahl** (Average-Indicator bleibt); Median braucht nur eine Reihenfolge
(T-Shirt, Sterne, ∞ als größter Wert), Karten ohne Wert (?, ☕, ✋ …) zählen nicht; bei gerader Anzahl liegt die
Linie nach Wert zwischen den beiden mittleren Karten, zwischen einem Wert und ∞ ist der Median ∞ (Andreas,
2026-11-15). ∞ ist überall der größte Wert: Spannweite, Average-Zeiger (springt auf ∞) und Median. Median und
Average-Zeiger gibt es nur mit „Average and median“ und nicht bei Sets mit dem Ziel „perspectives“.

### B-80 Öffentliche API: Topic-Items von außen anlegen
Status: aufgegangen in B-150/B-151 (Andreas, 2026-11-26). Bisher: neu. Feedback (2026-10-29): „Add API to allow setting the topic.“ Faktisch gibt es `POST
/api/update_topic.php?t=<team-id>` (Feld `topic`, max. 2000 Zeichen) schon; Boards aktualisieren sich seit B-81 auch
bei Aufrufen von außen.
Entscheidungen/Skizze (Andreas, 2026-10-29): erst mit B-52 zusammen durchdenken – eine öffentliche API ist eine
Abhängigkeit mehr. Richtung umdrehen: andere Systeme schicken Topics an uns (Jira Automation, Skripte, Zapier/n8n),
statt dass wir Jira & Co. anbinden. Eigene öffentliche API (REST, OpenAPI-Doku): Topic mit Key anlegen (`add_topic`),
Ergebnis je Key abfragen (`get_topic_result`), Webhook bei Ergebnis.
Ideen Kai: eigener Namensraum `/api/v1/…` (interne App-API bleibt frei änderbar); widerrufbarer API-Key je Team statt
Team-ID in der URL; Key je Team eindeutig (erneutes Anlegen aktualisiert); Webhook mit HMAC-Signatur. REST-Verben
(`DELETE`) erst hier, die interne API bleibt bei POST (B-91).
Offen: was „das Ergebnis“ ist (seit B-52: Wert/Verteilung am Item); welche Endpunkte stabil sind.
Entscheidung (Andreas, 2026-11-16): offen lassen, umformuliert auf Topic-Items (B-52): Items per API anlegen (z. B.
aus Jira) und ihr Ergebnis abfragen; noch nicht priorisiert.

### B-100 Eigene Kartensets als Bezahlfunktion
Status: neu. Idee Andreas (2026-10-31): eigene Sets (B-98) eventuell später hinter eine Paywall; das Limit (5 Sets je
Team) ist deshalb konfigurierbar. Offen: ob überhaupt, Modell, Abrechnung. Ebenso offen für eigene Kartenwerte (B-61).

### B-108 Promo-Mechanik ausbauen (pflegbar wie die Umfrage)
Status: neu. Idee Andreas (2026-11-01): Die Promo-Teaser (`api/get_promo.php`, `api/update_promo.php`,
`pok_promotions_tbl`, seit R1 abgeschaltet, Code und `hide_teaser` bleiben) so ausbauen, dass Hinweise ohne
Code-Änderung schaltbar sind: Inhalte (Headline, Link, Bild, CTA, Zeitraum, Sprache) in einer Tabelle, gepflegt in
`stats.php`; Auslöser konfigurierbar (heute zufällig 30–300 s nach dem Laden, nur Browsersprache `de`); Messung ohne
Personenbezug (Zähler je Promo, ohne User-/Team-ID; `update_promo.php` prüft heute nur die fortlaufende `id`).
Bleibt vorerst Idee (Andreas, 2026-11-16).

### B-111 Setgruppen erklären: Kurztext, 2-Minuten-Video, „Train your team“
Status: neu. Idee Andreas (R3-Review, 2026-11-02): Jede Setgruppe zielt auf eine Workshop-Methode (Estimation,
J.U.D.G.E., Delegation Poker, Team Assessment …), wird in der App aber nicht erklärt. Vorschlag (Delia/Fred) in Stufen:
(1) drei Zeilen Text je Set im Deck-Menü, (2) „▶ 2 min“-Video je Set (kein Autoplay, selbst gehostet bzw. erst nach
Klick laden), (3) ruhiger Link „Train your team“ (Online-Kurse fürs ganze Team, mit Preisindikation); nie während einer
Abstimmung. Offen: Produktion, Hosting, Preis in der App oder auf der Landingpage.

### B-112 Einladen am leeren Tisch: leerer Platz
Status: neu (Andreas, 2026-11-16: bleibt im Backlog). Teil 1 live R3 (2026-11-06), #163/#196: Invite-Button und Tipp
„Invite your team“. Offen: solange weniger als zwei Spieler da sind, ein leerer Platz am Tisch mit Einladen-Symbol
(Idee Delia), damit sichtbar ist, dass hier jemand fehlt.

### B-117 Badges und Feier-Animationen
Status: neu. Anlass: Live-Feedback zu R2 („fancier party animation“ bei Einigkeit). Idee Andreas (2026-11-05):
Bindungsmaßnahme – Teams erarbeiten sich Badges, mit jedem Badge eine bessere Feier (Konfetti → Feuerwerk →
Lasershow …).
- Badges hängen am **Team** (Team-ID) – belohnt, denselben Link zu nutzen (gewollt).
- Kriterien (offen): Runden, Spieler, genutzte Sets, „Strikes“ (alle dieselbe Karte); Daten liegen in der
  Rundenstatistik.
- Kein Stroboskop/Flackern (WCAG 2.3.1); bei `prefers-reduced-motion` nur eine ruhige Variante.
- Abschaltbar („Celebrations: On/Off“ in Board → Results).
- Klein anfangen (zwei, drei Stufen über Runden und Strikes); Stufen so anlegen, dass später neue oben drauf kommen
  und bestehende Teams nicht sofort alles freigeschaltet haben.
Offen: Schwellen, Sichtbarkeit der Badges, wer die Animation auslöst. Enthält die Feier-Ideen aus B-60.

### B-118 Wachstum über Produktmechanismen (statt Werbung)
Status: neu. Andreas (2026-11-06): nicht selbst groß bewerben, sondern Mechanismen, die mit der Nutzung skalieren –
teilbare Seiten, immer mit Link zurück zur SEO-Seite auf komplexitaeter.de.
- Teilnehmer werden Gastgeber: dezenter Weg vom Board zu „Eigenes Board anlegen“; messbar über neue Teams von Boards.
- Geteilte Kartensets als öffentliche Seiten („In meinem Team nutzen“), vgl. Animals-Set B-116.
- Ergebnisse zum Teilen (Session-Zusammenfassung als Bild/Link, mit dezentem Absender).
- Methoden-Seiten auf der Website; Badges (B-117) zahlen darauf ein.
Daten: Search Console ~500 Klicks/3 Monate, fast nur DE; Wachstum kommt über geteilte Links. Boards bleiben `noindex`.

### B-119 T-Shape: Wissenstiefe schätzen, Breite im Team sehen
Status: neu, lose (Andreas, 2026-11-06). Jede Person schätzt die Tiefe ihres Wissens je Thema/Skill; die Breite ergibt
sich über die Verteilung im Team. Neue Dimension: mehrere Themen nacheinander (B-52), Ergebnis als Team-Profil.
Offen: Kartenset (Tiefe-Stufen), Darstellung (Matrix/„T“), Speicherung über Runden, Methodenbeschreibung zuerst.

### B-120 Bucket-Board: Items gemeinsam in Schätz-Buckets ziehen
Status: neu, groß (Andreas, 2026-11-06). Werte eines Kartensets als Buckets (Spalten), Items (B-52) werden gemeinsam
hineingezogen – z. B. Magic Estimation; ähnlich Team as a Car. Linie „Methoden verkaufen sich, das Tool liefert den
Rahmen“. Offen: eigener Modus oder eigenes Tool; gemeinsames Ziehen in Echtzeit (reichen „pull“-Signale, Konflikte?);
Handy; Ergebnis/Export.

### B-121 Topic-Text gemeinsam bearbeiten (wie Google Docs)
Status: neu (Andreas, 2026-11-06). Ein früherer Versuch mit Yjs schied aus: Der Beispiel-Server lief, aber der Kanal
war öffentlich und die Topic-Texte (die sensibelsten Nutzerdaten) lägen bei einem fremden Dienst; Nachbau in poker-msg
scheiterte technisch.
Idee neuer Anlauf (Kai): poker-msg als dummer Relay je Team (Updates base64 durchreichen), Startzustand von PHP
(Update-Log), Verdichten im Browser (Snapshot hochladen) – alles auf unseren Servern, PHP ohne Yjs-Bibliothek. Kanal
(Andreas/Kai): eigene Route im selben poker-msg-Prozess (z. B. `/poker-msg-doc`) mit eigenen Grenzen, Abo pro Topic,
nur offen beim Bearbeiten/Lesen. Einfachere Alternative: „Alice is editing …“ mit Sperre oder „letzter gewinnt“.
Erst als kleiner Prototyp prüfen. Offen: Zusammenspiel mit B-52/B-120, Größe/Rate der Updates.

### B-122 Schätzprämisse: kurze Begründung zur eigenen Karte (optionaler Modus)
Status: neu (Andreas, 2026-11-06). Wer eine Karte legt, gibt eine kurze Begründung ein (~150 Zeichen): unter welcher
Annahme geschätzt wurde; beim Aufdecken sieht man die Prämissen (ggf. nur der Extremwerte). Variante: erst alle
Prämissen zeigen, dann darf jede Person die Schätzung anpassen, dann aufdecken. Offen: Pflicht oder freiwillig;
Anonym-Modus; Darstellung; Speicherung (sensibler Freitext wie Topic-Texte); Zusammenspiel mit B-104/B-115.

### B-123 KI-Teammitglied schätzt mit (Ausbaustufe)
Status: neu (Andreas, 2026-11-06), nach B-52/B-121. Haben Items einen erklärenden Text, könnte optional eine KI
mitschätzen (eigene Karte, ggf. mit Prämisse wie B-122). Offen: Datenschutz (nur mit ausdrücklicher Zustimmung des
Teams, Anbieter/Hosting), Kosten, wie die KI-Karte zählt (nicht in Durchschnitt/Einigkeit?).

### B-124 „:labs“-Menü für neue Funktionen
Status: neu (Andreas, 2026-11-06). Eigenes Menü „:labs“ im Header (Name entschieden; verworfen: „:beta“,
„:experimental“), in dem Teams experimentelle Funktionen selbst einschalten (z. B. B-119, B-120, B-122, B-123) und
direkt Feedback geben. Offen: Einstellung pro Team (Feature-Flags in `pok_teams_tbl`) oder pro Person; Sichtbarkeit;
wann eine Funktion Standard wird oder verschwindet.

### B-125 Mitspieler pausieren statt entfernen
Status: neu (Andreas, 2026-11-06). Löst die Roadmap-Idee „Reveal now“ (B-59; Titel bleibt öffentlich, die Stimmen
gelten der Idee). Use-Case: Jemand ist kurz weg, Bildschirm offen; die Gruppe kann nicht aufdecken, will die Person
aber nicht entfernen. Die away-Erkennung (B-110) hilft nicht (offener Tab wirkt anwesend), Inaktivität taugt nicht
(Zuhörende tippen auch nichts) → bewusst manuell durch das Team.
- Pause-Symbol neben dem Mülleimer am Platz; jeder am Tisch darf pausieren (vermutlich), auch sich selbst.
- Pausiert gilt, bis die Person selbst wieder aktiv wird (nicht nur eine Runde; neue Runde: Pause bleibt). Sie blockiert
  das Aufdecken nicht (`all_players_ready`), bleibt aber am Tisch.
- Ohne gelegte Karte: Systemkarte „Paused“ (wie „joined in“ aus B-102, nicht über `setc.php` legbar). Liegt schon eine
  Karte, bleibt sie liegen und wird überblendet.
- Aufheben nur durch die Person selbst (Karte legen); optional Overlay „You were paused“ mit „OK, I'm back“.
- Technisch: Spalte in `pok_players_tbl` (z. B. `paused`), Ben.
Offen: Zählt die überblendete Karte beim Aufdecken (Tipps, Statistik)? Anpassungen an Ready-Status, Tipps,
Rundenstatistik, Sortierung, Ergebnis, Beobachter.

### B-129 Session-Planer: Agenda mit Timeboxen je Item
Status: neu (Idee Andreas, 2026-11-10; so bei keinem anderen Tool gesehen). Baut auf B-52 (Items) und B-67 (Timer).
Problem: POs sind unglücklich, wenn es nicht vorangeht – alle hängen 40 Minuten an Item 2.
- Jedes Item bekommt eine **eigene Timebox**, bewusst unterschiedlich (z. B. 20 min „tief einsteigen“, 5 min „nur
  grob vorstellen, Fragen sammeln“), z. B. durch Größerziehen in einer Zeitleiste. Die Session hat eine Timebox; die
  Summe zeigt, ob die Agenda passt.
- **Im Meeting:** aktives Item zeigt Restzeit (Überzug amber), ruhig der Gesamtstand („6 min hinter Plan, noch 4
  Items“) – nur signalisieren, nichts erzwingen. „Parken“: festgefahrenes Item ans Ende bzw. in die nächste Session.
- **Agenda vorab** über den Team-Link einsehbar, „Copy agenda“ zum Verschicken.
- **Reifegrad am Item** statt festem Ziel je Durchgang; wächst mit jedem Gespräch, vom Team gesetzt. Stufen: neu (noch
  nicht angesehen) · gering (grobe Idee, richtige Fragen stellen) · mittel (Richtung wird klarer, kann sich noch
  ändern) · hoch (Feinschliff, eigentlich umsetzen). In der App beschreibend, z. B. *new · rough · shaping · ready*
  (nicht low/high). Darstellung gesetzt: **liegendes Dreieck** links breit → rechts spitz (Unsicherheitstrichter).
Feedback zum Mockup `mockups/planner/` (Andreas, 2026-11-10): Tabs Agenda / Later / Done schlüssig („Later“ besser
benennen); Agenda-Leiste in der Sidebar (Segmente je Item, „jetzt“, „on time · 3 items left · ends 10:00“) gefällt
sehr; einfachster Fall muss einfach bleiben; kein T± am Timer (gibt es in der App nicht mehr).
Offen: Wer darf Timeboxen ändern (vermutlich alle)? Hinweis bei Überzug (Ton, Toast)? Was genau macht „Parken“?
Liefert der Spread einen Vorschlag für den Reifegrad?

### B-132 Deck je Item, mehrere Fragen je Item
Status: neu (Idee Andreas, 2026-11-13). Weiterführung von B-52/B-129, „kontinuierliches Refinement“. Zwei
Dimensionen, getrennt umsetzbar:
1. **Set je Item** (überschaubar): Item merkt sich das Set (Deck-ID + Kartenauswahl); beim Aktivwerden bzw. „Next
   item“ stellt das Board mit der neuen Runde auf dieses Set um, ohne Angabe gilt das Team-Deck. Dafür Kartenauswahl
   je Deck speichern statt nur fürs aktuelle Deck. Historie/Export zeigen das Set je Item.
2. **Anschließende Metafrage** (z. B. Reifegrad, Unsicherheit als eigenes Deck im Katalog): zweite Abstimmung je Item
   nach dem Schätzen; der PO kann einen Reifegrad vorab eintragen, danach stimmen alle ab; Ergebnis je Durchgang in der
   Historie. Offen: Ablauf (wer schaltet weiter, was zeigt das Board dazwischen).
Bis dahin ist die Reifegrad-Eingabe im Item-Formular ausgeblendet (2026-11-13); vorhandene Werte werden angezeigt.
Offen: Reihenfolge der beiden; Darstellung in Historie und Export.

### B-139 Reaktionen mit sichtbarem Tageskontingent
Status: live (Rollout 5, 2026-11-16). Vorher: refined (Andreas, 2026-11-16). Feedback (OTHER, 2026-11-16): „Colleagues keep throwing fish. Can we get a
setting to disable throwing of emojis please?“ Auswertung poker-msg-Log: ein Team mit Fisch-Wellen bis 121 Würfe/min
(mehrere Personen, je unter dem Limit 10/min); sonst 187 Teams unauffällig. Verteilung (559 Reaktionen mit Namen):
Nudge 43 %, Fisch 47 % (ohne das eine Team 62 % / 24 %), Think, Party, Thumbs, Cake, Clap, Heart zusammen < 10 %.
Entscheidung (Andreas): kein Abschalter, keine versteckte Grenze, sondern ein **sichtbares Kontingent**: jede Person
kann **jedes Wurf-Emoji 1× pro Tag** werfen – „man muss sich überlegen, wo man es hinwirft“.
- Unter jedem Emoji der Leiste steht der Rest, z. B. `1×` / `0×`; bei `0×` ausgegraut (Tooltip/aria: „back tomorrow“).
- **Nudge ist ausgenommen** (Funktion, kein Wurf; Limits wie bisher).
- Durchsetzung: Board merkt sich die Würfe je User-ID und Tag (localStorage) für die Anzeige; poker-msg zählt je
  Werfer-mkey, Emoji und Tag im Speicher (keine DB; nach Neustart beginnt die Zählung neu) und verwirft Würfe über dem
  Kontingent. Die bisherigen Limits (3/s, 10/min) bleiben.
Offen: Tagesgrenze für Board und poker-msg gleich festlegen (Vorschlag: 00:00 UTC, damit beide übereinstimmen).

### B-144 Tier-Schätzung als Methode (Beispielset „Animals“, Methodenseite, eigener Einstieg)
Status: refined (Andreas, 2026-11-17/18). Anlass: Retro eines Scrum-Teams nach dem Kanban-Workshop – Story Points als
„Komplexität“ korrelieren schwach mit der Dauer; Schätzen ist das Instrument für den Austausch, geplant wird eher über
die Anzahl von Items, die „klein genug“ sind. Die Tiere sagen, was als Nächstes zu tun ist:
- 🐜 Ant – Wert 0 – „Just do it – we don't count it.“
- 🐁 Mouse – 0,5 – „Small – half of our usual size.“
- 🐕 Dog – 1 – „Our standard size – this is what we aim for.“
- 🐎 Horse – 3 – „Too big really, but we keep it – no clear way to cut it yet.“ (3 statt 2: große Items dauern
  überproportional länger)
- 🐘 Elephant – 999.998 – „Too big for a sprint – we have an idea how to split it.“
- 🐋 Whale – 999.999 – „Far too big – we need a spike or mockup first to find a smaller start.“
Elefant und Wal haben bewusst sehr große Werte (Andreas, 2026-11-18): praktisch unendlich, jede Summe oder jeder
Durchschnitt mit ihnen wird unbrauchbar („passt nicht in einen Sprint“). Die Einigung nimmt den Höchstwert als
Vorschlag, das Ergebnis „Elefant“ landet am Item und signalisiert „schneiden“. In der App erscheinen nur die Karten
(Spannweite, Ergebnis, Export), der Durchschnittszeiger springt wie bei ∞ nach rechts.
Umfang:
1. Beispielset (B-116, `EXAMPLE_SET_CARDS` in `api/lib_custom.php`) mit den Werten und Beschreibungen oben; bleibt ein
   eigenes Set (Team kann es anpassen/löschen), kein Katalog-Set.
2. Das Beispielset wird intern markiert; im Deck-Menü bei diesem Set ein ruhiger Link „How it works →“ zur
   Methodenseite (Platzhalter-URL, bis die Seite steht).
3. Direkter Einstieg wie die anderen Tool-Seiten: `index.php?tool=…&team=…&text=…&preset=Animals` (neues Mapping) legt
   das Team an, gibt ihm das Beispielset sofort (statt erst beim ersten dao.php) und aktiviert es als Deck.
4. Vorab analysieren: wie viele Teams das Beispielset noch unverändert haben bzw. nutzen; danach entscheiden, ob es bei
   bestehenden, unveränderten Sets nachgezogen wird (geänderte Sets nie anfassen).
Andreas: Methodenseite und Tool-Seite („Tool starten“ mit `preset=Animals`) auf komplexitaeter.de (WordPress, nicht
in diesem Repo); wir liefern die genaue URL.

### B-145 Fisch-Schild: 1× pro Tag einen Fisch abwehren
Status: refined (Andreas, 2026-11-24). Ergebnis des Prototyps `mockups/fish-tokens/` (Token, Verteilen und Codes
waren zu kompliziert; das Schild mit Abprall-Animation „brauchen wir auf jeden Fall live“).
- Auf der **eigenen Karte** steht statt des Smileys ein **Schild-Symbol**. Ein Klick aktiviert das Schild (`1×` pro Tag,
  gleiche Tagesgrenze wie B-139). Kein Schalter im Profil, kein Aufladen.
- Das aktive Schild hält **genau einen Fisch** ab, danach ist es verbraucht (spätestens zum Tageswechsel). Andere Emojis
  gehen durch.
- Für die anderen ist das aktive Schild **unsichtbar**; erst beim Treffer: Kraftfeld, Fisch prallt ab und landet auf
  der Karte des Werfers (Animation aus dem Prototyp, mit reduzierter Variante bei `prefers-reduced-motion`).
- Technik (Vorschlag Kai): wie das Tageskontingent in poker-msg im Speicher (aktive Schilde je mkey und Team);
  bei einem Fisch auf eine geschützte Karte verteilt poker-msg die Variante „blocked“ an alle. Keine DB; nach einem
  Neustart von poker-msg sind aktive Schilde weg (vertretbar).
Offen fürs Planning: Nachrichtenformat (Aktivieren, `blocked`-Echo), Anzeige für den Schild-Besitzer (aktiv / verbraucht),
Verhalten alter Clients.

### B-146 Supporter-Abo: mehr Reaktionen pro Tag
Status: Idee (Andreas, 2026-11-24). Statt Token/Codes (Prototyp zu kompliziert) eine bezahlte Mitgliedschaft mit einem
einfachen Zustand „Supporter ja/nein“: Supporter bekommen mehr Reaktionen pro Tag (z. B. 10× oder 20× statt 1×, evtl.
nach Höhe des Abos). Kandidat: Steady (deutscher Anbieter, kauft Lizenz und verkauft weiter, Steuerabrechnung je
Auszahlung; OAuth-API für den Mitgliedsstatus, Supporter braucht ein Steady-Konto, wir keine E-Mail-Adressen).
Alternativen: Paddle (Reverse Invoice, monatliche Auszahlung), Stripe Managed Payments. Lemon Squeezy scheidet aus
(keine Neuanmeldungen, Abschaltung 31.03.2027).
Steady (gelesen 2026-11-24): 10 % Provision auf brutto plus Zahlungsgebühren (PayPal 0,35 € + 2,49 %, Lastschrift
0,20 € + 1 %), keine Grundgebühr; Auszahlung monatlich per PayPal mit Gutschrift (für deutsche Publisher mit USt ab
11/2026 als E-Rechnung). Bei 3 €/Monat bleiben etwa 1,80–2,00 € netto. OAuth (Authorization Code, nur serverseitig mit
Client Secret), `GET /api/v1/subscriptions/me` liefert Status, Betrag, Ablauf; Token 7 Tage, Refresh 1 Jahr; Steady
schickt Name und E-Mail mit (nicht speichern). **Haken:** Steady richtet sich an Creator, die regelmäßig eigene Inhalte
veröffentlichen (Blog, Newsletter, Podcast) und kauft eine Lizenz an diesen Inhalten – ein Software-Tool passt nicht.
Vorschlag: komplexitaeter-Supporter-Programm mit Blog/Newsletter als Kern, Poker-Reaktionen als Bonus; vorher bei
Steady anfragen. Sagen sie nein: Paddle (auf Software ausgerichtet, Abos, monatliche Gutschrift).
Offen: Antwort von Steady, Abo-Stufen, wie der Status im Board
ankommt (Login per OAuth, Prüfung serverseitig statt in poker-msg), Datenschutzerklärung. Technisches Vorwissen aus dem
Token-Konzept: `mockups/fish-tokens/concept.html` (Reaktionen über die API statt WebSocket, Sinas Review).

## Offen: Technik & Betrieb

### B-152 UID-Härtung (Vorbereitung für B-150/B-151)
Status: refined (Andreas, 2026-11-26), Umfang für den nächsten Rollout; für die Nutzer unsichtbar. Enthält den Kern
von B-91. Die UID (User-ID im Browser, `localStorage.SID`) wird das eigentliche Geheimnis der Person.
1. **UID vom Server**, wenn der Browser noch keine hat: 16 Zeichen, kryptografisch zufällig (`random_bytes()`, passt in
   `varchar(16)`). Heute erzeugt der Browser sie aus Zeitstempel + `Math.random()` (`script.js`, ca. 40 Bit Zufall).
   Bestehende UIDs bleiben gültig.
2. **UID nie mehr in der URL** (Access-Logs): schreibende Aufrufe im POST-Body, lesende GET-Aufrufe (z. B. `dao.php`,
   `get_user.php`) per Header (z. B. `X-Poker-User`) – lesend bleibt GET, näher an REST (Andreas).
3. **UID in allen Endpunkten mitgeben und prüfen**, dass sie im Team registriert ist. Registriert heißt: Zeile in
   `pok_players_tbl` für das Team, egal ob Player, Observer oder `REMOVED` (entfernt = nur vom Board genommen, bleibt
   registriert, Schwebezustand zwischen Observer und Player; Andreas). Was eine Rolle darf, bleibt wie im Board.
   Ausnahmen festlegen: Board öffnen und beitreten ohne Registrierung (`dao.php` für Neue, `name.php`), Team anlegen,
   Einstellungen über alle Teams (`get_user`/`update_user`, an der UID statt am Team), eigenes Löschen (`delete_user`).
Planning (Inventar Ben, Entscheidungen Andreas, 2026-11-26):
- Heute prüft fast kein Endpunkt die Mitgliedschaft (`newround`, `timer`, `topic_item_*` nur Team-ID; `update_deck`
  speichert eine beliebige ID als „changed by“; `setc` lässt auch Observer eine Karte legen).
- **Transport:** UID für **alle** Aufrufe im Header `X-Poker-User` (eine zentrale Funktion `apiFetch`, nur für relative
  `./api/`-URLs); nirgends mehr `id=`/`player_id=` in URLs. Gewinn: UID raus aus URLs und Logs – **kein** CSRF-Schutz
  (die UID steckt in keinem Cookie, CSRF gibt es hier nicht; nicht darauf verlassen, falls je Cookies kommen).
- **Regeln:** Team-Endpunkte verlangen eine registrierte UID (Player, Observer oder `REMOVED`); **nur Karten legen**
  (`setc`) ist für Observer und `REMOVED` gesperrt, sonst gilt „registriert = darf“. Ohne Registrierung: `dao.php`,
  `seen.php` (Anwesenheit nur für Mitglieder), `get_topics.php`, `name.php` (Beitreten), Team anlegen (`addteam.php`
  und weiterhin per GET-Link `index.php?tool=…` für die Tool-Seiten), `get_user`/`update_user` (teamübergreifend),
  `delete_user` (eigenes Löschen), `get_roadmap` (teamübergreifend, eigene Votes), `measure_event` (gültige UID
  verlangen, sonst nichts speichern; bis B-153 entschieden ist). Feedback: Mitglied in irgendeinem Team (wie
  `vote_roadmap`). `REMOVED` darf auch andere entfernen (`delete.php`, Andreas: nur Karten legen entfällt) – damit
  überholt B-152 die B-91-Formulierung „nicht entferntes Mitglied“. Bewusste Folge von „Team-Link = Zugang“: wer den
  Link hat, kann beitreten und sich auf `REMOVED` setzen und ist dann unsichtbar, darf aber alles außer Karten legen.
- **Entfernen:** Promo-Endpunkte (`get_promo`, `update_promo`, toter Code, `update_promo` ohne jede Prüfung) samt JS;
  `update_cardset.php` (altes Deck-Menü, ohne Aufrufer).
- Reaktionen (Absender in poker-msg frei wählbar): erst mit B-151, wenn Reaktionen über die API laufen.
- **Schritte:** BE-1 Server nimmt UID aus Header, Body oder URL an, neuer Endpunkt `api/uid.php` (16 Zeichen, 80 Bit,
  schreibt nichts in die DB), noch ohne Prüfung → FE-1 Frontend: `ensureUid()`/`getUid()`, `apiFetch` mit Header,
  E2E-Helfer und ca. 22 Specs anpassen (BE-1 + FE-1 in einen Rollout) → BE-2 etwa eine Woche später: Mitgliedschaft
  prüfen, keine UID mehr aus der URL (vorher im Access-Log prüfen, dass keine alten `id=`-Aufrufe mehr kommen).
- Neue Tests: `uid.php`; erster Besuch ohne SID ohne `id=` in URLs; Tabellentest „jeder Team-Endpunkt ohne/mit fremder
  UID → 403, mit `REMOVED` nicht (außer Karte)“; zwei Tabs beim ersten Besuch → dieselbe SID; eine Spec über die
  Kernabläufe: kein Request mit `id=`, `player_id=` oder der SID in der URL; ab BE-2: UID nur in Body/URL → 403.
- Ergänzungen aus Sinas Review (2026-11-26):
  - zentral in `api/lib.php`: `get_uid()` (Header, `[A-Za-z0-9_-]{10,16}`, sonst `''`) und `require_member($link, $t,
    $uid)` direkt nach `require_team()`, 403 vor jedem Schreiben und vor `notify_team()`; Header gewinnt vor Body/URL.
  - BE-2 akzeptiert die UID **nur** aus dem Header (nicht aus dem Body).
  - `uid.php`: POST, `Cache-Control: no-store, private`, Base32 aus `random_bytes(10)` (16 Zeichen, 80 Bit). Kein
    Rückfall auf `Math.random`, wenn `uid.php` fehlschlägt; zwei Tabs: nach der Antwort `localStorage` erneut lesen,
    eine vorhandene SID gewinnt. Nach „Delete user“ eine neue UID holen (heute `sid = '-1'`).
  - `name.php` legt keinen neuen Nutzer mit leerem Namen an (400); tote `id=` bei `update_show_avg` entfernen.
  - Nach BE-2: Anfragen mit `id=` in der URL eine Zeit lang zählen (alte offene Tabs → Reload nötig); Betreiber löscht
    danach rotierte Access-Logs mit `id=` und prüft nginx-`log_format` bzw. FPM-`access.format` auf Header/Body.
  - CLAUDE.md-Regeln: UID nur per Header über `apiFetch`, nie in URLs/Logs; Team-Endpunkte `require_team()` +
    `require_member()`; Antworten enthalten nur die eigene UID, andere Personen nur über den `mkey` (aus B-91).

### B-154 Entfernte Spieler als Observer anzeigen
Status: refined (Andreas, 2026-11-26), kann mit B-152 in denselben Rollout. Ein entfernter Spieler (`REMOVED`) ist im
Grunde von Player auf Observer gesetzt: Für alle anderen steht er in der Observer-Liste, solange sein Board verbunden
ist (gleiche Regel wie für Observer, B-110), ohne eigene Kennzeichnung. Einziger Unterschied: Er selbst sieht wie
heute den Hinweis, dass ihn jemand entfernt hat, mit der Wahl, wieder Player zu werden oder als Observer
weiterzumachen. Technik: `getDao()` nimmt verbundene `REMOVED`-Zeilen in die Observer-Liste (`mkey`, Name, nie die
UID). Damit ist niemand mehr unsichtbar am Tisch (Folge von „Team-Link = Zugang“ aus B-152).

### B-153 Measure-Events: entfernen oder verschlanken
Status: neu (Andreas überlegt, 2026-11-26). `api/measure_event.php` schreibt 15 Ereignisse (Seitenaufrufe
`BOARD_ON_LOAD`/`INIT_ON_LOAD`, Menüaufrufe, Farbwechsel, Timer/Tipps/Kartenänderungen an/aus, Topic-Item-Aktionen) in
`pok_analytics_events_tbl` (wächst unbegrenzt, Live 179 MB, 1,5 Mio. Zeilen). Gelesen nur vom Nutzungs-Tab in
`stats.php` (Funktionsnutzung, Mobilanteil). Seitenaufrufe misst plausible ohnehin; `BOARD_ON_LOAD` enthält das
Rauschen von Reload-Schleifen; Auswertungen der letzten Wochen liefen über die Fachtabellen.
- Variante A – entfernen: Endpunkt, JS-Aufrufe (`measureEvent()`), Bereich in `stats.php`; Tabelle nach Export droppen.
- Variante B – verschlanken: nur Funktions-Events, keine Seitenaufrufe; Löschjob für Einträge älter als 90 Tage.
Offen: A oder B; was aus dem Nutzungs-Tab wirklich gebraucht wird.

### B-150 REST-API: Topic und Items von außen setzen (Schritt A)
Konzept: `docs/api-v1-concept.md` (Ben, Review Sina, von Andreas abgenommen 2026-11-26).
Status: neu, Richtung entschieden (Andreas, 2026-11-26). Ersetzt B-80. Bedarf an den Extremen: einfach „Topic setzen“
(Feedback 2026-10-29) und die komplette KI-Integration (B-151); die Mitte (Webhooks, Zapier-Bots, Event-Stream für
eigene Skripte) erstmal nicht.
- Eigener, versionierter Namensraum `/api/v1/…` mit JSON (die interne App-API bleibt frei änderbar), kurze Doku-Seite
  mit `curl`- und Jira-Automation-Beispiel, möglichst OpenAPI-Beschreibung.
- Endpunkte: Team-Notiz (Topic) setzen; Items anlegen/ändern über ihren Schlüssel (Upsert), auflisten, Ergebnis
  abfragen, löschen.
- **Item-Schlüssel als Pflichtfeld** (Andreas): vorbelegt mit `[CODE]-(n+1)`, zusammen mit dem Team eindeutig
  (heute `ext_id`, optional; 10 von 19 Items hatten schon eine). Damit ist ein Import beliebig oft wiederholbar.
- **API-Schlüssel je Person und Team** (Andreas, 2026-11-26): Pendant zur UID, die der Browser hält. Alles ist
  team-öffentlich, aber nutzer-authentifiziert; der Schlüssel steht für genau eine Person in genau einem Team, die
  Team-ID muss nicht mitgegeben werden. Im Header, gespeichert nur als Hash, mehrere je Person (z. B. Jira, KI),
  einzeln sperren und neu erzeugen; Verwaltung im You-Menü. Die API darf die Team-ID bzw. den Team-Link ausliefern
  (wer den Schlüssel hat, kannte die Team-ID schon).
- **Ohne Schlüssel** geht nur: Team anlegen und einem Team (per Team-ID) neu beitreten – jeweils mit Name und Rolle
  (Player/Observer). Der Server erzeugt dafür im Hintergrund eine UID und gibt den API-Schlüssel dieser neuen Person
  zurück (die UID braucht der Aufrufer nicht).
- **Voraussetzung B-152** (UID vom Server, nie in der URL, in allen internen Endpunkten geprüft).
- Nach jeder Änderung `notify_team()` wie bei der App (Boards aktualisieren sich sofort).
- Die Logik hinter den Endpunkten so schneiden, dass B-151 sie mitnutzt (REST und MCP rufen dieselben Funktionen).
Refinement (Andreas, 2026-11-26):
- **Erster Schnitt:** Team anlegen, beitreten (liefert den Schlüssel), Topic/Notiz setzen, Items anlegen/ändern über
  ihren Schlüssel (Upsert), auflisten, löschen, Ergebnis abfragen.
- **Schlüssel im You-Menü:** erzeugen (mit Namen, z. B. „Jira“; der Schlüssel wird nur einmal beim Erzeugen angezeigt),
  auflisten und löschen.
- **Ergebnis eines Items:** wie im Export (Wert, Verteilung, Runden).
- **Item-Schlüssel ist Pflicht**, auch im Board, mit lockerer Heuristik als Vorschlag: erstes Item „1“, danach
  hochzählen; folgt der letzte Schlüssel einem Muster wie `TIX-004`, wird `TIX-005` vorgeschlagen (Präfix und
  Nullen behalten). Ziel: niemand stolpert darüber, wenn es keine echte (z. B. Jira-)ID gibt.
- **Doku:** eine Seite `/api/v1/` (was geht, Schlüssel erzeugen, `curl`-Beispiel je Endpunkt, Rezept Jira
  Automation) plus eine von Hand gepflegte `openapi.json` (Power Automate, Zapier, Postman, KI); ein E2E-Test führt
  die Doku-Beispiele aus.
Bestehende Items ohne Schlüssel bekommen einmalig einen nach derselben Heuristik (Andreas; wenige Items).
Offen: Fehlercodes; wie Doku/Spec aus dem Code entstehen (kein Auseinanderlaufen).
Umsetzung PR 2 (Ben, 2026-11-26, Branch `feature/B-150-pr2-keys`): Tabelle `pok_api_keys_tbl` (Block „B-150 keys“ in
`db_schema_pok_inc.sql`, vor dem Deploy), `api/lib_api_keys.php`, `api/lib_core_keys.php`, Bearer-Auth im Router,
`team_create`, `team_join`, `team_note_set` (auch hinter `update_topic.php`), `key_create` (nur Board), `key_list`,
`key_delete`, `key_delete_current`; `delete_user.php` löscht Schlüssel über alle Teams. Jeder Aufruf mit Schlüssel
zählt als Anwesenheit (`touch_player()`, Konzept 5.4), damit fallen API-Personen nicht unter die 2-Monats-Aufräumregel.
Umsetzung PR 5 Teil 1 (Fred, 2026-11-26, Branch `feature/B-150-pr5-keys-ui`): You-Menü „API keys“ (`board.html`
`#api_keys`, `script/api_keys.js`, kleiner CSS-Block „B-150: API keys“ hinter `.leave-item`): eigene Schlüssel des Teams
mit Name, `••••` + Hint, erstellt, zuletzt benutzt; „Create key“ mit Namen; Löschen mit Rückfrage in der Zeile; Texte
aus Konzept 5.5. Der neue Schlüssel steht nur im Dialog `#api_key_new` (Copy, beim Schließen geleert), nie in
`localStorage`/Analytics. `apiFetch()` schickt für `./api/v1/` zusätzlich `X-Poker-Team`. E2E: `api-keys-ui.spec.ts`.
Umsetzung PR 3, Backend (Ben, 2026-11-26, Branch `feature/B-150-pr3-item-keys`): Item-Schlüssel Pflicht
(`ITEM_KEY_PATTERN`, eindeutig je Team per SQL in der Kollation), Heuristik `next_item_key()`/`item_key_suggest()` in
`api/lib_topics.php` mit Testtabelle `tests/e2e/fixtures/item-keys.json` (statt `tests/fixtures/item_keys.json`),
Vorschlag als `next_key` in `get_topics.php`; Kernfunktionen `core_item_create/patch/delete` in
`api/lib_core_items.php`, `topic_item_add/edit/delete.php` als Wrapper (fehlender Schlüssel beim Anlegen → Vorschlag,
damit alte Boards weiterlaufen; neue Fehler 400 `ext_id`, 409 `key_taken`); Auffüllskript
`tools/migration/b150_item_keys.php` (README dort), DDL-Block „B-150 item keys“ (nach dem Skript). Abweichungen vom
Konzept: ungültige Schlüssel verlieren `-`/`_` an beiden Enden (nicht nur vorn); beim Bearbeiten bleibt ein
unverändert gesendeter Schlüssel ungeprüft und ein leerer wird nur bei einem Item ohne Schlüssel durch den Vorschlag
ersetzt (alte Items bleiben bis zur Migration bearbeitbar).
Umsetzung PR 3, Board (Fred, 2026-11-26, gleicher Branch): Feld „Key“ (statt „ID (optional)“) Pflicht, vorbelegt mit
`next_key` (ohne Items `1`; fehlt eine aktuelle Liste, lädt sie nach und füllt das Feld, solange es unberührt ist –
auch wenn jemand anders inzwischen anlegt); Prüfung im Browser nach `ITEM_KEY_PATTERN`, 400 `ext_id` und
409 `key_taken` („Key already used“) am Feld, Formular bleibt offen. Kein JS-`nextItemKey()` (Abweichung vom Konzept 7.3:
der Vorschlag kommt nur vom Server). Export-Spalte „ID“ heißt jetzt „Key“. E2E in `topic-items-ui.spec.ts`.

### B-151 MCP: die komplette App für KI-Clients (Schritt B)
Status: umgesetzt auf `release` (2026-11-26/27, PRs A–G: #293, #295–#299, poker-msg#14, #15), Konzept
`docs/mcp-concept.md` (gilt vor dem Text unten: kein Schlüssel nötig, Invite-Link = Zugang, Warten über poker-msg per
`X-Accel-Redirect`). Live erst nach Rollout von poker-msg und den nginx-Blöcken. Nacharbeiten: B-159. Bisher: neu, Richtung entschieden (Andreas, 2026-11-26). Nach B-150. Eine KI bzw. ein „freier Agent“ kann vollständig
mitmachen: Team anlegen/ändern, Board-Setup, Sets wählen und eigene Sets verwalten, Karten legen, Runden- und
Item-Steuerung, Items samt Ergebnissen, Timer, Feedback, Reaktionen.
Grundsätze (Andreas):
- **Genau die Funktionen der Weboberfläche, nicht mehr und nicht weniger.** Alles, was die Oberfläche verhindert, muss
  der Server verhindern (verdeckte Karten vor dem Aufdecken: `getDao()` schickt schon nur Platzhalter; Fisch-
  Kontingent: heute in poker-msg, MCP-Würfe müssen durch dieselbe Prüfung). Sina prüft je Tool: Server oder nur UI?
- **Keine Kennzeichnung** von Agenten (nicht unterscheidbar, Automatisierung über das Web geht heute schon).
- **Keine Aufruf-Limits auf Verdacht** (Anwendungsfälle unbekannt); nur technischer Schutz (z. B. Obergrenze
  gleichzeitig wartender Aufrufe).
Technik (Vorschlag Kai): dünne MCP-Schicht über den Funktionen aus B-150, ca. 10–12 gröbere Tools statt einem pro
Aktion; Zugang mit dem API-Schlüssel aus B-150. **Am Tisch anmelden** ist Teil der Sitzungsinitialisierung (Andreas):
entweder mit einem vorhandenen Schlüssel als jemand, der schon da ist (dann wählen: Player oder Observer), oder neu
mit Team-ID, Name und Rolle – dann erzeugt der Server UID und Schlüssel (wie Beitreten in B-150). Benachrichtigung **ohne Polling**: `wait_for_change`, das
sofort zurückkehrt, sobald poker-msg eine Änderung des Teams meldet (spätestens nach ca. 25 s „nichts passiert“);
dafür ein Event-Kanal in poker-msg mit kurzlebigem, per HMAC signiertem Abo-Ticket (poker-msg bleibt ohne DB, kein
PHP-Worker pro Wartendem). Server-Benachrichtigungen von MCP zusätzlich für Clients, die sie können. Antworten zuerst
als Text/Emoji (Tisch, Karten, Status); eine grafische Ansicht über MCP-UI-Erweiterungen später.
Datenschutz: Namen und Texte der Mitspieler gehen an die KI eines Dritten → Hinweis in der Datenschutzerklärung;
Texte anderer Spieler sind für den Agenten fremder Input (Prompt-Injection), Hinweis in den Tool-Beschreibungen.
**Anwesenheit** (Andreas, 2026-11-26): `wait_for_change` ist das Lebenszeichen. Solange ein Agent dort eine Verbindung
offen hat, ist er „da“ (wie ein offener Tab); kein eigener Heartbeat-Kanal. Der Aufruf kehrt nach spätestens ca. 25 s
zurück und wird sofort neu gestellt, das liegt sicher unter der Away-Frist (`AWAY_AFTER_SEC` = 70 s). Technisch:
`last_callback_time` beim Start und bei jeder Rückkehr setzen. Ruft der Agent nichts mehr auf, wird er nach derselben
Frist wie im Web „away“; keine Sonderfrist. Dazu ein Tool zum sauberen Gehen (wie ein geschlossener Tab).
Schritte: Mitspielen (inkl. Event-Kanal) → Items und Runden → Rest. Verwandt: B-123 (eine von uns betriebene KI).

### B-30 Server auf Ubuntu 24.04 heben (vor April 2027)
Status: refined. Reguläre Unterstützung für 22.04 endet im April 2027. Beide Server auf 24.04, zuerst Staging (vorher
Snapshot beim Hoster), Live danach an einem Wochenende. Zu beachten: ondrej-PHP-PPA wird beim Upgrade abgeschaltet und
muss für `noble` neu eingerichtet werden (sonst fehlt PHP 8.4); `ev` für `poker-msg` neu bauen; nginx wird 1.24; die
weiteren Seiten auf beiden Servern mittesten (nach Umstellung einen PHP-Endpunkt testen, nicht nur `/`).
Offen: Zeitpunkt; ob das PPA langfristig bleibt oder auf `packages.sury.org` umzieht.

### B-128 R3-Deck-Backup prüfen und löschen (Mitte Dezember)
Danach die Deck-Migration aus `getDao()` entfernen (B-157).
Status: refined, Termin Mitte Dezember 2026 (Andreas, 2026-11-09). Die R3-Deck-Migration übernimmt das Deck eines
Teams erst beim nächsten Laden (Stand 2026-11-09: 192 ok, 0 mismatch, 21 danach selbst geändert, rund 24.400 noch
nicht wieder geladen). Dann `php8.4 tools/migration/check_deck_migration.php --verify` auf Live wiederholen; bei
0 mismatch `pok_teams_deck_backup_r3` löschen (`drop table`, Befehl bereitet Kai vor, Betreiber führt aus). Danach
entscheiden, ob `tools/migration/` aus dem Repo kann (siehe B-126).

### B-136 Umfrage entfernen
Status: live (Rollout 5, 2026-11-16). Vorher: im Sprint 9, Schritt 1 (Andreas, 2026-11-16). Vorher: refined (Andreas, 2026-11-16). Die In-App-Umfrage ist praktisch tot (Fund Fred, 2026-10-30: `get_survey.php`
bindet die User-ID mit `bind_param('i', …)`, `get_survey_id()` vergibt nie eine Umfrage) und wird ausgebaut.
Umfang: Frontend-Code der Umfrage (u. a. `toggleSurvey()`, Survey-Box, `fillResultsBars()`, CSS),
`api/get_survey.php` und zugehörige Endpunkte sowie Umfrage-Abfragen in `getDao()`/`api/lib.php` entfernen. Tabellen
`pok_survey*_tbl` vorerst behalten. Erledigt damit auch `survey_intro` per `innerHTML` (B-43). Ersetzt B-90.

### B-10 `poker-msg` modernisieren und absichern
Status: neu; Teile erledigt (Event-Loop B-19, Heartbeat B-24, Drosselung der Reaktionen B-131). Rest offen:
- Prozess läuft unter supervisor als `root` → eigener User.
- Ratchet 0.4 wird kaum gepflegt → Abhängigkeiten aktualisieren oder Alternative prüfen.
- Keine Begrenzung von Verbindungen bzw. Nachrichtengröße.
- Browser-`push` entfernen → B-93.

### B-12 Zeichensätze auf `utf8mb4` vereinheitlichen
Status: Schema live (2026-11-26, Staging und Live von Hand, Block „B-12“ in `db_schema_pok_inc.sql`, #276). Alle
Textspalten und Tabellen-Defaults sind `utf8mb4_0900_ai_ci`, außer bewusst `ascii_bin` (Kartenschlüssel, Deck, Status).
Live: 14 Tabellen, längste Dauer Rundendetails 26 s, Analytics 18 s, Rest unter 10 s; vorher Backup. Code (`db_init()`
ohne `$charset`) geht mit dem nächsten Rollout live. Neue Tabellen: `team_id` usw. als `utf8mb4_0900_ai_ci`.
Mögliche Folgethemen: Survey-Tabellen und `pok_teams_deck_backup_r3` droppen; B-57-Block idempotent machen.

### B-14 `script/script.js` in Module aufteilen
Status: erster Schnitt live R7 (2026-11-25): `reactions.js`, `timer.js`, `connection.js` als klassische `defer`-Skripte
(reiner Umzug, `script.js` 4.398 → 3.349 Zeilen). Weitere Schnitte bei Bedarf; echte ES-Module erst, wenn die
`onclick`-Handler im HTML abgelöst sind (sonst jede Funktion wieder an `window`). Ohne Build-Schritt. Delta-Rendering statt komplettem Neu-Rendern nach jedem `pull` wäre ein Folgeschritt (aus B-38).

### B-34 Synchrone XMLHttpRequest auf async umstellen
Status: live (Rollout 6, 2026-11-18). Vorher: im Sprint 9, Schritt 3 (Branch `feature/B-34-async-start`, Review offen). Vorher: neu, niedrige Priorität. Die Feedback-Aufrufe sind umgestellt; offen ist das synchrone `loadJSON()`
(`loadTextFileAjaxSync()`) für `cards.json`, `card_catalog.json` und den Farbmodus. Der Aufrufer erwartet einen
synchronen Rückgabewert → async/await oder Config anders laden. Nur Konsolen-Warnung, blockiert kurz den Main-Thread.
Vorgabe Andreas (2026-11-17): flüssig, nie ein unvollständiger Stand; Spinner nur, wenn das Laden länger dauert.
Umsetzung: `cards.json`, `card_catalog.json` und `src/cards.svg` laden parallel, sobald `script.js` läuft; das Board
erscheint erst, wenn der erste Stand vollständig gerendert ist (inkl. Karten), auf einen Schlag. Auf die
Kartensymbole (`src/cards.svg`) wartet es nicht, sie blenden ggf. einen Moment später ein; `warmSprite()` startet nur
ihren Download früh (Andreas, 2026-11-17: Sprite-Warten entfällt, wie bisher live). Spinner per Inline-CSS
erst nach 0,8 s, nach 12 s Hinweis mit „Reload“; vor dem Aufbau wiederholt `dao.php` ohne Grenze (bis alle 5 s,
Timeout je Versuch 8 s, 16 s, dann 30 s). Config-Dateien: nur 4xx (außer 408/429) und kaputtes JSON gelten als
endgültig, 5xx/408/429 werden wie Netzfehler wiederholt. Startseite erscheint nach `get_user.php` (höchstens 3 s,
sonst Systemmodus). Mit umgesetzt (B-140, Andreas 2026-11-17: plausible ist für uns nicht kritisch): Start bei
`DOMContentLoaded` statt `window.load`, plausible `async`. Test: `tests/e2e/specs/startup.spec.ts`.

### B-140 Board-Start früher: `DOMContentLoaded` statt `load`, plausible async
Status: live (Rollout 6, 2026-11-18). Vorher: mit B-34 umgesetzt (Andreas, 2026-11-17). Vorschlag Fred, 2026-11-17, aus B-34: `loadBoard()` startete erst bei `window.load`, also nach Bildern,
allen Defer-Skripten und dem externen plausible.io; `dao.php` könnte bei `DOMContentLoaded` starten, plausible `async`.
Bringt auf langsamen Netzen spürbar Zeit, ändert aber die Startreihenfolge (Tests prüfen).

### B-141 Farbmodus lokal merken gegen dunklen Hintergrund vor dem Laden
Status: live (Rollout 6, 2026-11-18). Vorher: umgesetzt, im Sprint 9 (Fred, 2026-11-17; Vorschlag Fred aus B-34, beauftragt Andreas 2026-11-17). Bis `setColor()`
läuft, zeigt die Seite den dunklen Canvas; bei hellem Farbmodus fällt das auf langsamen Netzen (mit Spinner) auf.
Umsetzung: Farbmodus zusätzlich in `localStorage` (`COLOR_MODE`), ein Inline-Skript im `head` von `board.html`/`init.html`
setzt vor dem ersten Frame `html.pk-light` (Hintergrund per Inline-Style, ohne lokalen Wert nach `prefers-color-scheme`).
Umschalten und ein abweichender Server-Wert (`dao.php` beim Laden, `get_user.php`) aktualisieren den lokalen Wert; der
Server bleibt Quelle. Startseite mit lokalem Wert sofort sichtbar, ohne lokalen Wert wie bisher (max. 3 s).
Mitgenommen: Notiz im Menü nach „Save“ sofort aktuell und zieht bei offenem Menü nach, solange nichts getippt ist
(Fund Tessa); SID in `switchColorMode()` mit `encodeURIComponent()` (Fund Ben).

### B-142 nginx: `Cache-Control: immutable` für Dateien mit `?v=`
Status: neu (Vorschlag Fred, 2026-11-17, aus B-34). Versionierte Assets (`?v=`) könnten lange und `immutable` gecacht
werden; spart Revalidierungen beim Start. Befehle für Andreas, beide Server.

### B-143 Rückmeldung bei laufenden Aktionen (Buttons)
Status: neu (Andreas, 2026-11-17, beim 3G-Test von B-34). Auf langsamem Netz zeigen Buttons wie „Team anlegen“ oder
„Name speichern“ nicht, dass gerade etwas passiert. Idee: nach ~300 ms Busy-Zustand am Button (Gestaltung Delia,
Console Style), währenddessen kein zweiter Klick; für alle Aktionen mit Server-Aufruf. Für Nutzer sichtbar, daher
nicht im Aufräum-Sprint.

### B-147 Eigenes Konfetti statt `js-confetti`
Status: refined (Andreas, 2026-11-24). Vendor `js-confetti` (8 KB) wird nur in `showConfetty()` genutzt (Einigkeit).
Eigenes Canvas-Konfetti (Delia, ca. 100 Zeilen): eigene Farben/Formen, bei `prefers-reduced-motion` ruhige Variante,
Anzahl begrenzen (heute `Spieleranzahl³`, bei 12 Leuten 1.728 Stück). Danach Vendor-Datei löschen. Grundlage für
die Feier-Stufen aus B-117.

### B-148 Eigener Mini-Markdown statt `remarkable`
Status: refined (Andreas, 2026-11-24). `remarkable` (115 KB, größte Datei des Boards) dient nur der Beschreibung von
Topic-Items (`topicMarkdown()` in `script/topics.js`). Nachbau als Teilmenge, die **direkt DOM-Elemente** aufbaut
(nie HTML-Strings, Text nur per `textContent`): Absätze, Zeilenumbrüche, fett/kursiv, Listen, Überschriften,
Inline-Code, Links (nur `http(s)`, `rel="noopener noreferrer"`, auch automatisch erkannte URLs wie heute `linkify`).
E2E-Tests mit fiesen Eingaben (HTML, `javascript:`-Links, verschachtelte Markierungen), Review durch Sina.
Texte mit Markdown außerhalb der Teilmenge sehen danach etwas anders aus (kaum Topic-Items in Nutzung).

### B-149 `qr-code-styling` erst bei Bedarf laden
Status: refined (Andreas, 2026-11-24). Die Vendor-Datei (65 KB) lädt heute bei jedem Board-Start, gebraucht wird sie
nur für den QR-Code im Invite. Erst beim Öffnen von Invite nachladen (Skript-Tag dynamisch einfügen, einmalig;
währenddessen ruhiger Platzhalter, bei Fehler Hinweis statt QR-Code). Kein Nachbau der QR-Kodierung.

### B-159 MCP: Hinweise aus den Reviews (nicht priorisiert)
Status: neu (Kai, 2026-11-27). Aus Sinas Reviews der MCP-PRs, alles nicht blockierend; zur Entscheidung durch Andreas
(„keine Limits auf Verdacht“ beachten):
- Nudge-Ratenlimit: alle anonymen MCP-Nudges eines Teams teilen sich ein Limit (poker-msg, Schlüssel `<hash>:0`);
  Alternative: Limit je echter mkey, ausgeliefert weiter mit `from = 0`.
- Obergrenze gleichzeitig wartender `wait_for_change` je Team (heute nur global 2000 in poker-msg).
- Feedback (`feedback.php`, MCP `feedback send`): kein Ratenlimit; Roadmap-Stimmen: neue UID = neue Stimme.
- Reaktionen im anonymen Modus: Agent kann nach dem Aufdecken keine Karte anvisieren (strenger als das Web);
  ggf. Positions-Handle je Runde statt mkey.
- poker-msg loggt die Team-ID im Klartext (`New notification: pull for team …`); besser Hash oder Präfix.
- `delete.php?mkey=` im anonymen Modus nach dem Aufdecken (gemerkte mkey verrät beim Entfernen die Karte); im MCP
  bereits ausgeschlossen.
- Kontingent per WebSocket: ein Browser kann mit beliebigem `from` das Kontingent anderer verbrauchen (bekannt, B-139).

### B-155 Transaktionen und Sperren systematisch
Status: refined (Andreas, 2026-11-26). Anlass: Deadlock in der CI (Rollout 8, #279): `insert … select max(sort_order)`
setzte unter REPEATABLE READ eine Lücken-Sperre auf `ix_custom_sets_team`; zwei neue Teams in derselben Lücke
blockierten sich gegenseitig – die Team-Zeilen-Sperre schützt nur innerhalb eines Teams. Behoben in #279 (Ursache
entfernt, `db_transaction()`/`api_transaction()` mit Retry bei 1213/1205, Lock-Wartezeit 5 s, 503 statt Fatal).
Mit v1/MCP (B-150/B-151) kommt mehr Nebenläufigkeit dazu. Umfang:
1. Inventar aller schreibenden Pfade: welche Tabellen in welcher Reihenfolge, welche Sperre zuerst.
2. Regeln (CLAUDE.md): zuerst die Team-Zeile sperren (`for update`), dann Tabellen in fester Reihenfolge
   (`pok_teams_tbl` → `pok_players_tbl` → übrige); vor der Sperre keine konsistente Lesung in derselben Transaktion;
   keine `insert … select` auf geteilten Indizes; eindeutige Schlüssel vor dem Insert bestimmen, nie per nachträglichem
   Update (heute noch `insert_custom_card()`: Karte mit `card_key = NULL` einfügen, dann setzen); schreibende
   Kernfunktionen laufen über `db_transaction()`.
3. Retry auch für `setc.php`, `update_deck.php`, `update_controls.php` (`lock_team_deck()` kann bei alten gemischten
   Decks ein Set anlegen) und alle weiteren Transaktionen aus dem Inventar.
4. Lasttest in der CI: viele parallele Teams und Schreibzugriffe (wie `custom-sets-concurrency.spec.ts`), PHP-Log muss
   sauber bleiben.

### B-156 Kryptische Team-IDs für neue Teams
Status: refined (Andreas, 2026-11-26), gleich mit angehen (vor bzw. mit B-150). Heute entsteht die Team-ID aus dem
Namen (`name2id()`/`get_team_id()` in `api/lib.php`, mit `rand()`), bei kurzen Namen erratbar; mit der API
(`team_join`) wird das skriptbar (Fund Sina). Neu angelegte Teams bekommen eine ID mit kryptografischem Zufall
(`random_bytes()`), für Board, Tool-Links (`index.php?tool=…`) und API gleich. Bestehende Team-IDs bleiben gültig
(Links der Teams). Offen fürs Planning: Format/Länge (passt in `varchar(80)`, URL-tauglich), ob ein lesbarer
Namensteil davor bleibt.
Umsetzung (Ben, 2026-11-26, Branch `feature/B-156-team-ids`): `new_team_id()` in `api/lib.php` für alle Wege
(`add_team()` → `addteam.php`, `index.php?tool=…`, später `team_create`). Format: lesbarer Präfix aus dem Teamnamen
(a-z/0-9, sonst `-`, Umlaute ausgeschrieben, höchstens 12 Zeichen, leer → `team`) + `-` + 16 Zeichen Base32 klein
(`a-z2-7`, 80 Bit aus `random_bytes()`), höchstens 29 Zeichen. Schutz kommt nur aus dem Zufallsteil; der Präfix hilft
beim Wiedererkennen des Links und verrät nichts, was das Board nicht ohnehin zeigt. Nur Kleinbuchstaben, weil
`pok_teams_tbl.id` case-insensitiv vergleicht. `name2id()`/`get_team_id()` (mit `rand()`) entfernt; alte IDs bleiben
gültig. Passt zu `FILTER_SANITIZE_URL`, `validate_team()` und poker-msg (`[\x21-\x7E]{1,80}`). E2E: `team-ids.spec.ts`.

### B-157 `dao.php` schreibt nur noch die Anwesenheit
Status: refined (Andreas, 2026-11-26). Ziel: `getDao()`/`dao.php` ist bis auf `touch_player()` (`last_callback_time`,
Anwesenheit B-110/B-127) ein reiner Lesezugriff. Seit #282 legt `getDao()` keine `pok_user_tbl`-Zeilen mehr an (das
machen `name.php` beim Beitreten und `update_user.php`). Übrig sind zwei einmalige Schreibvorgänge je Team, beide unter
der Team-Sperre (dort lag der Deadlock aus #279):
1. **Deck-Migration aus R3** (alte `cardset_flags` → `deck_id`, bei gemischten Decks ein Set „Our deck“): Teams, die
   nicht wiederkommen, verschwinden mit der Team-Löschfrist (B-109: 1 Jahr ohne Aktivität). Für die übrigen, noch nicht
   migrierten Teams beim Entfernen des Codes entscheiden: einmal per Skript migrieren (Logik existiert, Auswahl bleibt)
   oder damit leben, dass sie das Standard-Set bekommen (Andreas, 2026-11-26: beides denkbar).
2. **Beispielset (B-116)**: beim Anlegen des Teams vergeben (`add_team()`, passt zu B-144 Schritt 3) statt beim ersten
   Laden; bestehende Teams ohne Beispielset (wenige, 754 haben es) per einmaligem Skript oder gar nicht mehr.
Danach in CLAUDE.md: „`dao.php` schreibt nur die Anwesenheit.“

### B-158 Nutzertabelle abschaffen (`pok_user_tbl`)
Status: neu (Andreas, 2026-11-26: Eintrag ja, ob die Tabelle wirklich wegfällt, ist noch offen). `pok_user_tbl` hält je
UID nur noch: `color_mode` (seit B-141 ohnehin auch im Browser), `hide_teaser` (roter Punkt am Feedback-Menü, B-57;
wird bei Neuem per Skript für alle zurückgesetzt), `creation_date` („zuerst gesehen“ für die Wochenstatistik in
`stats.php`) und die toten Spalten `survey_*` (B-136). Da die UID selbst im Browser liegt, sind Einstellungen je UID
ohnehin Einstellungen je Browser – im Browser speichern ändert für Nutzer nichts.
Vorschlag:
- `color_mode` nur noch im Browser (`localStorage`, wie B-141).
- Feedback-Punkt über eine **Teaser-Version**: der Server liefert die aktuelle Version (ein Wert, z. B. per Admin-Knopf
  in `stats.php` hochgezählt), der Browser merkt sich die zuletzt gesehene; „wieder anzeigen“ = Version erhöhen statt
  Massen-Update.
- „Zuerst gesehen“ aus der ersten Runde einer UID (`pok_roundstat_details_tbl`).
- Danach `pok_user_tbl` entfernen (`get_user.php`, `update_user.php`, Lesen in `getDao()`, `delete_user.php` anpassen);
  zumindest die `survey_*`-Spalten können auch ohne den Rest weg.
Effekt: `dao.php` liest weniger, „Delete user“ wird einfacher, weniger personenbezogene Daten (passt zu B-109, B-157).

### B-65 Zeitpunkt der gewählten Karte speichern (`card_time`)
Status: neu (Andreas, 2026-10-28). Neue Spalte `pok_players_tbl.card_time`, gesetzt in `api/setc.php`. Damit ließe sich
„aktiv“ in `stats.php` als „hat in den letzten X Minuten eine Karte gewählt“ definieren. Schemaänderung online, Ben +
Sina.
Entscheidung (Andreas, 2026-11-16): als Idee behalten, z. B. für eine Auswertung „wie lange bis zur Entscheidung“.

### B-84 Kartenwechsel-Stürme dämpfen
Status: neu (Andreas, 2026-11-16: „dann müssen wir uns was überlegen“). Befund Access-Log Live 02.–16.11.: an
Werktagen 5–88 User-Minuten mit > 60 `dao.php`-Aufrufen, Spitzen 546/min für einen User. Ursache sind keine hängenden
Clients, sondern Teams, in denen sehr schnell Karten gewechselt werden (257–330 `setc.php`/min, ~4–5/s): jeder
Wechsel schickt allen Boards ein `pull`, jedes lädt `dao.php` → ~2.500 Reloads/min (Faktor ≈ Teamgröße). Harmlos für
die Nutzer, aber unnötige Last.
Ideen (noch nicht entschieden):
- Board: schnelle Kartenwechsel zusammenfassen – Karte springt sofort, gesendet wird höchstens alle ~300 ms die zuletzt
  gewählte.
- poker-msg: Pull-Fenster je Team bei Bursts von 100 ms auf ~500 ms strecken, sonst 100 ms.
- Server-seitige Begrenzung `setc.php` je User.
Frühere Entscheidung (2026-10-30) gilt weiter: nicht pro IP oder Team begrenzen (große, aktive Teams sind eine
Erfolgsgeschichte). In Doku/Repo keine IPs, Firmennamen, Team- oder User-IDs.

### B-94 Neuladen nach Fehlschlag wiederholen
Status: live (Rollout 5, 2026-11-16). Vorher: im Sprint 9, Schritt 1 (Andreas, 2026-11-16). Vorher: neu. Fund Tessa (2026-10-30): `updateDao()` hat kein `.catch`; schlägt das Neuladen nach dem eigenen Schreiben
fehl (Netz, 500), bleibt das Board bis zum nächsten `pull`/Neuaufbau (bis 40 s) auf altem Stand. Vorschlag: einmal nach
kurzer Pause erneut versuchen (B-135 wiederholt nur Schreib-Requests). Außerdem `docs/b81-server-notify.md` auf den
umgesetzten Heartbeat-Wächter nachziehen (nennt noch `expectPull`).

### B-97 Assets aufräumen
Status: live (Rollout 5, 2026-11-16). Vorher: neu (fasst B-35 zusammen). Auslieferung schlanker und `src/` übersichtlicher:
- Brand-SVGs (`brand_*.svg`, `brand_icon_*.svg`) je ~130 KB (sehr viele Pfade) für ein 20–24-px-Zeichen →
  verkleinern (svgo o. ä.; Delia). Gzip für SVG ist seit 2026-10-22 aktiv.
- Laut Fund 2026-10-31 lädt das helle Theme zuerst die dunkle Datei und `setColor()` setzt `src` bei jedem Update
  neu – prüfen, ob seit #103 noch so.
- `brand.png` und rund 50 alte `c_*.png`, die nach den gerenderten Karten (R3) nur noch in `mockups/` genutzt werden:
  löschen oder dorthin verschieben. Vorher Referenzen in HTML/CSS/JS/PHP/JSON prüfen; `src/xcf/` bleibt.

### B-137 Restliche SQL-Konkatenation auf Prepared Statements
Status: live (Rollout 5, 2026-11-16). Vorher: im Sprint 9, Schritt 2 (Andreas, 2026-11-16). CLAUDE.md nennt noch String-Konkatenation u. a. in
`validate_team()` (`api/lib.php`), `api/delete.php`, `api/feedback.php`. Alle Reste finden und umstellen, ohne
Verhaltensänderung.

### B-138 CI: `php -l` als schneller Vorab-Check
Status: live (Rollout 5, 2026-11-16). Vorher: im Sprint 9, Schritt 1 (Andreas, 2026-11-16). Alle PHP-Dateien (App, ggf. `tools/`) per `php -l` mit PHP 8.4
prüfen, bevor die E2E-Shards starten; schlägt früh und billig fehl.

## Offen: Sicherheit & Datenschutz

### B-91 Entfernen und Löschen nur mit Berechtigung
Status: refined; der Kern (UID-Prüfung in allen internen Endpunkten) ist in B-152 aufgegangen (Andreas,
2026-11-26). Fund Sina, Gedanke Andreas (2026-10-30):
- **Anderen Spieler entfernen** (`api/delete.php`, heute nur `t` + `mkey`): Aufrufer schickt zusätzlich seine User-ID
  und darf nur entfernen, wenn er selbst (nicht entfernter) Mitglied des Teams ist. Ziel bleibt der `mkey`.
- **Eigenen User löschen** (`api/delete_user.php`, nur `id`): bleibt auf die eigene ID beschränkt (sie ist das
  Geheimnis); prüfen, ob ein Bestätigungs-Merkmal sinnvoll ist.
- **Grundsatz:** Ein Client sieht nur seine eigene User-ID, andere Spieler nur über den `mkey` (`dao.php` erfüllt das).
  Übrige Antworten (Roadmap, Survey, Promo, Statistik, `seen.php`, `get_topics.php`) prüfen (Sina) und den Grundsatz
  in CLAUDE.md aufnehmen.
- REST-Verben erst mit der öffentlichen API (B-80); die interne API bleibt bei POST.

### B-93 poker-msg: Browser-`push` entfernen
Status: live (Rollout 5, 2026-11-16). Vorher: im Sprint 9, Schritt 1 (Andreas, 2026-11-16). Vorher: refined. Fund Sina (2026-10-30): poker-msg nimmt `push` per WebSocket weiter ungedrosselt an – wer eine Team-ID
kennt, kann ohne API-Aufruf beliebig viele Pulls an alle Boards des Teams auslösen. Seit B-81 (R2) sendet kein Client
mehr `push`: `push` in poker-msg entfernen oder über dieselbe Drosselung wie `onNotify` leiten. Nebenbei:
`api/delete_user.php` – fehlendes `$sql->close()` beim Feedback-DELETE.

### B-13 MySQL-Zugriff von außen einschränken – oder Grafana ablösen
Status: neu. Port 33060 schließen, Port 3306 per Firewall nur für die Grafana-Instanz öffnen, `grafana_usr` auf deren
Adresse beschränken und auf Leserechte prüfen. MySQL lauscht bewusst auf `0.0.0.0` (CLAUDE.md) – nur mit Rücksprache.
Erweitert (Andreas, 2026-11-16): Brauchen wir Grafana überhaupt? Die 3–4 Charts dort ließen sich in `stats.php`
integrieren (Daten liegen in den `_stats`-Tabellen). Dann könnte MySQL ganz auf `127.0.0.1` und der Firewall-Teil
entfiele. Erst die Charts sichten, dann entscheiden.

### B-109 Löschfrist für User-IDs und Namen (Speicherbegrenzung)
Status: neu. Hinweis Sina, Gedanken Andreas (2026-11-01). **Teams (Andreas, 2026-11-26):** ein nächtlicher Job löscht Teams nach
**1 Jahr ohne jede Aktivität vollständig** – inkl. Rundenhistorie, Spieler, eigene Sets, Items. Zu klären: was
„Aktivität“ ist (letztes Laden/`last_callback_time`, letzte Runde), ob die Statistik-Tabellen (`_stats`, Grafana) als
Aggregate erhalten bleiben (Vergangenheitswerte ändern sich sonst), Reihenfolge der Löschung (B-155-Sperrregeln). **Absicherung
noch durchdenken (Andreas, 2026-11-26):** ein Löschjob darf bei falscher Server-Uhr (NTP-Angriff oder -Ausfall, Sprung
in die Zukunft) oder einem Fehler in der Abfrage nicht massenhaft löschen. Ideen: Plausibilität von „jetzt“ gegen die
neueste Aktivität in der DB (`max(last_callback_time)`), Obergrenze je Lauf (z. B. höchstens 5 % der Teams, sonst
abbrechen und nur loggen), Trockenlauf/Protokoll; auf den Servern NTP mit mehreren Quellen bzw. NTS (`chrony`,
große Sprünge ablehnen). Gilt sinngemäß auch für die 2-Monats-Bereinigung in `start_new_round()`. Die User-ID (`localStorage` `SID`) ist zufällig, steht in der
DB aber neben Name und Team → pseudonym, also personenbezogen. Gelöscht wird nur `pok_players_tbl` (2 Monate
Inaktivität je Team). Dauerhaft: `pok_roundstat_details_tbl` (User-ID, Name, Karte je Runde),
`pok_analytics_events_tbl` (User-ID je Event), `pok_promotions_tbl`; „Delete user“ löscht Events und Promos nicht.
**Haltung Andreas:** User-ID nach einem Jahr invalidieren ist ok (kein langlebiger Identifier, ID im Browser ohnehin
flüchtig). **Sorge:** keine Inkonsistenzen in den historisierten Daten (Statistik-Jobs, `related_teams_cnt`, Grafana,
Rundenstatistik inkl. `original_card_key`). Ansatz: nach Frist pseudonymisieren statt löschen (Name leeren, User-ID
durch nicht rückführbaren Wert ersetzen); Ben klärt, was die Jobs brauchen.
Umfang: Frist (Vorschlag 12 Monate nach letzter Aktivität) als nächtlicher Event-Job; `delete_user.php` löscht bzw.
anonymisiert auch Events und Promos; Datenschutzerklärung anpassen (Frist, ID im Local Storage statt „Session
Store“, Rundenstatistik und Events; „Delete User umfasst alles“ erst, wenn der Fix live ist).

### B-126 nginx: `/tools/` nicht ausliefern
Status: neu, klein (Kai, 2026-11-06). Der Web-Root ist das ganze Repo, `tools/` (Migrations- und Kartenskripte) ist per
URL erreichbar (PHP-Skripte antworten mit 404, der Rest ist öffentlich auf GitHub). In nginx beider Server
`location ^~ /tools/ { return 404; }` (Befehle bereitet Kai vor). Erledigt 2026-11-10 (Live, außerhalb poker): `.git`
von feedback und teamcar gesperrt. Rest offen: `/tools/`-Sperre; teamcar-Repo `config.php` aus Git nehmen
(`config.example.php` + `.gitignore`); Staging-Seiten genauso prüfen.

## Erledigt & verworfen

- **B-01 SQL-Injection in `api/` beheben** – live 2026-10-20 (Sprint 3): Prepared Statements, Team-Prüfung auch in
  `timer.php`/`get_promo.php`.
- **B-02 `stats.php` absichern** – live 2026-10-20 (Sprint 3): XSS behoben, Zugriffsschutz (später ersetzt durch B-63).
- **B-03 PHP-8.1-Deprecations und Eingabe-Filter** – live 2026-10-16 (Sprint 2): Rohdaten speichern, bei der Ausgabe
  escapen; `FILTER_SANITIZE_STRING` raus, `cut_text()`, `encodeURIComponent`, Daten-Update der Teamnamen.
- **B-04 Lokale Testumgebung und erste E2E-Tests mit CI** – erledigt 2026-10-16 (Sprint 1): `tests/e2e/setup.sh`,
  Playwright, GitHub Actions.
- **B-05 E2E-Tests für weitere Funktionen** – geschlossen 2026-11-16: Spec-Abdeckung über die Feature-PRs erreicht.
- **B-06 Testfälle gemeinsam reverse-engineeren** – geschlossen 2026-11-16: die E2E-Specs decken das Verhalten ab.
- **B-07 Repo-Hygiene** – erledigt 2026-10-16 (Sprint 1): `.gitignore`, `config.example.php`, README-Installation.
- **B-08 MySQL-Statistik-Job ins Repo** – erledigt 2026-10-23: `db_jobs_pok.sql` (`pok_active_use_evt` ist
  deaktiviert und lief nie, Tabelle leer – Kandidat zum Aufräumen).
- **B-09 Wachstum von `pok_analytics_events_tbl`** – erledigt 2026-10-22, Entscheidung Andreas „so lassen“ (94 MB nach
  5,5 Jahren); bei Bedarf später einfacher Lösch-Job auf `creation_date`.
- **B-11 Schreibende API-Aufrufe per POST** – live 2026-10-22 (Sprint 5), #21: alle Writes per POST (405 sonst).
- **B-15 CDN-Abhängigkeiten festnageln** – live 2026-10-20 (Sprint 3): Versionen fest, Dateien selbst ausgeliefert,
  remarkable angehoben.
- **B-16 Fremddateien und phpMyAdmin in den Webroots** – erledigt 2026-10-16: `info.php`, `config.php.live` und
  `db`-Symlink entfernt.
- **B-17 DB-Zugriff per Client über SSH-Tunnel** – geschlossen 2026-11-16 (Andreas): kein externer DB-Client nötig,
  Zugriff per `sudo mysql` auf dem Server reicht.
- **B-18 Server-Logs von Live sichten** – erledigt 2026-10-16: Ergebnisse in B-19 bis B-21.
- **B-19 `poker-msg`: Event-Loop ohne 1024-Verbindungen-Grenze** – erledigt 2026-10-16 (Nachkontrolle ok,
  2026-11-16): Erweiterung `ev` auf beiden Servern, `ExtEvLoop`.
- **B-20 PHP-FPM und MySQL robuster konfigurieren** – erledigt (Nachkontrolle ok, 2026-11-16): poker-Pool
  `max_children 15`, `request_terminate_timeout`, Slowlogs FPM/MySQL; `skip-name-resolve` bewusst nicht
  (Grafana-Grants).
- **B-21 Race Condition beim Anlegen neuer Nutzer** – live 2026-10-20 (Sprint 3).
- **B-22 PHP-Upgrade auf 8.4** – erledigt 2026-10-16: Web-App und `poker-msg` auf beiden Servern auf 8.4, CI nur 8.4.
- **B-23 Server aufräumen nach PHP-8.4-Umstellung** – erledigt 2026-10-21: beide Server nur noch PHP 8.4 (weitere
  Seiten in eigenen Pools), `ondrej/nginx` entfernt, Composer offiziell. Rest: Upload-Grenzen (`post_max_size`/
  `upload_max_filesize`/`client_max_body_size` 100M) prüfen – die App lädt nichts hoch.
- **B-24 Heartbeat in `poker-msg`: tote Verbindungen schließen** – erledigt 2026-10-16 (Nachkontrolle ok,
  2026-11-16): WebSocket-Ping alle 30 s, nginx `proxy_read_timeout 120s`.
- **B-25 Board blitzt beim Laden auf** – live 2026-10-16 (Sprint 2): `opacity: 0` direkt am `<body>`.
- **B-26 `toggle_topic_box`: `Cannot read properties of null`** – live 2026-10-22 (Sprint 5), #21: Null-Guards.
- **B-27 `apple-touch-icon`** – live 2026-10-22 (Sprint 5), #21: Icons in `src/`, explizit verlinkt.
- **B-28 PHP2Shell (CVE-2026-109618/-109619)** – erledigt 2026-10-21: PHP 8.4.27 auf allen Servern, Check ohne Befund;
  Notbremse `99-php2shell.ini` bleibt liegen; automatische PHP-Updates aus dem PPA vorerst nicht gewünscht.
- **B-31 API-Review / HTTP-Semantik (Spike)** – erledigt 2026-10-22: M1–M3 live (403 statt leerem 200, JSON-Header,
  letzte SQL-Konkatenation), M4 = B-11. Kein REST-Redesign.
- **B-32 CI: `playwright install` beschleunigen** – erledigt 2026-10-22, #24: ohne `--with-deps`.
- **B-33 Namensänderung setzt Karte auf ☕; Verlassen räumt Karte nicht** – live 2026-10-22 (Sprint 5), #21.
- **B-35 Bilder/Assets verschlanken** – aufgegangen in B-97; erledigt: gzip für SVG auf Live und Staging
  (2026-10-22), tote Bilder entfernt (#93).
- **B-36 CSS vereinfachen, Responsive per CSS** – live 2026-10-23, #32–#35: `style.css` −36 %, ein Breakpoint (800 px)
  per `@media`, gemeinsame Basis-Klassen und Tokens.
- **B-37 Responsive per CSS statt JS** – aufgegangen in B-36.
- **B-38 `dao.php`-Payload verschlanken (Spike)** – geschlossen: Spike-Ergebnis „so lassen“ (1–2 KB); Last zusätzlich
  durch B-127 gesenkt.
- **B-39 Resize: Karten sofort neu positionieren** – live 2026-10-23 (Sprint 6).
- **B-40 Look & Feel / UX-UI (Epic)** – geschlossen: abgearbeitet über B-46–B-51, B-99, B-104, B-110.
- **B-41 Kartenbereich auf CSS-Flex + FLIP** – live 2026-10-23 (Sprint 6): Sortier-Gleiten per FLIP, kein Gleiten beim
  Resize und im Anonym-Modus.
- **B-42 Sortier-Option „im Spiel wählen“ gestrichen** – live 2026-10-23, #31/#35: nur „Card value“/„Player name“,
  im Anonym-Modus fest „Card value“.
- **B-43 `survey_intro` per `innerHTML`** – aufgegangen in B-136.
- **B-45 Toten Stern-Bewertungscode im Feedback entfernen** – erledigt.
- **B-46 Seitengerüst neu** – live R1 (2026-10-28), #56: Grid mit `dvh`, feste Zonen.
- **B-47 Touch von der Breite trennen, Touch-Ziele ≥ 44 px** – live R1 (2026-10-28), #56.
- **B-48 Topnav aus echten Buttons** – live R1 (2026-10-28), #56.
- **B-49 Fluide Kartengrößen** – live R1 (2026-10-28), #49/#56.
- **B-51 Menüs als Side Panel/Bottom-Sheet** – live R1 (2026-10-28), #56.
- **B-54 Feedback-Text ohne `encodeURIComponent()`** – live R1 (2026-10-28).
- **B-55 Hinweis und Umfrage zur neuen Optik** – verworfen 2026-10-27, ersetzt durch B-57.
- **B-56 Players-Menü** – aufgegangen in B-110.
- **B-57 Ideas & Bugs** – live R1 (2026-10-28), Abstimmung fortgeführt #200/#209: Meldungen mit Typ und Kontext,
  öffentliche Liste mit Status und Reaktionen, Moderation in `stats.php`.
- **B-58 Geänderte Karte sichtbar machen** – aufgegangen in B-104.
- **B-59 Aufdecken, bevor alle gewählt haben** – aufgegangen in B-125.
- **B-60 Spaß-Funktionen** – aufgegangen in B-110 (Reaktionen) und B-133 (Nudge); Feier-Animationen → B-117.
- **B-61 Eigene Kartenwerte / eigene Decks** – aufgegangen in B-98 (eigene Sets live R3); Bezahlfrage → B-100.
- **B-62 E2E-Tests für den Feedback-Pfad** – erledigt: rudimentärer Kernpfad.
- **B-63 `stats.php`: eigene Anmeldeseite** – live 2026-10-28: Prüfung gegen die nginx-htpasswd (bcrypt), Cookie
  30 Tage, `limit_req`, Basic Auth entfernt.
- **B-64 `stats.php` neu** – live 2026-10-28: Tabs Live/Usage/Ideas & Bugs/Tech; nie die Team-ID anzeigen.
- **B-66 „Basic Controls“: Rundenknopf + Timer unten rechts** – live R2 (2026-11-01).
- **B-67 Timer statt Stoppuhr** – live R2 (2026-11-01): Timer-Panel (Stopwatch | Timer, Timebox, Auto-Start).
- **B-68 Rechte Spalte (Desktop) + Primärsteuerung unten rechts** – live R2 (2026-11-01).
- **B-69 Kartenleiste mit `<`/`>`-Leisten** – live R2 (2026-11-01), #77: klickbar, Tasten holen Karten ins Bild.
- **B-70 Tipps in der rechten Spalte** – live R2 (2026-11-01), #76.
- **B-71 Löschen von Spielern auf Touch-Geräten** – aufgegangen in B-110.
- **B-72 Aufräumen: Layout- und Spread-Logik** – geschlossen 2026-11-16: durch die Layout-Umbauten (R2–R4) überholt;
  Aufräumen in `script.js` läuft über B-14.
- **B-73 Wackelnder Timer-E2E-Test** – live R2 (2026-11-01), #100: echter Fehler (ältere dao-Antwort) behoben.
- **B-74 Overlay-Menü schließt bei Klick daneben** – live R2 (2026-11-01), #78.
- **B-75 Kartenleiste auf dem Handy als Karussell** – live R2 (2026-11-01), #81 (mit B-77).
- **B-76 Name über der Karte, Symbole zentriert** – live R3 (2026-11-06), mit B-99.
- **B-77 Karussell auf allen Touch-Geräten** – live R2 (2026-11-01), #85.
- **B-78 Hinweis „Gerät drehen“ bei Handys quer** – live R2 (2026-11-01), #86.
- **B-79 Stoppuhr ohne „T+“, Tipps je Kartenart und Anonym-Modus** – live R2 (2026-11-01), #87/#88.
- **B-81 Update-Signal vom Webserver an poker-msg** – live R2 (2026-11-01), #101, poker-msg#3: API meldet per UDP
  `notify_team()`, Heartbeat `hb`, kein Browser-`push` mehr.
- **B-82 Board reagiert nach Pause nicht** – live R2 (2026-11-01), #92: Neuaufbau bei Sichtbarkeit und Sendefehler.
- **B-83 Nächtlicher Statistik-Job blockiert `dao.php`** – live 2026-10-30 (DB), #94: Index + `READ COMMITTED`.
- **B-85 Topic mit Emoji → HTTP 500** – live R2 (2026-11-01), #95/#97: `utf8mb4` für Topic & Co.
- **B-86 Verbindungsstatus anzeigen** – live R2 (2026-11-01), #92: Overlay „Reconnecting …“.
- **B-87 Minütlicher Statistik-Job sperrt `pok_players_tbl`** – live 2026-10-30 (DB), #96: `READ COMMITTED`.
- **B-88 ID-Parameter auf ihr Format prüfen** – live R2 (2026-11-01), #99: `get_id_param()`.
- **B-89 Kleinkram aus den Reviews (JS)** – live R2 (2026-11-01), #98. Hinweis: `db_schema_pok_inc.sql` ist als Ganzes
  nicht idempotent – immer nur neue Blöcke einspielen.
- **B-90 Umfrage reparieren oder entfernen** – aufgegangen in B-136 (Entscheidung Andreas 2026-11-16: entfernen).
- **B-92 Ältere dao-Antworten verwerfen** – live R2 (2026-11-01), #101: Sequenznummer in `updateDao()`.
- **B-95 `last_callback_time` höchstens einmal pro Minute** – verworfen 2026-10-30: Ersparnis zu klein, bleibt die
  echte letzte Rückmeldung.
- **B-96 Tipps fürs Team abschaltbar** – live R2 (2026-11-01), #102: Schalter „Tips“ (Board → Team), Analytics-Event.
- **B-98 Kartendecks nach Gruppen** – live R3 (2026-11-06), #173/#174/#180/#186/#190/#199: Setgruppen mit Varianten,
  Steuerkarten je Team, eigene Sets, Lazy-Migration (Backup → B-128).
- **B-99 Karten neu (gerendert, Skizzen-Stil, Rich-Sets)** – live R3 (2026-11-06): Symbolbibliothek `cards.svg`,
  Karte als HTML/CSS aus Set-Daten. Rest: Themes (z. B. Saison-Rückseiten) als spätere Idee.
- **B-101 Tipps für J.U.D.G.E.** – live R3 (2026-11-06). Rest: ob Delegation, Ampel, Emotionen eigene Tipp-Regeln
  brauchen.
- **B-102 Systemkarte „joined in“ statt automatischer ☕** – live R3 (2026-11-06).
- **B-103 `setc.php` prüft Karte gegen das Deck** – live R3 (2026-11-06): 400 für Keys außerhalb Deck/Steuerkarten.
- **B-104 „Karte geändert“: Originalschätzung sichtbar** – live R3 (2026-11-06): versetzter Stapel, Original
  gespeichert.
- **B-105 Anonym-Modus pseudonymisieren** – verworfen 2026-11-01: Ziel (in der Oberfläche nicht sichtbar, wer was
  gelegt hat) ist erreicht; Zuordnung über Rohdaten ist ok.
- **B-106 Special Card „shruggie“** – live R3 (2026-11-06).
- **B-107 Mehr Emotionen: „Team Assessment“ und „Mood“** – live R3 (2026-11-06). Rest: später ggf. overwhelmed 🤯,
  tense 😬.
- **B-110 Tisch-Interaktion** – live R3 (2026-11-06), u. a. #156: away-Erkennung, Beobachter-Zeile, Kontext-Kreise
  (Reaktionen, Entfernen), Reaktionen und Nudge über den WebSocket.
- **B-113 Seitenleiste ein-/ausklappbar** – live 2026-11-09, #205–#223, #225: schmale Leiste, Breite per Griff,
  Zustand je Phase pro Person (nur Desktop).
- **B-115 Schalter „See changed cards“** – live R3 (2026-11-06), #191/#194.
- **B-116 Beispielset „Animals“** – live R3 (2026-11-06), #192.
- **B-127 Leichter Heartbeat statt `dao.php` alle 30 s** – live 2026-11-09, #224, #225: `api/seen.php` mit `away_sig`,
  `dao.php` nur bei `pull`, eigenem Schreiben oder geänderter away-Menge.
- **B-130 Timer: Auto-Start „Off · New round · Next item“** – live R4 (2026-11-16), #235/#238.
- **B-131 Reaktionen: gestaffeltes Rate-Limit je Verbindung** – live R4 (2026-11-16), #236, poker-msg#8/#9: 3 pro
  Sekunde, 10 pro Minute je Verbindung; Log mit Fenster und Reaktionscode (nie Absender/Empfänger); Hinweis im Board.
- **B-133 Nudge mit Ton und Tab-Hinweis** – live R4 (2026-11-16), #251: leiser Ton (Web Audio), Vibration auf Android,
  blinkender Titel; Schalter „Sound on nudge“ im `:you`-Menü.
- **B-134 CI schneller** – erledigt 2026-11-13, #252: 3 Shards, PRs nach `release` ohne `@slow`.
- **B-135 Schreib-Requests scheitern in Safari nach langer Tab-Nutzung** – live R4 (2026-11-16), #253: `apiWrite()`
  wiederholt idempotente Writes einmal nach Netzfehler; nginx `http2_max_requests 10000` auf Staging und Live.

## Weitere Entscheidungen

Noch gültige Entscheidungen aus erledigten Einträgen, die sonst nirgends stehen
(Details: `git show 65c605b:BACKLOG.md`).

**Gestaltung**
- **Console Style** ist der Look der App, ohne Theme-Umschalter; Light/Dark bleibt (Andreas, 2026-10-23). Er ist die
  Denkrichtung für Gestaltungselemente, nicht für mehr Text oder `//`-Labels.
- **Gestaltungsprinzip (Andreas, 2026-10-28, B-68):** Wer die App zum ersten Mal öffnet, findet sie einfach und wird
  nicht erschlagen – wenige Elemente, klare Hierarchie (Karte wählen, Runde starten), im Zweifel weglassen. Zonen wie
  bei einem Armaturenbrett, aber keine „Border-Schlacht“.
- Emojis sparsam; „New round“ bleibt Hauptbutton und ändert seine Position nicht, wenn der Timer an/aus geht. Desktop:
  Menüpunkt öffnet direkt das Side Panel (nur Schließen); die Menü-Übersicht gibt es nur mobil.
- Bewusst „gut genug“ (B-46–B-51): ein Breakpoint und Desktop-first, Durchschnittszeiger per JS, `getBrowserWidth()`
  bzw. `display_type` für Analytics, Invert-Filter für Icons, `opacity: 0` am `body` gegen Flackern.
- Kein Screenshot-Vergleichstest; Andreas nimmt auf Staging per Sichtprüfung ab (B-36).
- **Anonym-Modus:** Karten gleiten nie (Gleiten würde verraten, wer welchen Wert hat); Sortierung fest nach Kartenwert.
- Sortierung der aufgedeckten Karten: nur „Card value“ / „Player name“ unter der Kartenset-Auswahl, **kein**
  automatischer Standard je Kartenset (B-42).
- **Touch → immer Karussell**, unabhängig von der Breite (auch iPad); mit Maus nie Karussell (B-75, B-77).
- Timer (B-67): Defaults aus, Modus Stopwatch; Stopwatch ohne T±, Timer T−/T+; „Zeit um“ = T+ in Amber, kein Ton.
- Seitenleiste (B-113): Niemand soll die Panelgröße je Spielsituation nachstellen müssen – das Panel folgt der Phase,
  man kann übersteuern, das Board merkt sich die Wahl. Eher den Tisch lesbarer machen als das Panel wichtiger.

**Karten und Decks (R3, Andreas 2026-10-31/11-01)**
- „Nah an der Physik“: Karten werden nach dem Aufdecken nicht gesperrt, Änderungen werden sichtbar (B-104).
- Karten gerendert im Skizzen-Stil (Farbe je Wert, keine Strichmännchen, kein Deck-Name auf Karten); drei Ebenen
  Symbol – Heading – Description (Längen ≤ 6 / ≤ 16 / ≤ 160); Gelbtöne mit dunkler Schrift; Stil je Set (`plain`,
  `inverted`, …), kein freies CSS. Delegation-Texte exakt vom Original, nicht deren Layout.
- Datenmodell: Setgruppe 1:N Karte; ein Symbol höchstens einmal je Deck. Standard für neue Teams und Rückfall:
  Fibonacci Classic + Steuerkarten ☕ und ? (! und ✋ zuschaltbar; shruggie standardmäßig aus).
- Steuerkarten gelten pro Team, unabhängig vom Set, immer Stil `plain`; „!“ heißt important; ✋ veto ist nicht
  J.U.D.G.E. „6 veto“.
- Eigene Sets: bis zu 5 je Team (konfigurierbar, B-100), bis zu 16 Karten; Wert statt Symbol nur Text (≤ 6 Zeichen,
  keine Emoji); Farben nur aus fester Token-Palette; Mischen nur über eigene Sets („(+)“ gestrichen). Deck-Wechsel
  oder Save eines geänderten Sets während einer Runde: Hinweis, dann neue Runde. Gleichzeitiges Bearbeiten: Hinweis,
  Save überschreibt.
- Tastatur: Karten nach Tastaturreihen (q w e r t …, physische Taste `event.code`), Beschriftung unter den Karten.
- Systemkarten („joined in“, künftig „Paused“) sind keine Stimme: nicht in Histogramm, Spannweite, Durchschnitt, Tipps.
- Karte geändert (B-104): Statistik/Spread/Tipps nach aktueller Karte; „Let them explain“ nennt Extremwerte beim
  Aufdecken **und** aktuelle Extremwerte („Name (5→8)“) – man kann sich nicht durch Umlegen herausnehmen.

**Tisch und Tipps**
- Tipps (B-70, B-79): Anonym-Modus immer allgemein ohne Namen; bei Ampel/Emotionen bzw. ohne Zahlen-Spanne „Talk about
  the cards you chose.“; wer ? oder ! gelegt hat, wird genannt; ☕ ergänzt „Maybe take a short break.“; shruggie
  löst keine Aufforderung aus.
- Entfernen (B-110): jeder darf jeden Spieler entfernen, Rückfrage immer; Beobachter sind nicht entfernbar und werden
  bei „away“ in der Beobachter-Zeile ausgeblendet. Reaktionen dürfen auch auf anonyme Karten geworfen werden.
- Reaktionen laufen direkt über den WebSocket (poker-msg prüft Format streng, bremst), nichts in die DB, keine
  Statistik; im poker-msg-Log ohne Namen ist ok (B-131). Alle im Team sehen den Wurf, Animation erst beim Echo.

**Technik und Betrieb**
- Board-Updates „fire and forget“ ohne Zustellgarantie; **kein Polling als Sicherheitsnetz**, stattdessen Heartbeat
  (B-81).
- `seen.php`/`away_sig` geben nie Player-IDs heraus (B-127).
- Ideas & Bugs (B-57) ist Kommunikationsinstrument und Feedbackkanal, keine Abstimmung über die Roadmap; Stimmen sind
  ein Stimmungsbild. Bewusst nicht: Stimmenlimit pro Tag, roter Punkt bei neuen Einträgen erneut, Textfeld nach 👎.
- Daten-Updates: betroffene Werte vorher sichern bzw. nach altem Wert unterscheiden (Lehre aus B-42).
- Nach Server-Umstellungen einen PHP-Endpunkt testen, nicht nur `/` (Lehre aus B-23).
- Boards sind `noindex` (seit R3).
- Mockups (`mockups/`) zeigen, in welche Richtung eine Entwicklung gehen könnte. Sie bleiben, solange sie diesen Zweck
  erfüllen, und werden gelöscht, sobald er sich erledigt hat (umgesetzt oder verworfen); dass sie auf Live abrufbar
  sind, ist unproblematisch (Andreas, 2026-11-16).
