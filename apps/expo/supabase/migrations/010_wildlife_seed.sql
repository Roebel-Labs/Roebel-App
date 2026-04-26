-- ============================================================
-- SEED 10: Wildlife species + seasonal events + sample sightings
-- Sources: Müritz-Nationalpark (mueritz-nationalpark.de),
-- ornitho.de Regioportal, Stun-MV, gutshaus-ludorf, etc.
-- ============================================================

-- ─── Species (vogel + saeugetier focus) ───────────────────────

INSERT INTO wildlife_species (
  slug, name_de, name_scientific, category, is_protected, protect_coordinates,
  description_de, best_months, best_locations_de, mecky_tipp_de,
  ornitho_species_code, is_active
) VALUES
('fischadler', 'Fischadler', 'Pandion haliaetus', 'vogel', true, true,
  'Zugvogel, von März bis September am Müritz. Etwa 20 Brutpaare im Nationalpark, davon ca. 10 streng innerhalb des Parks (2024). Stürzt aus großer Höhe ins Wasser, wenn er einen Fisch sieht.',
  ARRAY[3,4,5,6,7,8,9],
  'Federow (Live-Webcam ab April), Boek-Fischteiche, Amalienhof',
  'Mecky-Tipp: Federow Information­shaus hat eine Live-Webcam vom Brutbaum. Erste Küken zeigen sich Mitte Mai!',
  'PANHAL', true),

('seeadler', 'Seeadler', 'Haliaeetus albicilla', 'vogel', true, true,
  'Größter heimischer Greifvogel — bis 2,4 m Spannweite. Standvogel: das ganze Jahr da. Etwa 23 Brutpaare im Nationalpark (2024).',
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12],
  'Boek, Federow, Zinow, Zartwitzer Fischteiche',
  'Mecky-Tipp: An den Fischteichen bei Boek hast du gute Chancen, ihn kreisen zu sehen. Geduld + Fernglas mitbringen!',
  'HALALB', true),

('kranich', 'Kranich', 'Grus grus', 'vogel', true, false,
  'Brüten lokal (~100 Paare), aber das Spektakel ist die Herbstrast: Mitte August bis Ende Oktober rasten bis zu 8.000 Tiere täglich am Rederangsee, bis zu 13.000 in der gesamten Region.',
  ARRAY[3,4,5,6,7,8,9,10,11],
  'Rederangsee (Hauptschlafplatz), Großer Schwerin (bis 10.000 im Okt), Warener Hauswiesen',
  'Mecky-Showtipp: Erste Oktoberwoche, Sonnenaufgang am Rederangsee — Hörgerät auf, Kamera bereit. Bis zu 8.000 Tiere fliegen gleichzeitig auf.',
  'GRUGRU', true),

('singschwan', 'Singschwan', 'Cygnus cygnus', 'vogel', true, false,
  'Wintergast aus Skandinavien. Dezember bis März auf den Wiesen und an den Schnakenburger Wasserflächen.',
  ARRAY[12,1,2,3],
  'Schnakenburg (Hauptschlafplatz)',
  'Mecky-Wintertipp: Beobachtungsturm Schnakenburg. Sehr ruhig sein, sie sind scheu.',
  'CYGCYG', true),

('silberreiher', 'Silberreiher', 'Ardea alba', 'vogel', false, false,
  'Bestand wächst — gut zu sehen an den Fischteichen und flachen Seen.',
  ARRAY[8,9,10,11],
  'Specker Hofsee, Warnker See',
  'Mecky-Tipp: Aussichtspunkt Hofsee Speck am Vormittag.',
  'ARDALB', true),

('saatgans', 'Saatgans', 'Anser fabalis', 'vogel', false, false,
  'Nordische Gans — Herbst- und Winterrast. Schlafplätze auf den Müritz-Seen.',
  ARRAY[10,11,12,1,2],
  'Specker See, Rederang, Woterfitz',
  'Mecky-Tipp: Mit der Kraniche-Frühaufsteher-Tour kombinieren.',
  'ANSFAB', true),

('blaessgans', 'Blässgans', 'Anser albifrons', 'vogel', false, false,
  'Häufiger Wintergast. Erkennbar an dem weißen Stirnfleck.',
  ARRAY[10,11,12,1,2],
  'Specker See, Rederang',
  'Oft mit Saatgänsen vergesellschaftet.',
  'ANSALB', true),

('reiherente', 'Reiherente', 'Aythya fuligula', 'vogel', false, false,
  'Tauchente. Im Herbst zehntausende auf den Müritz-Gewässern.',
  ARRAY[9,10,11,12,1,2,3],
  'Warnker See',
  'Mecky-Tipp: November ist Hochzeit an den Warnker Seen.',
  'AYTFUL', true),

('tafelente', 'Tafelente', 'Aythya ferina', 'vogel', false, false,
  'Tauchente. Im Herbst in großen Schwärmen.',
  ARRAY[9,10,11,12,1,2,3],
  'Warnker See',
  NULL, 'AYTFER', true),

('knaekente', 'Knäkente', 'Spatula querquedula', 'vogel', false, false,
  'Kleine Schwimmente. Selten — aber bei Speck regelmäßig zu sehen.',
  ARRAY[4,5,6,7,8],
  'Mühlensee bei Speck',
  NULL, 'SPAQUE', true),

('pfeifente', 'Pfeifente', 'Mareca penelope', 'vogel', false, false,
  'Schwimmente mit charakteristischem Pfiff.',
  ARRAY[10,11,12,1,2,3],
  'Mühlensee bei Speck',
  NULL, 'MARPEN', true),

-- ─── Säugetiere ───────────────────────────────────────────────

('rothirsch', 'Rothirsch', 'Cervus elaphus', 'saeugetier', false, false,
  'Größter heimischer Hirsch. Brunft (Röhren) von Mitte September bis Mitte Oktober — ein akustisches Spektakel.',
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12],
  'Schwarzenhof (Brunft), Müritz-Nationalpark gesamt',
  'Mecky-Tipp: Brunfttour Schwarzenhof Mitte Sept – Mitte Okt, eine Stunde vor Sonnenuntergang.',
  NULL, true),

('damhirsch', 'Damhirsch', 'Dama dama', 'saeugetier', false, false,
  'Kleinerer Hirsch mit Schaufelgeweih. Im Wildpark Boek hautnah erlebbar.',
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12],
  'Wildpark Boek',
  'Mecky-Familientipp: Wildpark Boek — sicher und mit Kindern.',
  NULL, true),

('wolf', 'Wolf', 'Canis lupus', 'saeugetier', true, true,
  'Selten — zwei bis drei Rudel im weiteren Umfeld. Sichtungen sind eine kleine Sensation.',
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12],
  'Müritz-Nationalpark (selten)',
  'Mecky-Hinweis: Wölfe meiden Menschen. Falls du Spuren findest, melde sie der Nationalpark­verwaltung.',
  NULL, true),

('rotfuchs', 'Rotfuchs', 'Vulpes vulpes', 'saeugetier', false, false,
  'Häufig — auch tagsüber zu sehen.',
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12],
  'Müritz-Nationalpark gesamt',
  NULL, NULL, true),

('waschbaer', 'Waschbär', 'Procyon lotor', 'saeugetier', false, false,
  'Eingeführt, mittlerweile häufig. Eher dämmerungsaktiv.',
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12],
  'Wassernähe, Stadtparks',
  NULL, NULL, true),

('fischotter', 'Fischotter', 'Lutra lutra', 'saeugetier', true, false,
  'Schwer zu sehen — meist nur Spuren. Müritz und Havelseen sind Otter-Land.',
  ARRAY[1,2,3,4,5,6,7,8,9,10,11,12],
  'Müritzufer, Havelquellgebiet',
  'Mecky-Tipp: Frühmorgens am Bolter Kanal — manchmal hat man Glück.',
  NULL, true);

-- ─── Seasonal Events ──────────────────────────────────────────

INSERT INTO wildlife_seasonal_events (
  species_id, title_de, description_de,
  start_month, end_month, start_date_hint_de, peak_window_de,
  best_location_de, alarm_kind, trigger_hint, push_message_de
)
SELECT id, 'Kraniche-Rast Müritz',
  'Massenrast der Kraniche. Bis zu 8.000 Tiere am Rederangsee, bis zu 13.000 in der Region.',
  8, 10, 'Mitte August', 'Erste Oktoberwoche',
  'Rederangsee (Hauptschlafplatz)',
  'sunrise_minus_30', 'first_week_of_october',
  'Mecky meldet: Heute zur Sonnenaufgang am Rederangsee — die Kraniche fliegen aus!'
FROM wildlife_species WHERE slug = 'kranich';

INSERT INTO wildlife_seasonal_events (
  species_id, title_de, description_de,
  start_month, end_month, start_date_hint_de, peak_window_de,
  best_location_de, alarm_kind, trigger_hint, push_message_de
)
SELECT id, 'Fischadler-Ankunft',
  'Erste Fischadler kommen aus dem Winterquartier zurück.',
  3, 4, 'Anfang März', 'Mitte März',
  'Federow', 'morning', 'first_arrivals',
  'Mecky meldet: Die Fischadler sind wieder da — Live-Cam in Federow läuft!'
FROM wildlife_species WHERE slug = 'fischadler';

INSERT INTO wildlife_seasonal_events (
  species_id, title_de, description_de,
  start_month, end_month, start_date_hint_de, peak_window_de,
  best_location_de, alarm_kind, trigger_hint, push_message_de
)
SELECT id, 'Erste Fischadler-Küken',
  'Frisch geschlüpfte Küken im Brutbaum.',
  5, 6, 'Mitte Mai', 'Mitte Mai bis Mitte Juni',
  'Federow Live-Webcam', 'morning', 'mid_may',
  'Mecky meldet: Erste Fischadler-Küken bei Federow geschlüpft!'
FROM wildlife_species WHERE slug = 'fischadler';

INSERT INTO wildlife_seasonal_events (
  species_id, title_de, description_de,
  start_month, end_month, start_date_hint_de, peak_window_de,
  best_location_de, alarm_kind, trigger_hint, push_message_de
)
SELECT id, 'Hirschbrunft',
  'Röhren der Rothirsche im Spätsommer und Herbst.',
  9, 10, 'Mitte September', 'Letzte Septemberwoche',
  'Schwarzenhof (Ranger­führung)', 'sunset', 'mid_september',
  'Mecky meldet: Die Hirsche röhren — heute Abend Brunfttour ab Schwarzenhof!'
FROM wildlife_species WHERE slug = 'rothirsch';

INSERT INTO wildlife_seasonal_events (
  species_id, title_de, description_de,
  start_month, end_month, start_date_hint_de, peak_window_de,
  best_location_de, alarm_kind, trigger_hint, push_message_de
)
SELECT id, 'Singschwan-Rast',
  'Wintergäste aus Skandinavien.',
  12, 3, 'Mitte Dezember', 'Januar – Februar',
  'Schnakenburg', 'morning', 'mid_december',
  'Mecky meldet: Die Singschwäne sind in Schnakenburg eingetroffen.'
FROM wildlife_species WHERE slug = 'singschwan';

INSERT INTO wildlife_seasonal_events (
  species_id, title_de, description_de,
  start_month, end_month, start_date_hint_de, peak_window_de,
  best_location_de, alarm_kind, trigger_hint, push_message_de
)
SELECT id, 'Kranichtanz',
  'Werbungstanz der Kraniche auf den Wiesen.',
  3, 4, 'Mitte März', 'Ende März',
  'Warener Hauswiesen', 'morning', 'mid_march',
  'Mecky-Geheimtipp: Heute tanzen die Kraniche auf den Wiesen!'
FROM wildlife_species WHERE slug = 'kranich';

INSERT INTO wildlife_seasonal_events (
  species_id, title_de, description_de,
  start_month, end_month, start_date_hint_de,
  best_location_de, alarm_kind, trigger_hint, push_message_de
)
SELECT id, 'Reiherenten-Schwärme',
  'Zehntausende auf den Müritz-Gewässern.',
  10, 11, 'November',
  'Warnker See', 'morning', 'mid_november',
  'Mecky meldet: Riesige Reiherenten-Schwärme am Warnker See.'
FROM wildlife_species WHERE slug = 'reiherente';

-- ─── Sample sightings (mock data) ─────────────────────────────

INSERT INTO wildlife_sightings (
  species_id, observer_name_de, observed_at,
  lat, lon, individual_count, notes_de, near_landmark_de,
  verified_by_mecky, mecky_verification_note_de,
  is_visible, helpful_count
)
SELECT s.id, 'Anna · Berlin', NOW() - INTERVAL '2 hours',
  53.5067, 12.6900, 1, 'Großer Vogel über dem Wasser, sehr ruhig.', 'Rederangsee',
  true, 'Mecky bestätigt: das Foto zeigt deutlich einen Seeadler.',
  true, 12
FROM wildlife_species s WHERE s.slug = 'seeadler';

INSERT INTO wildlife_sightings (
  species_id, observer_name_de, observed_at,
  lat, lon, individual_count, notes_de, near_landmark_de,
  verified_by_mecky, mecky_verification_note_de,
  is_visible, helpful_count
)
SELECT s.id, 'Max · Hamburg', NOW() - INTERVAL '14 hours',
  53.4783, 12.7367, 2, 'Brutbaum besetzt, beide Eltern füttern.', 'Federow Information',
  true, 'Mecky bestätigt: Live-Cam zeigt heute denselben Brutbaum.',
  true, 24
FROM wildlife_species s WHERE s.slug = 'fischadler';

INSERT INTO wildlife_sightings (
  species_id, observer_name_de, observed_at,
  lat, lon, individual_count, notes_de, near_landmark_de,
  verified_by_mecky, mecky_verification_note_de,
  is_visible, helpful_count
)
SELECT s.id, 'Familie Schmidt', NOW() - INTERVAL '6 hours',
  53.5067, 12.6900, 3500, 'Riesiger Schwarm beim Sonnenaufgang. Gänsehaut.', 'Rederangsee Beobachtungsturm',
  true, 'Mecky bestätigt: Schätzung passt zum Oktober-Mittel.',
  true, 87
FROM wildlife_species s WHERE s.slug = 'kranich';

INSERT INTO wildlife_sightings (
  species_id, observer_name_de, observed_at,
  lat, lon, individual_count, notes_de, near_landmark_de,
  is_visible, helpful_count
)
SELECT s.id, 'Lisa · Leipzig', NOW() - INTERVAL '1 day',
  53.4408, 12.7900, 5, 'Wildpark — Damwild auf der Lichtung.', 'Wildpark Boek',
  true, 8
FROM wildlife_species s WHERE s.slug = 'damhirsch';

INSERT INTO wildlife_sightings (
  species_id, observer_name_de, observed_at,
  lat, lon, individual_count, notes_de, near_landmark_de,
  is_visible, helpful_count
)
SELECT s.id, 'Tobias · Dresden', NOW() - INTERVAL '3 days',
  53.5008, 12.7095, 1, 'Großer weißer Reiher am Ufer.', 'Specker See',
  true, 3
FROM wildlife_species s WHERE s.slug = 'silberreiher';

INSERT INTO wildlife_sightings (
  species_id, observer_name_de, observed_at,
  lat, lon, individual_count, notes_de, near_landmark_de,
  is_visible, helpful_count
)
SELECT s.id, 'Müritz Naturwacht', NOW() - INTERVAL '5 hours',
  53.4083, 12.7333, 1, 'Spuren an der Bolter-Kanal-Schleuse.', 'Bolter Kanal',
  true, 5
FROM wildlife_species s WHERE s.slug = 'fischotter';
