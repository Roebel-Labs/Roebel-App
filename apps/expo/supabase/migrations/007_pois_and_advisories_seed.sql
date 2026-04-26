-- ============================================================
-- SEED 7: POIs + advisories (German content from Nationalpark
-- Müritz, Stadt Röbel, Stadtbus 024, Zweirad-Flitzer, etc.)
-- Coordinates are approximate; admin can correct via web dashboard.
-- ============================================================

-- ─── Toiletten (Stadtbus 024 grid + harbor + therme) ──────────
INSERT INTO pois (type, name_de, description_de, lat, lon, address, opening_hours_de, is_active)
VALUES
  ('toilet', 'Öffentliche Toilette Stadthafen', 'WC am Stadthafen Röbel, direkt an der Müritzpromenade.', 53.3692, 12.5898, 'Müritzpromenade, 17207 Röbel', 'Mai – Okt: 08–22 Uhr', true),
  ('toilet', 'WC Müritztherme', 'Toilette im Foyer der Müritztherme. Auch ohne Eintritt nutzbar.', 53.3680, 12.6037, 'Strandstraße 1, 17207 Röbel', 'Mo–So 09–22 Uhr', true),
  ('toilet', 'Toilette ZOB / Bahnhofstraße', 'Öffentliche Toilette beim ZOB.', 53.3678, 12.6105, 'Bahnhofstraße, 17207 Röbel', '24h', true),
  ('toilet', 'WC Marktplatz / Rathaus', 'Öffentliches WC im Bereich Marktplatz Röbel.', 53.3666, 12.5994, 'Marktplatz, 17207 Röbel', '08–20 Uhr', true),
  ('toilet', 'Strandbad Seebadstraße', 'Sanitäranlagen am Strandbad Marienfelde.', 53.3613, 12.5973, 'Seebadstraße, 17207 Röbel', 'Mai – Sept: 09–20 Uhr', true),
  ('toilet', 'WC Stadthafen Waren', 'Öffentliche Toilette im Hafen Waren.', 53.5196, 12.6837, 'Strandstraße, 17192 Waren (Müritz)', 'Saison: 08–22 Uhr', true);

-- ─── Trinkwasser-Stationen ────────────────────────────────────
INSERT INTO pois (type, name_de, description_de, lat, lon, address, opening_hours_de, is_active)
VALUES
  ('drinking_water', 'Trinkbrunnen Müritzpromenade', 'Kostenlose Wasserstelle direkt an der Promenade.', 53.3690, 12.5900, 'Müritzpromenade, 17207 Röbel', 'Mai – Okt', true),
  ('drinking_water', 'Wasserspender Marktplatz', 'Trinkwasser am Marktplatz Röbel.', 53.3667, 12.5996, 'Marktplatz, 17207 Röbel', 'ganzjährig', true),
  ('drinking_water', 'Trinkbrunnen Müritztherme', 'Wasserspender außerhalb der Therme.', 53.3679, 12.6035, 'Strandstraße 1, 17207 Röbel', 'ganzjährig', true);

-- ─── Fahrradverleih + 24h Pannendienst ────────────────────────
INSERT INTO pois (
  type, name_de, description_de, lat, lon, address, phone, website,
  opening_hours_de, is_24h, is_pannendienst, is_active
) VALUES
  ('bike_repair', 'Zweirad-Flitzer Röbel-Marienfelde',
    'Fahrradverleih und 24h Pannendienst mit Abhol- und Bringservice. Räder ab 7 € pro Tag.',
    53.3608, 12.5990, 'Seebadstr. 48, 17207 Röbel', '+49 160 7908268',
    'https://www.zweirad-flitzer.de', 'Saison: Mo–So 09–18 Uhr · Pannendienst 24/7',
    true, true, true),
  ('bike_repair', 'Fahrrad Starck',
    'Shimano-zertifiziertes Service Center. Reparatur, Inspektion, Verkauf.',
    53.3669, 12.6005, 'Pferdemarkt 10, 17207 Röbel', '+49 39931 51234',
    NULL, 'Mo–Fr 09–18 Uhr · Sa 09–13 Uhr', false, false, true),
  ('bike_rental', 'Marina Röbel-Seglerverein',
    'Fahrradverleih am Hafen. Direkt an der Müritzpromenade.',
    53.3692, 12.5895, 'Müritzpromenade 20, 17207 Röbel', '+49 39931 839900',
    NULL, 'Saison: Mo–So 08–18 Uhr', false, false, true),
  ('bike_rental', 'Fahrradverleih Adlerhorst Ludorf',
    'Verleih in Ludorf direkt an der Tour um die Müritz.',
    53.3989, 12.6228, 'Röbeler Straße 6, 17207 Ludorf',
    '+49 39931 129167', NULL, 'Saison: Mo–So 09–18 Uhr', false, false, true),
  ('bike_rental', 'Fahrradverleih Boek "Am Gutshaus"',
    'Verleih im Müritz-Nationalpark. Idealer Startpunkt für die Vogelbeobachtung.',
    53.4392, 12.7889, 'Boeker Hauptstraße 8, 17209 Boek', '+49 39823 27064',
    NULL, 'Saison: Mo–So 09–17 Uhr', false, false, true),
  ('bike_rental', 'Feriendorf Bolter Kanal',
    'Fahrradverleih am Bolter Kanal mit Schiffsanleger.',
    53.4083, 12.7333, 'Am Müritzufer 5, 17248 Rechlin', '+49 39823 5230',
    NULL, 'Saison: Mo–So 09–18 Uhr', false, false, true),
  ('bike_rental', 'Kiosk Boek Fahrradstation',
    'Fahrradstation und Verleih in Boek, Snacks und Getränke.',
    53.4396, 12.7895, 'Boeker Hauptstraße, 17209 Boek', NULL, NULL,
    'Saison: Mo–So 08–18 Uhr', false, false, true);

-- ─── Schwimmstellen (mit Live-Status) ─────────────────────────
INSERT INTO pois (
  type, name_de, description_de, lat, lon, address,
  status, status_note_de, status_updated_at, status_source_de,
  meta, is_active
) VALUES
  ('swim_spot', 'Strandbad Röbel-Marienfelde',
    'Bewachte Badestelle mit Sandstrand und Liegewiese. Familien­freundlich.',
    53.3608, 12.5980, 'Seebadstraße, 17207 Röbel',
    'swim_green', 'Wasserqualität ausgezeichnet (letzte Probe 22.04.2026).',
    NOW(), 'badewasser-mv.de',
    '{"supervised": true, "depth_m": 1.2, "parking": true, "shallow_zone": true, "fee_eur": 0}'::jsonb,
    true),
  ('swim_spot', 'Müritz Stadthafen Röbel',
    'Beliebte Badestelle direkt am Hafen. Anfahrt zu Fuß vom Marktplatz in 5 min.',
    53.3699, 12.5912, 'Stadthafen, 17207 Röbel',
    'swim_yellow', 'Erhöhte Wassertemperatur (>20 °C) — leichte Blaualgen-Wachsamkeit.',
    NOW(), 'manuell · Mecky-Team',
    '{"supervised": false, "depth_m": 0.8, "parking": false}'::jsonb,
    true),
  ('swim_spot', 'Klink Sandstrand',
    'Großer Sandstrand am Westufer der Müritz. An der Tour um die Müritz gelegen.',
    53.5006, 12.6411, 'Strandstraße, 17192 Klink',
    'swim_green', 'Wasserqualität ausgezeichnet.', NOW(), 'badewasser-mv.de',
    '{"supervised": true, "depth_m": 1.5, "parking": true, "shallow_zone": true}'::jsonb,
    true),
  ('swim_spot', 'Großer Schwerin (NSG)',
    'Naturschutzgebiet — Baden nur an markierten Stellen. Eindrücke der Vogelwelt.',
    53.4067, 12.6492, '17207 Ludorf',
    'swim_yellow', 'Achte auf Hinweisschilder. Mecky-Tipp: Vögel nicht stören.',
    NOW(), 'manuell · Mecky-Team',
    '{"supervised": false, "is_nature_reserve": true}'::jsonb,
    true),
  ('swim_spot', 'Kleine Müritz Rechlin',
    'Badestelle bei Rechlin. Mecky-Hinweis: 2022 lag hier ein Badeverbot vor – aktuell prüfen.',
    53.3608, 12.7050, 'Am Müritzufer, 17248 Rechlin',
    'swim_red', 'Aktuelle Probe zeigt erhöhte E.coli-Werte. Mecky empfiehlt: Lieber nicht.',
    NOW(), 'badewasser-mv.de',
    '{"supervised": false, "warn_history": "2022 Badeverbot"}'::jsonb,
    true);

-- ─── Indoor-Alternativen (Schlechtwetter) ─────────────────────
INSERT INTO pois (
  type, name_de, description_de, lat, lon, address, phone, website,
  opening_hours_de, has_gaestekarte_discount, is_active
) VALUES
  ('indoor_alternative', 'Müritzeum Waren',
    'Naturerlebniszentrum mit Deutschlands größtem Süßwasseraquarium. Familienfreundlich.',
    53.5176, 12.6790, 'Zur Steinmole 1, 17192 Waren', '+49 3991 633680',
    'https://www.mueritzeum.de', 'Mo–So 10–19 Uhr (Saison)', true, true),
  ('indoor_alternative', 'Müritztherme Röbel',
    'Wellness- und Erlebnisbad mit Sauna. Vergünstigt mit Gästekarte (dat Bus).',
    53.3680, 12.6037, 'Strandstraße 1, 17207 Röbel', '+49 39931 803680',
    'https://www.mueritztherme.de', 'Mo–So 10–22 Uhr', true, true),
  ('indoor_alternative', 'Engelsche Mühle Röbel',
    'Historische Mühle mit Mühlenmuseum und Café. Trockener Rückzugsort bei Regen.',
    53.3669, 12.5970, 'Mühlenstraße 8, 17207 Röbel', NULL, NULL,
    'Mai – Okt: Di–So 11–17 Uhr', false, true),
  ('indoor_alternative', 'Schliemann-Museum Ankershagen',
    'Heinrich-Schliemann-Museum: Trojaner­geschichte und Trojanisches Pferd zum Anfassen.',
    53.4750, 12.8731, 'Lindenallee 1, 17219 Ankershagen', '+49 39921 30255',
    'https://www.schliemann-museum.de', 'Di–So 10–18 Uhr', false, true),
  ('indoor_alternative', 'Marienkirche Röbel (Turmaufstieg)',
    'Aussichtsplattform auf 58 m. Bei jedem Wetter spannend (überdachter Aufgang).',
    53.3654, 12.5969, 'Kirchplatz, 17207 Röbel', NULL, NULL,
    'Mai – Okt: Mo–Sa 11–17 Uhr', false, true);

-- ─── Touristeninformationen ───────────────────────────────────
INSERT INTO pois (
  type, name_de, description_de, lat, lon, address, phone, email, website,
  opening_hours_de, is_active
) VALUES
  ('tourist_info', 'Tourist-Information Röbel · Haus des Gastes',
    'Zentrale Tourist-Information für Röbel. Kurabgabe, Gästekarten, Kartenmaterial.',
    53.3672, 12.5985, 'Straße der Deutschen Einheit 7, 17207 Röbel',
    '+49 39931 5380', 'info@roebel-mueritz.de', 'https://www.roebel-mueritz.de',
    'Mo–Fr 09–17 Uhr · Sa 10–13 Uhr', true),
  ('tourist_info', 'Nationalparkinformation Federow',
    'Information des Müritz-Nationalparks. Live-Webcam Fischadler­nest ab April.',
    53.4783, 12.7367, 'Damerower Straße 1, 17192 Federow', '+49 39991 668849',
    NULL, 'https://www.mueritz-nationalpark.de',
    'Saison: Mo–So 09–18 Uhr', true),
  ('tourist_info', 'Touristinformation Waren',
    'Tourist-Info am Markt Waren. Veranstaltungs­tickets und Schiffsfahrten.',
    53.5208, 12.6826, 'Lange Straße 1, 17192 Waren', '+49 3991 666183',
    NULL, 'https://www.waren-tourismus.de',
    'Mo–Fr 09–18 Uhr · Sa 10–14 Uhr', true);

-- ─── Apotheken (für medizinische Hilfe) ───────────────────────
INSERT INTO pois (
  type, name_de, description_de, lat, lon, address, phone,
  opening_hours_de, is_active
) VALUES
  ('pharmacy', 'Adler-Apotheke Röbel',
    'Apotheke im Stadtzentrum.', 53.3667, 12.5993, 'Marktplatz 5, 17207 Röbel',
    '+49 39931 51247', 'Mo–Fr 08–18 Uhr · Sa 08–13 Uhr', true),
  ('pharmacy', 'Müritz-Apotheke',
    'Apotheke nahe Müritztherme.', 53.3683, 12.6022, 'Bahnhofstraße 12, 17207 Röbel',
    '+49 39931 51999', 'Mo–Fr 08–18:30 Uhr · Sa 08–12 Uhr', true);

-- ─── Beobachtungsstände im Müritz-Nationalpark ────────────────
-- (Vorbereitung für Feature 1 — Schatzsuche; bereits jetzt auf der Karte sichtbar)

INSERT INTO pois (
  type, name_de, description_de, lat, lon, address,
  meta, is_active
) VALUES
  ('observation_stand', 'Vogelbeobachtungsturm Schnakenburg',
    'Beobachtungsturm. Bekannt für Singschwäne von Dez bis Mär.',
    53.4831, 12.7194, 'Müritz-Nationalpark, bei Federow',
    '{"main_species_de": "Singschwäne", "best_months": "Dez–Mär"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Viertwiese',
    'Kraniche im Frühjahr und Herbst beobachten.',
    53.4905, 12.7286, 'Müritz-Nationalpark',
    '{"main_species_de": "Kranich", "best_months": "Mär–Apr, Sep–Nov"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Zartwitzer Fischteiche',
    'Wasservögel und Seeadler an den Fischteichen.',
    53.4500, 12.7820, 'Müritz-Nationalpark, Zartwitz',
    '{"main_species_de": "Wasservögel, Seeadler", "best_months": "ganzjährig"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Amalienhof',
    'Wasservögel auf den Wiesen bei Amalienhof.',
    53.4647, 12.7567, 'Müritz-Nationalpark',
    '{"main_species_de": "Wasservögel", "best_months": "Mär–Okt"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Boeker Mühle',
    'Wasservögel und gelegentlich Seeadler.',
    53.4350, 12.7650, 'Müritz-Nationalpark, Boek',
    '{"main_species_de": "Wasservögel", "best_months": "Apr–Okt"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Specker Hofsee',
    'Bekannt für Silberreiher.',
    53.5050, 12.7200, 'Müritz-Nationalpark, Speck',
    '{"main_species_de": "Silberreiher", "best_months": "Aug–Okt"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Warener Hauswiesen',
    'Hotspot für Kraniche im Herbst.',
    53.5180, 12.7000, 'Müritz-Nationalpark',
    '{"main_species_de": "Kranich", "best_months": "Sep–Nov"}'::jsonb, true),
  ('observation_stand', 'Vogelbeobachtungsturm Rederangsee',
    'Der Showpiece-Stand. Bis zu 8.000 Kraniche gleichzeitig im Oktober. Mecky-Tipp: Mitte Aug – Okt nur mit Ranger­führung 16–dunkel; früh morgens kostenfrei zugänglich.',
    53.5067, 12.6900, 'Müritz-Nationalpark, Rederangsee',
    '{"main_species_de": "Kranich, Seeadler", "best_months": "Sep–Nov", "access_restriction_de": "16h–Dämmerung nur mit Ranger­führung (Aug–Okt)"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Federow',
    'Live-Webcam auf einem Fischadlernest. Erste Küken ca. Mitte Mai.',
    53.4783, 12.7367, 'Müritz-Nationalpark, Federow',
    '{"main_species_de": "Fischadler", "best_months": "Mär–Sep", "has_webcam": true}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Warnker See Nord',
    'Enten, Adler und Silberreiher.',
    53.4680, 12.6850, 'Müritz-Nationalpark',
    '{"main_species_de": "Enten, Seeadler, Silberreiher", "best_months": "Aug–Okt"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Warnker See Süd',
    'Hotspot für Wasservögel.',
    53.4630, 12.6890, 'Müritz-Nationalpark',
    '{"main_species_de": "Enten, Seeadler", "best_months": "Aug–Okt"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Serrahnsee',
    'Adler und Kraniche.',
    53.3303, 13.1500, 'Serrahn (UNESCO-Buchenwald)',
    '{"main_species_de": "Seeadler, Kranich", "best_months": "Sep–Nov"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Specker See',
    'Beobachtung von Wasservögeln.',
    53.5008, 12.7095, 'Müritz-Nationalpark',
    '{"main_species_de": "Wasservögel", "best_months": "Apr–Okt"}'::jsonb, true),
  ('observation_stand', 'Beobachtungsstand Binnenmüritz',
    'Direkter Blick auf die Binnenmüritz.',
    53.4900, 12.6700, 'Müritz-Nationalpark',
    '{"main_species_de": "Wasservögel", "best_months": "ganzjährig"}'::jsonb, true);

-- ─── Tier-2 Aussichtspunkte ───────────────────────────────────
INSERT INTO pois (
  type, name_de, description_de, lat, lon, address, opening_hours_de, meta, is_active
) VALUES
  ('viewpoint', 'Käflingsbergturm',
    '55 m hoher Turm, Aussichtsplattform auf 31 m, 167 Stufen, 360°-Blick über Nationalpark und Havelquellgebiet.',
    53.4467, 12.9117, 'Müritz-Nationalpark', 'Mai – Okt: 10–18 Uhr',
    '{"height_m": 55, "platform_m": 31, "stairs": 167}'::jsonb, true),
  ('viewpoint', 'Aussichtspunkt Hofsee Speck',
    '800 Jahre alte Sommerlinde am Hofsee. Ruhiger Aussichtspunkt.',
    53.5025, 12.7042, 'Speck, Müritz-Nationalpark', 'ganzjährig',
    '{"feature_de": "800 Jahre alte Sommerlinde"}'::jsonb, true),
  ('viewpoint', 'Moorsteg Wienpietschseen',
    'Bohlensteg über die Wienpietschseen — Moorlandschaft hautnah.',
    53.4517, 12.8050, 'Müritz-Nationalpark', 'ganzjährig',
    '{}'::jsonb, true),
  ('viewpoint', 'Schutzhütte Klink',
    'Aussichtsplatz mit Schutzhütte am Ostufer.',
    53.5007, 12.6422, 'Klink', 'ganzjährig',
    '{}'::jsonb, true),
  ('viewpoint', 'Havelquelle Ankershagen',
    'Quellgebiet der Havel. Familienfreundlicher Stopp.',
    53.4733, 12.8717, 'Ankershagen', 'ganzjährig',
    '{}'::jsonb, true),
  ('viewpoint', 'Wildpark Boek',
    'Wildpark mit heimischen Arten — Rotwild, Damwild, Wildschweine.',
    53.4408, 12.7900, 'Boek, Müritz-Nationalpark', 'Mo–So 09–18 Uhr',
    '{}'::jsonb, true),
  ('viewpoint', 'Stadthafen Röbel',
    'Hafen Röbel mit Promenade und Anleger der Weissen Flotte.',
    53.3692, 12.5898, '17207 Röbel', 'ganzjährig',
    '{}'::jsonb, true),
  ('viewpoint', 'Marktplatz Röbel · Altstadt',
    'Historische Altstadt mit Fachwerkhäusern.',
    53.3666, 12.5994, '17207 Röbel', 'ganzjährig',
    '{}'::jsonb, true);

-- ─── Tagesempfehlungen (heutiges Datum als Beispiel) ──────────
INSERT INTO daily_advisories (advisory_date, type, level, message_de, recommendation_de)
VALUES
  (CURRENT_DATE, 'mosquito', 'mittel',
    'Mücken heute mittel — vor allem an Schilf­ufern abends.',
    'Mecky-Tipp: Lange Kleidung am Abend, Mückenspray auf der Radtour einpacken.'),
  (CURRENT_DATE, 'tick', 'hoch',
    'Zecken aktiv — gerade in Hochgras- und Waldsaum­regionen.',
    'Repellent vor jeder Wald- oder Wiesentour. Nach der Tour: Körpercheck.'),
  (CURRENT_DATE, 'cyanobacteria', 'niedrig',
    'Blaualgen: derzeit kein erhöhtes Risiko.',
    'Bei Wassertemperaturen über 20 °C ändert sich das schnell — vor dem Bad kurz checken.'),
  (CURRENT_DATE, 'sun', 'mittel',
    'UV-Index 5 — Sonnenschutz empfehlenswert.',
    'Mecky empfiehlt: LSF 30, Hut auf Touren über Mittag.');
