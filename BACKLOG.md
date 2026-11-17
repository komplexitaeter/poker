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
3. B-34 Startdaten asynchron laden
4. B-14 erster Schnitt (2–3 Module aus `script.js`)
5. B-12 Zeichensätze `utf8mb4` (Schema am Abend im Rollout)
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
Status: neu. Feedback (2026-10-29): „Add API to allow setting the topic.“ Faktisch gibt es `POST
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

## Offen: Technik & Betrieb

### B-30 Server auf Ubuntu 24.04 heben (vor April 2027)
Status: refined. Reguläre Unterstützung für 22.04 endet im April 2027. Beide Server auf 24.04, zuerst Staging (vorher
Snapshot beim Hoster), Live danach an einem Wochenende. Zu beachten: ondrej-PHP-PPA wird beim Upgrade abgeschaltet und
muss für `noble` neu eingerichtet werden (sonst fehlt PHP 8.4); `ev` für `poker-msg` neu bauen; nginx wird 1.24; die
weiteren Seiten auf beiden Servern mittesten (nach Umstellung einen PHP-Endpunkt testen, nicht nur `/`).
Offen: Zeitpunkt; ob das PPA langfristig bleibt oder auf `packages.sury.org` umzieht.

### B-128 R3-Deck-Backup prüfen und löschen (Mitte Dezember)
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
Status: neu. Topic und weitere Spalten sind seit B-85 `utf8mb4`; noch 15× `utf8mb3`, 2× `latin1` (Tabellen/Spalten).
Umstellung inkl. Verbindung; größere DB-Änderung, braucht ein Wartungsfenster (abends/Wochenende).

### B-14 `script/script.js` in Module aufteilen
Status: neu. `script.js` hat inzwischen 4.090 Zeilen mit globalen Variablen. Schrittweise in ES-Module zerlegen, ohne
Build-Schritt. Delta-Rendering statt komplettem Neu-Rendern nach jedem `pull` wäre ein Folgeschritt (aus B-38).

### B-34 Synchrone XMLHttpRequest auf async umstellen
Status: im Sprint 9, Schritt 3 (Branch `feature/B-34-async-start`, Review offen). Vorher: neu, niedrige Priorität. Die Feedback-Aufrufe sind umgestellt; offen ist das synchrone `loadJSON()`
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
Status: mit B-34 umgesetzt (Andreas, 2026-11-17). Vorschlag Fred, 2026-11-17, aus B-34: `loadBoard()` startete erst bei `window.load`, also nach Bildern,
allen Defer-Skripten und dem externen plausible.io; `dao.php` könnte bei `DOMContentLoaded` starten, plausible `async`.
Bringt auf langsamen Netzen spürbar Zeit, ändert aber die Startreihenfolge (Tests prüfen).

### B-141 Farbmodus lokal merken gegen dunklen Hintergrund vor dem Laden
Status: umgesetzt, im Sprint 9 (Fred, 2026-11-17; Vorschlag Fred aus B-34, beauftragt Andreas 2026-11-17). Bis `setColor()`
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
Status: refined. Fund Sina, Gedanke Andreas (2026-10-30):
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
Status: neu. Hinweis Sina, Gedanken Andreas (2026-11-01). Die User-ID (`localStorage` `SID`) ist zufällig, steht in der
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
