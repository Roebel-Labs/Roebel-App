-- Seed: Bürgerrat Röbel/Müritz 2026, 11 Empfehlungen als Diskussions-Threads.
-- Text source: docs/buergerrat/2026-empfehlungen.md (quoted from the brochure).
-- Runs as postgres via the Supabase MCP, so forum_threads_guard_official lets
-- the official fields through. Idempotent (fixed ids, ON CONFLICT DO NOTHING).

INSERT INTO public.forum_threads
  (id, wallet_address, account_id, category_slug, title, body, status, source, source_rank, source_score,
   source_citation, source_url, official_comment, stage, created_at, last_activity_at)
SELECT
  ('6b7e0000-2026-4a01-9000-0000000000' || lpad(r.rank::text, 2, '0'))::uuid,
  '0xc49de63ccfee46c6c5c3e393293f66779799fb28',
  -- Posted as the 'Stadt Röbel' organisation account (Max's decision, 2026-09-16);
  -- the wallet stays Max's so the owner-checked edit/delete RPCs still work.
  '07d8223c-0b94-46db-89d3-5b342980cd75',
  r.category,
  r.title,
  r.body,
  'published',
  'buergerrat',
  r.rank,
  r.score,
  'Bürgerräte für MV · Bürgerrat Röbel/Müritz · Broschüre 2026 (Abstimmung in der 4. Sitzung)',
  'https://www.ndr.de/nachrichten/mecklenburg-vorpommern/haff-mueritz/roebel-buergerrat-macht-vorschlaege-fuer-lebenswertere-innenstadt,mvregioneubrandenburg-5162.html',
  r.official_comment,
  'diskussion',
  timestamptz '2026-09-16 12:00:00+02' + make_interval(secs => 11 - r.rank),
  timestamptz '2026-09-16 12:00:00+02' + make_interval(secs => 11 - r.rank)
FROM (VALUES
  (1, 13, 'ortsentwicklung', 'Offenen Begegnungsort nach dem Vorbild des „Kugellagers“ schaffen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, einen Ort der Begegnung zu schaffen, der für alle Generationen attraktiv ist und verschiedene Funktionen erfüllt.

Vorschläge zur Umsetzung
• Die Qualitäten des ehemaligen „Kugellagers“ als Vorbild nutzen
• Geeignete Standorte ergebnisoffen prüfen
• Verschiedene Organisationsformen prüfen, z. B. eine Bürgergenossenschaft
• Möglichkeiten einer Mehrfachnutzung sowie einer schrittweisen Öffnung prüfen
• Bürgerinnen und Bürger frühzeitig zur Mitwirkung gewinnen

Wichtig sind insbesondere: gemütliche Atmosphäre, generationenübergreifende Nutzung, flexible Nutzungsmöglichkeiten, Musik, Kultur und Veranstaltungen, Café- bzw. Kneipencharakter, kleine Snacks, Billard, Dart, Tischkicker, Aufenthaltsqualität sowie Raum für Eigeninitiative und spontane Begegnungen.

Als ein zu prüfender Standort wurde unter anderem das „Vegas“ genannt.$b$, NULL),

  (2, 12, 'ortsentwicklung', 'Konzept gegen Leerstand', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, ein Konzept zu erarbeiten, das dem zunehmenden Leerstand von Gewerbeflächen entgegenwirkt und Möglichkeiten der Umnutzung in den Blick nimmt.

Vorschläge zur Umsetzung
• Forum für Gewerbetreibende einrichten
  – regelmäßiger Austausch zwischen den zuständigen Ämtern und Gewerbetreibenden
  – insbesondere Existenzgründer berücksichtigen und unterstützen
  – Erfahrungsaustausch mit ähnlichen Initiativen in nahegelegenen Städten
• Zwischennutzungen und alternative Versorgungsangebote unterstützen
  – zeitweise Nutzung leerstehender Räume, z. B. durch Pop-up-Cafés, Pop-up-Läden oder für kulturelle Zwecke
  – Automaten aufstellen, um ein Angebot an Grundnahrungsmitteln vorzuhalten
  – alternative Versorgungsangebote bewerben (z. B. Bäcker in Bollewick, der Bestellungen über Social Media annimmt, die samstags abgeholt werden können)
  – Discounter bei Baugenehmigung verpflichten, eine Zweigstelle in der Innenstadt zu eröffnen
  – planerische und baurechtliche Möglichkeiten prüfen
• Leerstehende Gewerbeflächen zu Wohnraum umnutzen
  – geeignete Flächen prüfen, um zusätzlichen Wohnraum für größere Familien und junge Menschen zu schaffen
• Verhältnis von Ferienwohnungen und Wohnraum prüfen
  – analysieren, wie groß der Verlust von dauerhaftem Wohnraum durch Ferienvermietung ist, und ggf. Maßnahmen zur Sicherung von Wohnraum ergreifen$b$,
   $c$Es gibt bereits einen halbjährlichen Unternehmerstammtisch und vor Saisonbeginn einen Stammtisch mit Hoteliers und Gastronomen. Außerdem arbeitet die Stadt an der Einführung einer Gutscheinkarte („Röbel Card“). Eine Zweckentfremdungssatzung ist bereits in Arbeit.$c$),

  (3, 12, 'gesundheit', 'Anreize für Fachärzte schaffen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Ansiedlung von Fachärzten mit gezielten Angeboten aktiv zu bewerben.
• Stadt als Betreiber des Medizinischen Versorgungszentrums (MVZ)
• Abstimmung mit dem Angebot in den nahegelegenen Städten
• Bedarf ist besonders groß in den Bereichen HNO, Orthopädie und Innere sowie bei Augenärzten und Zahnärzten

Vorschläge zur Umsetzung
• Attraktiven Wohnraum und Grundstücke anbieten
• Den Standort an geeigneten Orten und über geeignete Kanäle aktiv bewerben und dabei Lage, Lebensqualität und Vorteile der Region hervorheben
• Willkommensangebote prüfen, z. B. finanzielle oder organisatorische Unterstützung$b$, NULL),

  (4, 11, 'ortsentwicklung', 'Sauberkeit und Müllentsorgung', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Sauberkeit der Innenstadt durch bessere Strukturierung und Umsetzung der Müllentsorgung zu erhöhen und die Bevölkerung zu aktivieren, ihren Beitrag dazu zu leisten.

Vorschläge zur Umsetzung
• Müllstandorte besser ausstatten und strukturieren
  – regelmäßige Leerung und mehr Reinigungskapazitäten
  – zusätzliche Glas- und Papiercontainer, insbesondere in dicht bewohnten Gebieten (z. B. Gildekamp), auf dem Netto-Parkplatz und in touristisch genutzten Bereichen
  – Standorte müssen leicht erreichbar und gut einsehbar sein
  – Standorte auf Infotafeln der Stadt kennzeichnen
  – einfache Infotafeln mit Bildern und in leichter Sprache an den Müllplätzen
  – Tauschecken an den Müllplätzen
  – saisonale Schwankungen berücksichtigen: häufigere Leerung in Stoßzeiten und Ferien
  – ggf. Hinweisschilder zur Kameraüberwachung an Problemstellen
• Mehr öffentliche Abfallbehälter an stark frequentierten Orten
• Müllsammelaktionen und Beteiligung der Bevölkerung
  – regelmäßige, städtisch organisierte Müllsammelaktionen (inkl. Getränke/Snacks als Anerkennung)
  – Schulaktionen/-projekte: einmal pro Quartal Spielplätze von Müll befreien
  – Schulen, Familien und Vereine einbinden
• Anreizsysteme und ergänzende Maßnahmen
  – Taschenaschenbecher mit Stadtlogo über das Haus des Gastes an Touristen verteilen, u. a. über die Stadtführer
  – Aschenbecher an öffentlichen Mülleimern$b$, NULL),

  (5, 10, 'gesundheit', 'Die Umstrukturierung eines Fitnessstudios unterstützen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Umstrukturierung des Fitnessstudios in der Müritz-Therme zu unterstützen.

Folgende Bedarfe sind zu berücksichtigen:
• bezahlbare Mitgliedsbeiträge, ggf. Angebot von Rabatten
• moderne Trainingsmöglichkeiten
• Kursangebote
• Ansprechpartner vor Ort

Vorschläge zur Umsetzung
• Möglichkeiten der Zusammenarbeit mit bestehenden Sport- und Gesundheitseinrichtungen ausloten$b$, NULL),

  (6, 8, 'ortsentwicklung', 'Grünflächen und Pflege von Gehwegen verbessern', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Grünflächen sowie Spiel- und Freizeitflächen regelmäßig zu pflegen und an einigen Orten fehlende Bänke aufzustellen.

Vorschläge zur Umsetzung
• Regelmäßige Pflege von Grünflächen und Rückschnitt von Hecken (z. B. Warener Chaussee, Ringstraße, Innenhof, Schwarzer Weg)
  – Regelmäßige Pflege durch Stadtbauhof und Wohnungsgesellschaften, mit Rücksicht auf Vogelbrutzeiten
• Mehr Personal bzw. Unterstützung im Stadtbauhof, z. B. durch Bundesfreiwilligendienst (Bufdi) oder zusätzliche Unterstützungsstrukturen
• Grünpflege mit der Nachbarschaft in einzelnen Quartieren
  – wie früher der Wettbewerb „Unsere Stadt soll schöner werden“
  – Patenschaften für einzelne Grünflächen$b$, NULL),

  (7, 5, 'zusammenleben', 'Informations- und Kommunikationskanäle der Stadt ausbauen und stärken', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, verschiedene Möglichkeiten der Information und Kommunikation zu nutzen, auszubauen und zu stärken.

Vorschläge zur Umsetzung
• Die Mein-Ort-App als zentrale Informationsplattform für Röbel bekannter machen
• Informationen zusätzlich über Social Media, Presse, Litfaßsäulen sowie Aushänge in öffentlichen Einrichtungen, Apotheken und Supermärkten verbreiten
• Positive Beispiele und bestehende Angebote regelmäßig sichtbar machen
• Öffentlichkeitsarbeit der Stadt einbeziehen
• Unterschiedliche Kommunikationswege kombinieren
• Informationen niedrigschwellig und zielgruppengerecht bereitstellen$b$,
   $c$Die Röbel-App ist eine private Initiative; die Stadtverwaltung nutzt die Mein-Ort-App.$c$),

  (8, 5, 'zusammenleben', 'Begegnungsmöglichkeiten für alle Bevölkerungsgruppen unterstützen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, regelmäßige Begegnungsangebote zu unterstützen und den Austausch im Alltag zwischen allen Generationen zu fördern.

Vorschläge zur Umsetzung
• Mögliche Formate für Austausch und gemeinschaftliche Aktivitäten:
  – Gesprächsabende
  – gemeinsame Koch- und Backangebote
  – Spiele- und Themenabende
  – Technikaustausch zwischen Jung und Alt
  – generationenübergreifende Patenschaften
  – regelmäßiger Abend- oder Heimatmarkt mit Angeboten für alle Generationen
• Bestehende öffentliche Räume stärker für Begegnung nutzen

Positive Beispiele: mobiler Steinbrotbackofen, selbstorganisierter Krankenhaus-Ehemaligen-Treff in der Bibliothek, Nutzung öffentlicher Räume wie der Bibliothek.$b$, NULL),

  (9, 5, 'zusammenleben', 'Eigeninitiative und gemeinschaftliches Engagement stärken', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, Eigeninitiative und gemeinschaftliches Engagement zu fördern und zu unterstützen. Bürgerinnen und Bürger sollen ermutigt werden, Begegnungsangebote selbst zu organisieren und dafür vorhandene Räume und Netzwerke zu nutzen.

Vorschläge zur Umsetzung
• Bürgerinnen und Bürger ermutigen, selbst Veranstaltungen und Begegnungsangebote zu organisieren
• Niedrigschwellige Nutzung vorhandener Räume unterstützen
• Gegenseitige Unterstützung bei Organisation und Werbung
• Vereine, Initiativen und bestehende Netzwerke einbeziehen, z. B. Kulturverein, Seniorenbeirat und weitere Akteure
• Bedürfnisse der Bürgerinnen und Bürger regelmäßig aufgreifen
• Ehrenamtsbörse einrichten$b$,
   $c$Vereine können zu Beginn jedes Jahres Förderung für Projekte beantragen, die sich auf die Stadt Röbel beziehen. Dafür stehen jährlich insgesamt 33.000 Euro zur Verfügung. Darüber hinaus stehen bei der Partnerschaft für Demokratie jährlich rund 55.000 Euro zur Verfügung, um Vereine und Initiativen im Amtsbereich zu fördern.$c$),

  (10, 2, 'bildung', 'Jugendangebote beteiligungsorientiert und bedarfsgerecht weiterentwickeln und ausbauen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die bestehenden Jugendangebote gemeinsam mit Jugendlichen bedarfsgerecht weiterzuentwickeln. Gleichzeitig sollen sie durch bessere Öffentlichkeitsarbeit bekannter werden, damit mehr junge Menschen die vorhandenen Möglichkeiten nutzen.
• Jugendhaus und Jugendrat einbeziehen
• Möglichkeiten für ungezwungene Treffen (z. B. Dart, Billard, Musik)
• Positive Beispiele sichtbar machen

Vorschläge zur Umsetzung
• Jugendliche regelmäßig nach ihren Interessen und Bedürfnissen befragen
• Jugendliche an der Planung und Umsetzung neuer Angebote beteiligen
• Bestehende Treff- und Freizeitmöglichkeiten bedarfsgerecht weiterentwickeln
• Bestehende Angebote über Social Media, Presse, Öffentlichkeitsarbeit und weitere Kanäle bekannter machen
• Längere Öffnungszeiten durch ehrenamtliches Engagement oder Bundesfreiwilligendienstleistende$b$, NULL),

  (11, 2, 'gesundheit', 'Sport- und Freizeitmöglichkeiten weiterentwickeln', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Sport- und Freizeitflächen im Freien weiterzuentwickeln und auszubauen.
• Bedürfnisse aller Generationen berücksichtigen
• Gut erreichbare und attraktive Aufenthaltsorte schaffen
• Jugendrat und weitere Interessengruppen einbeziehen

Vorschläge zur Umsetzung
• Sportanlagen im Freien installieren (Sportboxwand, Trimm-Dich-Geräte, bewegliche Geräte)
  – mögliche Orte: Elefantenspielplatz, Schildkrötenspielplatz (Gildekamp)
  – Vorbild: Sportanlage im Stadtgarten
• Sichtbarkeit schaffen, Öffentlichkeitsarbeit (z. B. Ort auf Infotafeln der Stadt kennzeichnen)
• Den Boden des Basketballplatzes am Elefantenspielplatz erneuern
• Pfütze am Elefantenspielplatz mit Sand auffüllen, dabei das Wiedervernässungsprojekt berücksichtigen$b$, NULL)
) AS r(rank, score, category, title, body, official_comment)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.forum_thread_stage_events (id, thread_id, stage, note, occurred_at)
SELECT
  ('6b7e0000-2026-4a02-9000-0000000000' || lpad(t.source_rank::text, 2, '0'))::uuid,
  t.id,
  'diskussion',
  'Empfohlen vom Bürgerrat Röbel/Müritz (4. Sitzung, ' || t.source_score || ' Punkte); am 15.09.2026 der Stadtvertretung vorgestellt',
  timestamptz '2026-09-15 18:00:00+02'
FROM public.forum_threads t
WHERE t.source = 'buergerrat' AND t.source_rank BETWEEN 1 AND 11
ON CONFLICT (id) DO NOTHING;
