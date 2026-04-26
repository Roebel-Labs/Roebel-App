-- ============================================================
-- SEED 8: Transit (Linie 12, Stadtbus 024, Nationalpark-Linien 9/10,
-- Elli-Bus, Weisse Flotte Müritz MS Diana / MS Fontane).
-- ============================================================

-- ─── Lines ────────────────────────────────────────────────────

INSERT INTO transit_lines (
  code, name_de, mode, operator_de,
  free_with_gaestekarte, carries_bikes, bike_fee_eur,
  fare_de, season_window_de, website, notes_de, is_active
) VALUES
  ('12',
    'Linie 12 · Neubrandenburg ↔ Waren ↔ Röbel',
    'bus_regio',
    'MVVG / dat Bus',
    true, true, 0,
    'Kostenfrei mit Gästekarte (01.04. – 31.10.)',
    '01.04. – 31.10.',
    'https://www.mvvg-bus.de',
    'Bis zu 16 Räder Mo–Fr; an Wochenenden kein Fahrradtransport zwischen Waren und Neubrandenburg.',
    true),

  ('024',
    'Kleiner Stadtverkehr Röbel · Linie 024',
    'bus_city',
    'Stadt Röbel · MVVG',
    false, false, NULL,
    '1 € Festpreis (von der Stadt Röbel subventioniert)',
    'ganzjährig (Mo–Sa, kein So/Feiertag)',
    'https://www.mvvg-bus.de',
    '5 Rundfahrten täglich Mo–Sa: 09:08, 10:08, 12:08, 14:08, 16:08 ab Röbel Bahnhofstraße/Therme. Eine Rundfahrt ca. 38 min. Keine Fahrradmitnahme.',
    true),

  ('NPL-9',
    'Nationalpark-Linie 9 · Waren → Federow → Boek',
    'bus_park',
    'MVVG · Müritz-Nationalpark',
    true, true, 0,
    'Kostenfrei mit Gästekarte',
    'Mai – Oktober',
    'https://www.mueritz-nationalpark.de',
    'Mit Fahrradanhänger. Direkte Anbindung Waren–Röbel durch den Park.',
    true),

  ('NPL-10',
    'Nationalpark-Linie 10 · Waren → Speck → Schwarzenhof',
    'bus_park',
    'MVVG · Müritz-Nationalpark',
    true, true, 0,
    'Kostenfrei mit Gästekarte',
    'Mai – Oktober',
    'https://www.mueritz-nationalpark.de',
    'Mit Fahrradanhänger.',
    true),

  ('Elli',
    'Elli-Bus · Bürgerbus Elde-Quellgebiet',
    'buergerbus',
    'Nachbarschaftsfahrdienst Elde-Quellgebiet e.V.',
    false, false, NULL,
    'Kostenfrei (Spende willkommen)',
    'ganzjährig',
    NULL,
    'Mecky-Tipp: Ehrenamtlich gefahrenes Elektroauto · Mo–Fr 07–18 Uhr · Reservierung Mo–Fr 10–14 Uhr unter 0151 63 45 97 59 oder info@elli-bus.de · Wochenende & Abend nach Absprache.',
    true),

  ('MS-Diana',
    'MS Diana · Weisse Flotte Müritz',
    'ferry',
    'Weisse Flotte Müritz GmbH',
    false, true, 3,
    'Tickets ab Stadthafen Röbel · Fahrradmitnahme 3 €',
    '18.04. – Anfang Oktober (Mo–Sa)',
    'https://www.mueritzschiff.de',
    'Barrierefrei · 300 Personen · 3-/4-/5-/7-Seenfahrt sowie Tagesfahrt zur Schlossinsel Mirow.',
    true),

  ('MS-Fontane',
    'MS Fontane · Müritz Sail / Eventfahrten',
    'ferry',
    'Weisse Flotte Müritz GmbH',
    false, true, 3,
    'Eventfahrt-Tickets',
    'Mai – September (Eventbasis)',
    'https://www.mueritzschiff.de',
    'Eventschiff für Müritz Sail (Christi Himmelfahrt) und Sonderfahrten.',
    true);

-- Mark Elli-Bus as electric volunteer service
UPDATE transit_lines
SET is_electric = true, is_volunteer = true,
    call_phone = '+49 151 63459759',
    call_email = 'info@elli-bus.de',
    call_window_de = 'Mo–Fr 10–14 Uhr für Reservierung'
WHERE code = 'Elli';

-- ─── Stops ────────────────────────────────────────────────────

-- Linie 12 (key stops Röbel ↔ Waren)
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Röbel · ZOB Bahnhofstraße', 53.3678, 12.6105, 1 FROM transit_lines WHERE code = '12';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Röbel · Müritzpromenade / Hafen', 53.3692, 12.5898, 2 FROM transit_lines WHERE code = '12';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Ludorf · Schloß', 53.3989, 12.6228, 3 FROM transit_lines WHERE code = '12';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Klink · Sandstrand', 53.5006, 12.6411, 4 FROM transit_lines WHERE code = '12';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Waren · Bahnhof', 53.5180, 12.6900, 5 FROM transit_lines WHERE code = '12';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Waren · Markt / Tourist-Info', 53.5208, 12.6826, 6 FROM transit_lines WHERE code = '12';

-- Linie 024 (Stadtbus Röbel)
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Bahnhofstraße / Müritztherme', 53.3680, 12.6037, 1 FROM transit_lines WHERE code = '024';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'ZOB', 53.3678, 12.6105, 2 FROM transit_lines WHERE code = '024';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Altstadt / Marktplatz', 53.3666, 12.5994, 3 FROM transit_lines WHERE code = '024';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Stadthafen Röbel', 53.3692, 12.5898, 4 FROM transit_lines WHERE code = '024';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Marienfelde Schloß', 53.3608, 12.5828, 5 FROM transit_lines WHERE code = '024';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Schulstraße', 53.3656, 12.6010, 6 FROM transit_lines WHERE code = '024';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Gildekamp', 53.3683, 12.6024, 7 FROM transit_lines WHERE code = '024';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Seebadstraße / Strandbad', 53.3613, 12.5973, 8 FROM transit_lines WHERE code = '024';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Beim Müritzfischer', 53.3697, 12.5910, 9 FROM transit_lines WHERE code = '024';

-- Nationalpark-Linie 9
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Waren · Bahnhof', 53.5180, 12.6900, 1 FROM transit_lines WHERE code = 'NPL-9';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Federow · Nationalparkinformation', 53.4783, 12.7367, 2 FROM transit_lines WHERE code = 'NPL-9';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Boek · Wildpark', 53.4408, 12.7900, 3 FROM transit_lines WHERE code = 'NPL-9';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Bolter Kanal · Schiffsanleger', 53.4083, 12.7333, 4 FROM transit_lines WHERE code = 'NPL-9';

-- Nationalpark-Linie 10
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Waren · Bahnhof', 53.5180, 12.6900, 1 FROM transit_lines WHERE code = 'NPL-10';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Kargow', 53.5050, 12.7900, 2 FROM transit_lines WHERE code = 'NPL-10';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Speck · Aussichtspunkt Hofsee', 53.5025, 12.7042, 3 FROM transit_lines WHERE code = 'NPL-10';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Schwarzenhof', 53.4800, 12.7150, 4 FROM transit_lines WHERE code = 'NPL-10';

-- MS Diana
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Stadthafen Röbel · Anleger', 53.3692, 12.5898, 1 FROM transit_lines WHERE code = 'MS-Diana';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Klink · Anleger', 53.5006, 12.6411, 2 FROM transit_lines WHERE code = 'MS-Diana';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Waren · Stadthafen', 53.5196, 12.6837, 3 FROM transit_lines WHERE code = 'MS-Diana';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Bolter Kanal · Anleger', 53.4083, 12.7333, 4 FROM transit_lines WHERE code = 'MS-Diana';
INSERT INTO transit_stops (line_id, name_de, lat, lon, stop_order)
SELECT id, 'Mirow · Schlossinsel', 53.2756, 12.8208, 5 FROM transit_lines WHERE code = 'MS-Diana';

-- ─── Departures ───────────────────────────────────────────────

-- Linie 024 — 5 Rundfahrten Mo–Sa von Bahnhofstraße/Therme
INSERT INTO transit_departures (line_id, stop_id, service_days, departure_time, arrival_time, destination_de, trip_label_de, is_last_of_day)
SELECT
  l.id,
  s.id,
  'mo,tu,we,th,fr,sa',
  d.dep_time::time,
  d.arr_time::time,
  'Marienfelde Schloß ↔ ZOB',
  'Stadt-Rundfahrt',
  d.is_last
FROM transit_lines l
JOIN transit_stops s ON s.line_id = l.id AND s.stop_order = 1
CROSS JOIN (VALUES
  ('09:08', '09:46', false),
  ('10:08', '10:46', false),
  ('12:08', '12:46', false),
  ('14:08', '14:46', false),
  ('16:08', '16:46', true)
) AS d(dep_time, arr_time, is_last)
WHERE l.code = '024';

-- Linie 12 — Auswahl Abfahrten ab Röbel ZOB Richtung Waren (Saison)
INSERT INTO transit_departures (line_id, stop_id, service_days, season_start, season_end, departure_time, destination_de, trip_label_de, is_last_of_day)
SELECT
  l.id,
  s.id,
  'mo,tu,we,th,fr,sa,su',
  '2026-04-01'::date,
  '2026-10-31'::date,
  d.dep_time::time,
  'Waren ↔ Neubrandenburg',
  'Linie 12',
  d.is_last
FROM transit_lines l
JOIN transit_stops s ON s.line_id = l.id AND s.stop_order = 1
CROSS JOIN (VALUES
  ('06:35', false),
  ('08:30', false),
  ('10:30', false),
  ('12:30', false),
  ('14:30', false),
  ('16:30', false),
  ('18:30', true)
) AS d(dep_time, is_last)
WHERE l.code = '12';

-- Nationalpark-Linie 9 — Auswahl ab Waren
INSERT INTO transit_departures (line_id, stop_id, service_days, season_start, season_end, departure_time, destination_de, trip_label_de, is_last_of_day)
SELECT
  l.id, s.id,
  'mo,tu,we,th,fr,sa,su',
  '2026-05-01'::date, '2026-10-31'::date,
  d.dep_time::time,
  'Boek · Bolter Kanal',
  'Nationalpark-Linie 9',
  d.is_last
FROM transit_lines l
JOIN transit_stops s ON s.line_id = l.id AND s.stop_order = 1
CROSS JOIN (VALUES
  ('09:00', false),
  ('11:30', false),
  ('14:00', false),
  ('17:00', true)
) AS d(dep_time, is_last)
WHERE l.code = 'NPL-9';

-- MS Diana — Stadthafen Röbel Saisonfahrten
INSERT INTO transit_departures (line_id, stop_id, service_days, season_start, season_end, departure_time, destination_de, trip_label_de)
SELECT
  l.id, s.id,
  'mo,tu,we,th,fr,sa',
  '2026-04-18'::date, '2026-10-04'::date,
  d.dep_time::time,
  d.dest,
  d.label
FROM transit_lines l
JOIN transit_stops s ON s.line_id = l.id AND s.stop_order = 1
CROSS JOIN (VALUES
  ('09:30', 'Klink · Bolter Kanal · Waren', '3-Seenfahrt'),
  ('11:00', 'Mirow · Schlossinsel',         'Tagesfahrt zur Schlossinsel Mirow'),
  ('13:30', 'Plau am See',                  '7-Seenfahrt nach Plau'),
  ('16:00', 'Klink · Waren',                '4-Seenfahrt nach Malchow')
) AS d(dep_time, dest, label)
WHERE l.code = 'MS-Diana';
