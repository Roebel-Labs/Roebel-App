# Agenten-Inspiration: Feldforschung, Thesen, Abo-Logik

> **Forschungs- und Strategienotiz, 2026-09-26.** Status: ENTWURF zur Durchsicht durch Max.
> Grundlage: Webrecherche am 2026-09-26 (Quellen in §9, deutsche Quellen bevorzugt), die Specs
> `docs/superpowers/specs/2026-09-25-mecky-chat-suite-design.md` und
> `docs/superpowers/specs/2026-09-26-ortis-agent-harness-design.md` (§4 = Werkzeuge der Agenten) und
> `docs/future-research/2026-09-25_ORTIS_MULTI_TENANT_PLATFORM_AND_REVENUE.md` (§6 = Erlösmodell).
> Keine Rechts- oder Steuerberatung: jede rechtliche Einordnung hier ist eine Arbeitshypothese.
>
> Umsetzung: `apps/web/src/lib/chat/inspiration/catalog.ts` (56 Aufgaben, `rankInspiration`) +
> `catalog.test.ts` (`cd apps/web && npx tsx --test src/lib/chat/inspiration/*.test.ts`).

---

## 0. Kurzfassung

1. **Der Wert entsteht bei Organisationen, nicht bei Bürgern.** Ein Restaurant, eine Ferienwohnung
   oder ein Verein kann mit drei, vier Agenten-Aufgaben nachweisbar 5 bis 15 Stunden im Monat sparen
   oder 150 bis 1.500 € im Monat mehr einnehmen (Rechnungen in §2). Bei Bürgern ist der Wert
   überwiegend Zeit, Orientierung und gelegentlich Geld (nicht abgerufene Leistungen). Das deckt sich
   mit dem Ortis-Erlösdokument: **B2C bleibt im Kern frei, B2B zahlt monatlich.**
2. **Die Inspiration muss konkret, lokal und saisonal sein.** Die stärksten Aufgaben hängen an einem
   Datum (Saisonstart April, Förderfrist, Mitgliederversammlung, Abfuhrtag, Regentag) und an Röbel-Daten,
   die nur die App hat (Veranstaltungen, Vereine, Speisekarten, Angebote, Feed). Das ist der Schutzgraben
   gegenüber ChatGPT: nicht das Modell, sondern Kontext plus Aktionen mit Freigabe.
3. **"Erst fragen, dann veröffentlichen" ist Produkt, nicht nur Pflicht.** Die Freigabe-Karte aus dem
   Harness macht aus KI-Texten redaktionell verantwortete Inhalte (AI Act Art. 50 Abs. 4, Ausnahme bei
   menschlicher Prüfung), schützt vor UWG-Fehlern und baut Vertrauen bei Menschen auf, die KI misstrauen.
4. **Abo-Empfehlung:** Free bleibt großzügig für Bürger. Plus (9,99 €) und Ultra (29,99 €) sind
   Kontingent- und Routinen-Stufen für Vielnutzer. Das eigentliche Geschäft ist ein **Organisations-Abo
   ("Betrieb")**: 39 € pro Monat für Betriebe, 14,99 € für gemeinnützige Vereine, jeweils mit
   Nutzen-Nachweis im Monatsbericht ("Diesen Monat: 7 Std. gespart, 3 Beiträge, 1 Förderantrag").
5. **Nicht bauen:** Bewertungs-Kauf oder -Filter, Massen-Kaltakquise, Steuererklärungen, Rechtsbriefe
   für Dritte, Kurtaxe/Meldeschein (Etablierte: AVS, feratel), eigene Kasse vor 2027, Wahlempfehlungen,
   Röbel Card.

---

## 1. Zielgruppen: Probleme mit Belegen

### 1.1 Bürgerinnen und Bürger (inkl. Senioren und Familien)

| Problem | Beleg | Was ein Agent heute kann |
|---|---|---|
| Digitale Pflicht-Wege überfordern Ältere | Die Hälfte der ab 65-Jährigen bucht Arzttermine inzwischen online; ein Drittel der über 75-Jährigen kann Termine nur noch online buchen; VdK warnt vor Ausgrenzung und "finanziellen Einbußen" [B1][B2] | Brief erklären, Termin-Weg erklären (116117), Kalender-Eintrag vorschlagen |
| Leistungen bleiben liegen | Entlastungsbetrag Pflege: 131 €/Monat ab Pflegegrad 1, verfällt erst zum 30.6. des Folgejahres, gilt als "am häufigsten ungenutzte Leistung" [B3]; Nichtinanspruchnahme bei Grundsicherung im Alter 40 bis 60 % (DIW) [B4] | Anspruch prüfen (Information, keine Einzelfall-Rechtsberatung), Unterlagen-Checkliste, Anfrage-Entwurf |
| Kleinstadt-Alltag ist zersplittert | Abfuhr, Veranstaltungen, Vereine, Angebote liegen an fünf Orten; Röbel: ca. 5.100 Einwohner, Amt ca. 15.000 in 22 Gemeinden [B5] | Wochenüberblick als Routine aus `abfallkalender`, `list_events`, `list_deals` |
| Wenig Anschluss für Zugezogene | Sportvereine verlieren Engagierte, Umweltorganisationen wachsen (ZiviZ) [C1] | Vereinsvorschläge mit Schnuppertermin |
| Beteiligung ist mühsam | Sitzungsprotokolle sind lang, Meinungsbilder brauchen Kontext | neutrale Zusammenfassung, ausdrücklich ohne Empfehlung |

**Wertrechnung (Median-Haushalt):** Wochenüberblick + Abfuhr + ein Termin- oder Brief-Fall pro Monat
≈ 4 bis 6 Std./Monat. Geldwert nur in Einzelfällen, dann aber groß (Entlastungsbetrag bis 1.572 €
rückwirkend, Wohngeld). Zahlungsbereitschaft: 13 % der KI-Nutzer zahlen, im Schnitt 20 €/Monat; 43 %
der Zahlenden liegen bei 20 bis 30 € [A1]. Für einen Kleinstadt-Durchschnittsnutzer ist 9,99 € die
Obergrenze, und nur für Vielnutzer.

### 1.2 Gastronomie in der Tourismusregion

| Problem | Beleg | Agent-Hebel |
|---|---|---|
| Personalmangel | 80 % der Betriebe beklagen Personalmangel (DEHOGA) [D1]; ein Müritz-Hotelier reduzierte von 16 auf 3 Personen und stellte auf kalte Küche um [D2] | Stellenanzeige, Kanäle, jede eingesparte Büro-Stunde zählt |
| Bürokratie | 63 % nennen Bürokratie als größte Herausforderung [D1] | Allergen-Mappe, Fristen, Kalkulation |
| Umsatz real unter 2019 | Realumsatz 2025 knapp 15 % unter 2019 [D1]; MwSt auf Speisen seit 1.1.2026 dauerhaft 7 %, Getränke 19 % [D6] | Nachkalkulation pro Gericht, Themenabende in der Nebensaison |
| Bewertungen entscheiden | 1 Stern mehr ≈ 5 bis 9 % Umsatz (Luca, HBS, Yelp) [D3]; viele Gäste filtern unter 4,0 Sterne [D3] | Antworten auf jede Bewertung, faire Bewertungsbitte an alle |
| No-Shows | 10 bis 20 % ohne Gegenmaßnahmen, am Wochenende bis 25 %; 50 Plätze × 40 € Bon → 400 bis 800 € Verlust pro Samstag; Erinnerungen senken um bis zu 30 %, Paket aus Maßnahmen um 50 bis 70 % [D4] | Erinnerungs- und Stornotexte, Regeln für große Tische |
| Allergenkennzeichnung | LMIV-Pflicht auch für lose Ware, mündlich nur mit schriftlicher Dokumentation; Bußgelder bis 50.000 € genannt [D5][D7]; einheitliche Darstellungsregeln durch DVO (EU) 2025/891 ab 2027 (Sekundärquelle, **vor Nutzung prüfen**) [D5] | Allergen-Matrix als Entwurf aus Rezepturen, Betreiber bestätigt |
| Online-Pflege kostet | Pflege von Google-Profil, Instagram, Bewertungen: 200 bis 400 €/Monat; Agenturen 240 bis 1.500 €/Monat [D8] | Wochen-Beitrag, Profil-Checkliste vor Saisonstart |

**Wertrechnung (Restaurant, 50 Plätze, Saison Mai bis September):**
- Bewertungsantworten 30/Monat × 5 Min. + 4 Beiträge × 30 Min. + Anfragen ≈ **4 bis 6 Std./Monat**.
  Bei 15 €/Std. Inhaberzeit (vorsichtig) = 60 bis 90 €; gegen die Agentur-Preisanker 200 bis 400 €.
- No-Shows halbieren an 8 Saison-Wochenenden: 200 bis 400 € pro Wochenende → **+800 bis 1.600 €/Monat**
  in der Saison (vorsichtig gerechnet: +300 €).
- Nachkalkulation: fünf Gerichte je +0,50 € Marge × 600 Portionen = **+300 €/Monat**.
- Summe konservativ **≥ 400 €/Monat Nutzen** bei 39 € Abo → Faktor 10.

### 1.3 Vereine

| Problem | Beleg | Agent-Hebel |
|---|---|---|
| Vorstände schwer zu besetzen, Verwaltung frisst Zeit | Fast drei Viertel der Organisationen nennen Verwaltungsaufgaben der Leitung als besonders zeitintensiv; Bürokratie durch Register, Förderanträge, Gemeinnützigkeit (ZiviZ-Survey 2023, 12.792 Organisationen) [C1] | Protokolle, Fristen, Vorstands-Handbuch, Übergabe |
| Fördermittel ungenutzt | Ehrenamtsstiftung MV: bis 1.000 €, in Sonderfällen 3.000 €, seit 2026 ohne Verwendungsnachweis, Anträge 2026 bis 30.9.2026 [C2]; LEADER-Regionalbudget: 80 %, max. 16.000 € pro Kleinprojekt, LAG in Waren (Müritz), Budget 2026 hängt an Ministeriumsentscheid [C3] | Förderfinder, Antragsentwurf aus der Richtlinie, Frist-Erinnerungen |
| Nachwuchs, Sichtbarkeit | Vereine fehlt Zeit für Social Media, oft nur sporadisch [C4] | Schnuppertag, Beiträge, Plakat |
| Kasse und Steuer | Übungsleiterpauschale 3.300 €, Ehrenamtspauschale 960 € ab 2026 [C5]; Sphären-Trennung ist Stoff für Fehler | Kassenprüfung vorbereiten (Checkliste, keine Steuerberatung) |
| Software-Preise | easyVerein 7,14 bis 41,99 €/Monat [C6]; Marktband 9 bis 19 € (Ortis-Dokument §6.1) | Ortis-Verein-Abo darf nicht teurer sein als die Mitgliederverwaltung |

**Wertrechnung (Verein, 80 Mitglieder):** Protokolle 2 Std./Monat, Fristen/Einladungen 1 Std.,
Beiträge 2 Std. ≈ **5 Std./Monat Ehrenamtszeit**. Ein einziger erfolgreicher Antrag bei der
Ehrenamtsstiftung (1.000 €) finanziert 5,5 Jahre Verein-Abo à 14,99 €. Das ist die Kernbotschaft
für Vereine: "Der erste Förderantrag bezahlt das Abo für Jahre."

### 1.4 Betriebe, Handwerk, Einzelhandel

| Problem | Beleg | Agent-Hebel |
|---|---|---|
| Bürozeit statt Kundenzeit | Über die Hälfte der Handwerksbetriebe >100 Std./Jahr reine Bürokratie (Angebote, Nachweise, E-Rechnung); 74 % sehen gestiegenen Aufwand (ZDH) [E1] | Angebotsentwurf aus Fotos, Postfach-Sortierung |
| E-Rechnung | Empfang seit 2025 Pflicht; Ausstellung ab 2027 bei >800.000 € Vorjahresumsatz, ab 2028 für alle (Kleinunternehmer ausgenommen) [E2] | Einordnung + Lösungswege, Hinweis auf Steuerberater |
| Nachfolge | ca. 25.000 Unternehmen in MV stehen vor der Nachfolgefrage; 1.000 bis 1.500 suchen aktiv extern; Nachfolgezentrale MV [E3] | Nachfolge-Fahrplan, Unterlagen-Liste, Beratungsstellen |
| Laden-Sterben | HDE: 4.500 Geschäftsschließungen 2025, bis 40 % Leerstand in manchen Kommunen [E4] | Schaufenster-Beitrag, Angebot für den schwächsten Tag |
| KI-Hemmnisse | 36 % der Unternehmen nutzen KI; Hemmnisse: Rechtsunsicherheit 53 %, Know-how 53 %, Personal 51 % [A2] | fertige Aufgaben statt leerem Chatfeld, Freigabe statt Autopilot |

**Wertrechnung (Handwerksbetrieb, 4 Leute):** Angebote 6 Std./Monat → 3 Std. gespart, Postfach
2 Std. → 1 Std. gespart ≈ **4 Std./Monat Inhaberzeit** (Stundensatz 50 bis 65 € → 200 bis 260 €).

### 1.5 Tourismus (Ferienwohnung, Bootsverleih, Aktivanbieter)

| Problem | Beleg | Agent-Hebel |
|---|---|---|
| Portalprovision | Booking.com in DE Standard 12 %, in vielen EU-Märkten 15 %, Portale 15 bis 20 %; Direktbuchungen ca. 34 % [F1] | Gästemappe, Wiederbuchungs-Nachricht (nur mit Einwilligung) |
| Rückfragen, Check-in | unübersichtliche Kanäle, manuelle Kommunikation [F2] | Gästemappe DE/EN, Wochentipps |
| Saison-Abhängigkeit | MV 2025 zweitbestes Jahr: 33,3 Mio. Übernachtungen [F3]; Röbel: ca. 106.000 Übernachtungen, 4,0 Nächte je Gast [B5] | Nebensaison-Inserat (Kranichzug, Ruhe) |
| Sicherheit auf dem Wasser | führerscheinfreie Charter, bis 1 m Welle bei Wind auf der Müritz [F4] | Morgen-Wetterwarnung für Bootsgäste |
| Meldeschein, Kurtaxe | Besondere Meldepflicht für Deutsche seit 2025 abgeschafft, für Ausländer bleibt sie; Kurtaxe über AVS, feratel [F2] | **nicht bauen**, etablierte Anbieter |

**Wertrechnung (2 Ferienwohnungen):** eine zusätzliche Direktbuchung pro Monat à 700 € spart
84 bis 126 € Provision; Gästemappe spart ca. 3 bis 4 Std./Monat Rückfragen → **≥ 150 €/Monat Nutzen**.

### 1.6 Kommune und Amt

| Problem | Beleg | Agent-Hebel |
|---|---|---|
| Personal fehlt | bis 2030 fehlen Gemeinden rund 230.000 Beschäftigte, heute >100.000 Stellen unbesetzt (DStGB/dbb) [G1] | FAQ aus wiederkehrenden Anfragen, Baustellen-Meldungen |
| Routineanfragen | Kommunale Chatbots beantworten Öffnungszeiten, Unterlagen, Gebühren, Fristen; Beispiele Gersheim, Wadgassen, Bad Oeynhausen [G2] | Mecky ist bereits der Bürger-Chatbot; das Amt pflegt die Antworten |
| Beteiligung | Meinungsbilder, Sitzungszusammenfassungen | neutrale Zusammenfassung, Meinungsbild-Vorlage |

**Wertrechnung:** Eine gute FAQ fängt 5 bis 10 Anrufe/Woche ab ≈ **10 Std./Monat** Sachbearbeitung.
Kommunen kaufen jährlich per Lizenz (Ortis-Dokument §6.1, 0,60 bis 1,00 € je Einwohner und Jahr), nicht
per In-App-Abo. Die Kommune-Aufgaben im Katalog sind daher Vorführ- und Lizenz-Argumente.

---

## 2. Wertrechnung auf einen Blick

| Zielgruppe | Zeit gespart | Geld (vorsichtig) | Preis | Faktor |
|---|---|---|---|---|
| Bürger (Vielnutzer) | 4 bis 6 Std./Monat | einzelfallabhängig | 0 € / 9,99 € | Bindung, keine Erlöse |
| Restaurant | 4 bis 6 Std./Monat | +300 bis 1.600 €/Monat (Saison) | 39 € | 8 bis 40 |
| Verein | ≈ 5 Std./Monat Ehrenamt | 1.000 bis 16.000 € pro Förderantrag | 14,99 € | ein Antrag trägt Jahre |
| Handwerk/Handel | ≈ 4 Std./Monat | 200 bis 260 € Inhaberzeit | 39 € | 5 bis 7 |
| Ferienwohnung | 3 bis 4 Std./Monat | 84 bis 250 € je Direktbuchung | 39 € | 4 bis 8 |
| Kommune | ≈ 10 Std./Monat | Lizenz-Argument | Lizenz | – |

---

## 3. Strategische Thesen

1. **Inspiration ist der Vertrieb.** Bitkom: 49 % lehnen bezahlte KI ab, Hemmnis Nummer eins ist
   Unsicherheit [A1][A2]. Ein leeres Chatfeld verkauft nichts; eine Karte "Speisekarte digitalisieren
   inkl. Allergenen, ≈ 4 Std. gespart" schon. Jede Karte hat Ergebnis, Wertschätzung und einen Tap.
2. **Kontext schlägt Modell.** Die Aufgaben mit dem höchsten Wert nutzen Röbel-Daten (Veranstaltungen,
   Vereine, Speisekarten, Angebote, Abfuhr) und App-Aktionen (Beitrag, Veranstaltung, Anzeige). Genau das
   kann ein allgemeiner Chatbot nicht; deshalb sollte das Ranking Signale aus App-Daten bevorzugen
   (`org.no_menu`, `org.no_posts_30d`, `org.no_events`).
3. **Zeitpunkt ist die halbe Relevanz.** Saison (März bis Mai: Profil, Personal, Karte; Juni bis August:
   Regentag, Wetter, No-Shows; Herbst: Nebensaison, Azubis, Verträge; Dezember: Jahresrückblick,
   Kassenprüfung, Fristen), Förderfenster und bevorstehende Veranstaltungen sind die stärksten Signale.
4. **Routinen machen aus einem Versuch ein Abo.** Aufgaben mit "als Routine" (Mittagstisch jeden Montag,
   Wochenüberblick, Gäste-Tipps am Freitag) erzeugen wiederkehrenden Wert und damit Zahlungsgrund.
   Das Ranking gibt Routinen einen kleinen Bonus.
5. **Verkauft wird Ergebnis, nicht Token.** Organisationen zahlen für "deine Karte ist online, deine
   Bewertungen sind beantwortet, dein Antrag liegt vor" (entspricht STRATEGY "operated outcomes").
   Ein monatlicher Nutzen-Bericht aus `agent_actions` (gezählte Freigaben, geschätzte Stunden) ist die
   Verlängerungsbegründung.
6. **Freigabe als Vertrauensprodukt.** Jede öffentliche Aktion läuft über die Freigabe-Karte. Das ist
   gleichzeitig die redaktionelle Verantwortung nach AI Act Art. 50 Abs. 4 und die UWG-Bremse. Nie
   "Autopilot" bewerben; "Mecky bereitet vor, du entscheidest".
7. **Gutes tun ist ein eigener Wertstrom.** Nachbarschaftshilfe, Leistungs-Check, Vereinsanschluss,
   neutrale Meinungsbild-Erklärung erzeugen kein Geld, aber die Reichweite und das Vertrauen, auf dem
   das Org-Geschäft aufsetzt. Diese Aufgaben bleiben immer Free.
8. **Das Kostenmodell kippt mit lokaler KI.** Viele Aufgaben sind Routine-Textarbeit (Beiträge,
   Protokolle, Übersetzungen), die auf einem lokalen Modell (Route `bot-fast` über das Gateway) fast
   kostenlos wird. Solange Anthropic gehostet läuft, gehören Routinen mit Web-Recherche in Plus/Ultra
   oder in das Org-Abo.
9. **Ortis-fähig von Anfang an.** Der Katalog nutzt `{orgName}` und generische Signale; ortsbezogene
   Texte (Müritz, MV-Förderung) sollten beim zweiten Mandanten aus dem Tenant-Manifest kommen
   (`TenantConfig.facts`, Förderprogramme pro Bundesland).

---

## 4. Rechtliche Leitplanken (Arbeitshypothesen)

| Thema | Regel | Konsequenz im Produkt |
|---|---|---|
| AI Act Art. 50 | Chatbot-Hinweis ab 2.8.2026; KI-Texte zu Themen öffentlichen Interesses kennzeichnen, außer ein Mensch prüft und trägt redaktionelle Verantwortung; Bußgeld bis 15 Mio. € / 3 % [H1] | Mecky-Begrüßung nennt KI; öffentliche Beiträge nur über Freigabe; KI-Bilder kennzeichnen |
| UWG Bewertungen | gekaufte oder manipulierte Bewertungen sind stets unzulässig (Anhang Nr. 23c zu § 3 Abs. 3 UWG); Gegenleistung nur mit Kennzeichnung [H2]; Google verbietet Anreize ohnehin | keine Gutscheine für Bewertungen, keine Filterung "nur Zufriedene fragen" (Review Gating), Antworten ohne Gästedaten |
| UWG § 7 | Werbe-E-Mails nur mit Einwilligung, Bestandskunden-Ausnahme eng | `send_email` nur an Einwilligende; keine Kaltakquise-Aufgaben |
| RDG | Rechtsdienstleistung = rechtliche Prüfung des Einzelfalls in fremden Angelegenheiten; Chatbot-Grenze ungeklärt [H3] | "erklären, nicht entscheiden": Brief verständlich machen, Fristen nennen, Stelle nennen; kein Widerspruch "für dich" |
| StBerG §§ 2 bis 5 | Hilfe in Steuersachen nur durch Befugte [H4] | Kassenprüfung: Checklisten und Gliederung, Fragen an Steuerberater; keine Steuererklärung |
| LMIV | 14 Hauptallergene auch bei loser Ware, schriftliche Dokumentation [D5][D7] | Allergen-Vorschläge immer als Entwurf, Betreiber bestätigt; Haftung bleibt beim Betrieb |
| DSGVO | Mitgliederdaten, Gästedaten, Gesundheitsdaten (Pflege = Art. 9) | Org-Daten nur im Mandanten, AVV für Org-Abo; Gesundheitsangaben nicht in `remember` speichern, ohne Nachfrage |
| KUG/DSGVO Fotos | Personen auf Vereinsfotos | Design-Bot fragt bei Personen-Fotos nach Einwilligung |
| Meinungsbild | Abstimmungen heißen "Meinungsbild"; keine Wahlempfehlung | Erklär-Aufgaben sind ausdrücklich neutral |

---

## 5. Abo-These pro Stufe

Preisanker: KI-Zahler geben im Schnitt 20 €/Monat aus [A1]; Vereinssoftware 7 bis 42 € [C6];
Gastro-Online-Pflege 200 bis 400 € [D8]; Ortis-Marktband Verein 9 bis 19 €, Betrieb 19 bis 49 € (§6.1).

| Stufe | Preis | Für wen | Inhalt | Begründung |
|---|---|---|---|---|
| **Free** | 0 € | alle Bürger | alle "Gutes tun"- und Alltags-Aufgaben, 1 Routine, Tageskontingent (150k Token) | Distribution; Röbel ist Beweis-Motor, kein Erlöskanal; nie Paywall vor der ersten Aufgabe |
| **Plus** | 9,99 € | Vielnutzer, Familien | 10 Routinen, Web-Recherche-Routinen (Verträge, Wochenessen), 1,5 M Token | unter dem 20-€-Schnitt; realistisch 2 bis 5 % der aktiven Nutzer |
| **Ultra** | 29,99 € | Selbstständige, Power-User, Vorstände mit mehreren Rollen | unbegrenzte Routinen, lange Aufgaben (`start_task`), Marktbeobachtung, Förderradar, später Computer | in der 20-bis-30-€-Klasse, in der 43 % der Zahler liegen |
| **Betrieb** (neu) | **39 €/Monat** je Organisation; **Verein 14,99 €** (gemeinnützig) | Restaurants, Ferienwohnungen, Handwerk, Handel, Vereine | alle Org-Aufgaben, Org-Kontext für mehrere Mitglieder, Freigaben im Team, monatlicher Nutzen-Bericht, AVV | liegt bei 10 bis 20 % der Agentur-Anker und unter dem gemessenen Nutzen (§2); Verein unter easyVerein-Mittelklasse, damit es neben der Mitgliederverwaltung passt |
| Kommune | Lizenz | Amt, Stadt | Teil der Ortis-Lizenz (0,60 bis 1,00 € je Einwohner und Jahr) | B2G kauft jährlich, nie per In-App-Kauf |

Hinweise: (1) Org-Abos sollten über Web/Stripe laufen, nicht über In-App-Kauf (B2B, Rechnung mit USt,
keine 15 bis 30 % Store-Gebühr); das ist mit Apple-Richtlinien für B2B-Dienste abzugleichen. (2)
Einführungsmonat gratis mit drei vorgeschlagenen Aufgaben, danach Bericht "das hast du gespart".
(3) Kontingente je Stufe bestehen bereits (`quota.ts`); Betrieb erhält Ultra-Kontingent pro Org.

---

## 6. Was wir NICHT bauen

- **Bewertungen kaufen, schreiben oder filtern** (Review Gating, Fake-Bewertungen, Anreize) – UWG-Anhang Nr. 23b/23c.
- **Massen-Kaltakquise per E-Mail oder DM** – UWG § 7, und es beschädigt das Vertrauen im Ort.
- **Steuererklärungen, Buchhaltung, Lohnabrechnung** – StBerG; Anbieter wie DATEV und Steuerberater.
- **Rechtsbriefe für Dritte** (Widersprüche, Abmahnungen) – RDG; nur Erklären.
- **Kurtaxe, Meldeschein, Channel-Manager** – etablierte Anbieter (AVS, feratel, PMS), wenige Käufer.
- **Eigene Kasse oder Lieferplattform vor dem Kasse-Pilot 2027** – TSE-Pflicht, Ortis-Dokument §4.10.
- **Autopilot ohne Freigabe** für Öffentliches, Geld oder Externes.
- **Politische Empfehlungen** zu Meinungsbildern oder Wahlen.
- **Röbel Card** (abgelöst) und Formulierungen mit "CRC" (immer "Röbel Münzen").
- **Diagnosen** zu Gesundheit oder Pflege; nur Wege und Anlaufstellen.

---

## 7. Umsetzung im Code

- `apps/web/src/lib/chat/inspiration/catalog.ts`: `INSPIRATION_TASKS` (56 Aufgaben, alle sechs
  Zielgruppen, je ≥ 5), `SIGNALS` (Signal-Vokabular), `rankInspiration(tasks, signals, audience, limit)`.
- Ranking: nur passende Zielgruppe; Punkte = 10 × getroffene Signale + Wertart (Geld 3, Zeit 2, Gut 1)
  + 1 für Routine-fähig; stabile Reihenfolge; höchstens `ceil(limit/2)` Karten pro Bot, damit
  verschiedene Maskottchen erscheinen.
- Werkzeugnamen folgen Harness-Spec §4; `mcp_google_gmail_search` ist ein Platzhalter für den
  Google-Connector (Welle 3, gated).
- Signale erzeugt der Server: Profil (`user.*`), Org-Art und Datenlücken (`org.*`), Monat (`season=*`),
  Förderfenster (`deadline.grant_open`, gepflegt als Datum-Liste pro Mandant), nächste Veranstaltung.

## 8. Offene Punkte für Max

1. Betrieb-Preis 39 € / Verein 14,99 € bestätigen oder Einführungspreis wählen.
2. Soll Plus/Ultra für Bürger überhaupt verkauft werden, oder nur Betrieb (Ortis-Dokument §6.4 sagt "B2C bleibt frei")?
3. Förderfenster-Liste (Ehrenamtsstiftung, LEADER, Prototype Fund) als gepflegte Tabelle pro Mandant?
4. Nutzen-Bericht: welche Stundenschätzung pro Werkzeug gilt als "gespart"?
5. DVO (EU) 2025/891 zur Allergen-Darstellung vor jeder Aussage darüber prüfen.

---

## 9. Quellen (abgerufen 2026-09-26)

- [A1] Bitkom, Zahlungsbereitschaft für KI: https://www.bitkom.org/Presse/Presseinformation/Zahlungsbereitschaft-fuer-KI-erhoeht
- [A2] Bitkom Research, Künstliche Intelligenz 2025: https://bitkom-research.de/studien/kuenstliche-intelligenz-2025
- [B1] Bitkom, Senioren und Digitalisierung im Gesundheitswesen: https://www.bitkom.org/Presse/Presseinformation/Senioren-befuerworten-Digitalisierung-im-Gesundheitswesen
- [B2] regionalHeute, Digitalisierung und Einsamkeit (VdK): https://regionalheute.de/zwischen-bildschirm-und-einsamkeit-wie-senioren-den-anschluss-verlieren-1762084803-c/
- [B3] Entlastungsbetrag 131 €: https://www.bwpn.de/pflegenetzwerk/faq-items/wann-verfaellt-der-entlastungsbetrag/ · https://www.apotheken-umschau.de/pflege/pflege-zuhause/entlastungsbetrag-ansprueche-fuer-2026-besser-jetzt-noch-nutzen-1588063.html
- [B4] DIW, Nichtinanspruchnahme Grundsicherung: https://www.diw.de/de/diw_01.c.699957.de/publikationen/wochenberichte/2019_49_1/starke_nichtinanspruchnahme_von_grundsicherung_deutet_auf_hohe_verdeckte_altersarmut.html
- [B5] Röbel/Müritz, Einwohner und Übernachtungen: https://stadtistik.de/stadt/roebel-mueritz-13071124/ · https://www.mueritzportal.de/mueritzregion/staedte/roebel-mueritz.html
- [C1] ZiviZ-Survey 2023: https://www.ziviz.de/publikationen/ziviz-survey-2023-hauptbericht · https://www.deutsche-stiftung-engagement-und-ehrenamt.de/studienergebnisse/ziviz-survey-2023/
- [C2] Ehrenamtsstiftung MV: https://www.ehrenamtsstiftung-mv.de/nachrichten/Wegfall-Verwendungsnachweis/ · https://www.ehrenamtsstiftung-mv.de/gutes-tun-in-mv/foerdern/
- [C3] LEADER Regionalbudget Seenplatte: https://leader-mse.de/Regionalbudget/Richtlinien/ · https://www.lk-mecklenburgische-seenplatte.de/Angebote/Abfall-M%C3%BCll/Formulare/Nutzen-Sie-das-LEADER-Regionalbudget-zur-Umsetzung-Ihrer-Kleinprojekte-.php?object=tx,2761.5.1&ModID=7&FID=2761.14546.1&NavID=2761.57&La=1
- [C4] DSEE, Social Media für Vereine: https://www.deutsche-stiftung-engagement-und-ehrenamt.de/aktuelles/social-media-mit-effizienz-und-strategie-zu-mehr-reichweite/
- [C5] Pauschalen 2026: https://magazin.minijob-zentrale.de/uebungsleiterpauschale-ehrenamt-2026/
- [C6] easyVerein Preise: https://trusted.de/easyverein-kosten
- [D1] DEHOGA-Umfrage Personalmangel: https://www.tageskarte.io/zahlen/detail/dehoga-umfrage-80-prozent-der-hoteliers-und-gastronomen-beklagen-personalmangel.html · Zahlenspiegel IV/2025: https://www.dehoga-bundesverband.de/fileadmin/Startseite/04_Zahlen___Fakten/DEHOGA-Zahlenspiegel_4._Quartal_2025.pdf
- [D2] ZDF, Wirtschaft in MV (Müritz-Hotelier): https://www.zdfheute.de/politik/deutschland/landtagswahl-mecklenburg-vorpommern-wirtschaft-aufschwung-100.html
- [D3] Bewertungen und Umsatz: https://www.rollingpin.de/business/sterne-die-ueber-existenzen-entscheiden · https://sternehero.de/de/blog/google-bewertungen-statistiken
- [D4] No-Shows: https://www.hogapage.de/nachrichten/wirtschaft/gastronomie/no-shows-belasten-die-gastronomie-viele-g%C3%A4ste-reservieren-und-kommen-nicht/ · https://www.aleno.me/de/blog/no-show-restaurant
- [D5] Allergenkennzeichnung, Pflichten und DVO 2025/891: https://gastroinsider.de/blog/allergenkennzeichnung-gastronomie · https://www.bmleh.de/DE/themen/ernaehrung/lebensmittel-kennzeichnung/pflichtangaben/allergenkennzeichnung.html
- [D6] MwSt Gastronomie 2026: https://www.fuer-gruender.de/blog/gastro-mehrwertsteuer-2026-das-gilt-ab-1-januar/
- [D7] IHK Schwerin, Allergene in der Gastronomie: https://www.ihk.de/schwerin/standort-westmecklenburg/tourismus-und-gastgewerbe/rechtsfragen/kennzeichnung-von-allergenen-stoffen-in-der-gastronomie-6200314
- [D8] Kosten Online-Pflege Gastronomie: https://saschafix.de/wissen/blog-articles/restaurant-website-erstellen-lassen/ · https://agentur-gastronomie.de/social-media-marketing-gastronomie/
- [E1] ZDH, Bürokratiebelastung: https://www.zdh.de/ueber-uns/fachbereich-wirtschaft-energie-umwelt/sonderumfragen/sonderumfrage-buerokratiebelastung-im-handwerk/ · https://www.craftboxx.de/handwerker-blog/buerokratie-im-handwerk
- [E2] E-Rechnung Fristen: https://e-rechnungs-studio.de/de/e-rechnung-uebergangsregeln-2027-800000-2028 · https://www.etl.de/e-rechnung/regelungen-kleinunternehmer/
- [E3] Nachfolge MV: https://wirtschaft-mv.de/unternehmensnachfolge-als-schluessel-zur-sicherung-der-wirtschaft-in-der-mecklenburgischen-seenplatte/ · https://mv.ermoeglicher.de/de/ueber-uns/aktuelles/presse/dihk-report-unternehmensnachfolge-2025/
- [E4] HDE, Geschäftsschließungen 2025: https://einzelhandel.de/presse/aktuellemeldungen/14768-hde-prognose-zahl-der-geschaefte-sinkt-2025-um-4-500
- [F1] Booking-Provision und Direktbuchung: https://www.lodgify.com/de/guides/booking/kosten/ · https://www.lodgify.com/blog/de/direktbuchungen-ferienwohnung/
- [F2] Ferienwohnung-Verwaltung, Meldeschein: https://blog.easybooking.eu/ferienwohnung-verwaltung/ · https://www.lodgify.com/blog/de/feratel-gaestemeldung-fuer-ferienwohnungen/
- [F3] Tourismus MV 2025: https://www.hogapage.de/nachrichten/wirtschaft/tourismus/mecklenburg-vorpommern-verzeichnet-zweitbestes-tourismusjahr-seit-der-wende/
- [F4] Charter Müritz: https://www.charterpoint-mueritz.de/flotte/tagesboote.html
- [G1] Personalmangel Kommunen: https://www.klimaschutz-kommune.de/personalmangel-kommunale-daseinsvorsorge/ · https://www.dbb.de/artikel/dem-staat-fehlen-ueber-500000-beschaeftigte.html
- [G2] KI-Chatbots in Kommunen: https://www.behoerden-spiegel.de/2025/11/03/ki-chatbot-fuer-saarlaendische-kommunen/ · https://www.assono.de/blog/studie-zu-ki-in-kommunen-wie-verwaltungen-von-ki-loesungen-profitieren
- [H1] AI Act Art. 50: https://haerting.de/wissen/transparenzpflichten-in-der-ki-verordnung/ · https://die-tuev-akademie.de/blog/kennzeichnungspflicht-fuer-ki-inhalte-was-art-50-ai-act-tatsaechlich-verlangt
- [H2] Bewertungen und UWG: https://www.it-recht-kanzlei.de/gegenleistung-kundenbewertung-online-shop.html · https://www.anwalt.de/rechtstipps/gutschein-oder-rabatt-fuer-positive-bewertung-abmahnung-droht-194585.html
- [H3] RDG und KI-Chatbots: https://www.e-recht24.de/ki/13433-ki-rechtsberatung.html · https://anwaltsblatt.anwaltverein.de/de/themen/schwerpunkt/ki-rechtsdienstleistungsrecht
- [H4] StBerG § 5: https://www.steuertipps.de/gesetze/steuerberatungsgesetz-stberg/5-verbot-der-unbefugten-hilfeleistung-in-steuersachen-missbrauch-von-berufsbezeichnungen
