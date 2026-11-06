-- Emely Ferienwohnung: host org + its five apartments, imported from
-- emely-ferienwohnung.de (listings table of the site's own Supabase project
-- + rendered detail pages). Photos are mirrored into images/vacation-rentals/
-- <slug>/ (downscaled to 2000px, duplicate photos dropped).
-- Max (MaxBrych) is the owner for now. Re-runnable.

DO $$
DECLARE
  max_wallet constant text := '0xc49de63ccfee46c6c5c3e393293f66779799fb28';
  img constant text := 'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/vacation-rentals/';
  org_id uuid;
  shared_highlights constant jsonb := '[
    {"title": "Unterhaltung im Freien", "text": "Für Aufenthalte im Sommer steht Folgendes zur Verfügung: Essbereich im Freien und Sitzplätze im Freien.", "icon": "sunny-outline"},
    {"title": "Einfache Schlüsselübergabe", "text": "Unkomplizierte Schlüsselübergabe bei Ihrer Ankunft.", "icon": "key-outline"},
    {"title": "Perfekte Lage", "text": "Nur wenige Gehminuten vom Zentrum und dem See entfernt.", "icon": "location-outline"}
  ]';
  shared_amenities constant text[] := ARRAY['Voll ausgestattete Küche', 'Kostenloses WLAN', 'Duschvorleger & Geschirrtuch', 'Klimaanlage'];
BEGIN
  SELECT id INTO org_id FROM public.accounts WHERE slug = 'emely-ferienwohnung';
  IF org_id IS NULL THEN
    INSERT INTO public.accounts (account_type, sub_type, name, slug, bio, avatar_url, cover_url,
                                 contact_email, address, latitude, longitude)
    VALUES ('organisation', 'unternehmen', 'Emely Ferienwohnung', 'emely-ferienwohnung',
            'Ferienwohnungen in Röbel an der Müritz. Ihre perfekte Unterkunft für einen unvergesslichen Urlaub an der Müritz – nur wenige Gehminuten vom Zentrum und dem See entfernt.',
            img || 'emely/avatar.png', img || 'emely/01.jpg',
            'info@emely-ferienwohnung.de', 'Große Stavenstraße 24, 17207 Röbel/Müritz',
            53.37092595, 12.59138615)
    RETURNING id INTO org_id;
  END IF;

  INSERT INTO public.account_owners (account_id, wallet_address, role)
  VALUES (org_id, max_wallet, 'owner')
  ON CONFLICT (account_id, wallet_address) DO UPDATE SET role = 'owner';

  INSERT INTO public.vacation_rentals (
    slug, account_id, title, kind_label, description, highlights, amenities,
    max_guests, bedrooms, beds_label, bathrooms, price_per_night,
    cancellation_policy, payment_note, address, latitude, longitude, images,
    contact_email, contact_phone, website_url, badge, status, sort_order
  )
  SELECT r.slug, org_id, r.title, 'Ferienwohnung in Röbel/Müritz', r.description,
         shared_highlights, shared_amenities,
         r.max_guests, r.bedrooms, r.beds_label, r.bathrooms, 95,
         'Flexibel buchen mit kundenfreundlicher Stornierung. Details klärst du direkt mit dem Gastgeber.',
         'Bei Buchung fallen keine Vorauszahlungen an. Gemäß § 312g Abs. 2 Nr. 9 BGB besteht bei Beherbergungsverträgen kein Widerrufsrecht.',
         'Große Stavenstraße 24, 17207 Röbel/Müritz', 53.37092595, 12.59138615,
         ARRAY(SELECT img || r.slug || '/' || lpad(n::text, 2, '0') || '.jpg' FROM generate_series(1, r.photos) n),
         'info@emely-ferienwohnung.de', '+49 160 5616517',
         'https://www.emely-ferienwohnung.de/listings/' || r.slug,
         'Seltener Fund', 'published', r.sort_order
  FROM (VALUES
    ('emely', 'Emely',
     'Komfortable Ferienwohnung mit 1 Schlafzimmer und einem Schlafsofa im Wohnzimmer für insgesamt 4 Personen. Die Wohnung ist modern eingerichtet und bietet allen Komfort für einen angenehmen Aufenthalt.',
     4, 1, '1 Schlafzimmer · Schlafsofa im Wohnzimmer', NULL::int, 9, 1),
    ('martina', 'Martina',
     'Geräumige Ferienwohnung mit 2 Schlafzimmern und Platz für bis zu 4 Personen. Die Wohnung verfügt über ein modernes Badezimmer, eine voll ausgestattete Küche und einen gemütlichen Wohnbereich. Ideal für Familien oder kleine Gruppen.',
     4, 2, NULL, 1, 9, 2),
    ('sofia', 'Sofia',
     'Die Wohnung verfügt über 1 Wohnzimmer, 1 Schlafzimmer mit Doppelbett, 1 Badezimmer und eine Küche. Die Küche des Apartments steht zum Kochen und Aufbewahren von Lebensmitteln zur Verfügung. Dieses Apartment bietet einen Flachbildfernseher. Ein Reisebett für Kinder bis 3 Jahre kann hinzugebucht werden. Ein zusätzliches Einzelbett befindet sich im Wohnzimmer.',
     2, 1, 'Doppelbett · Einzelbett im Wohnzimmer', 1, 9, 3),
    ('klea', 'Klea',
     'Gemütliche Ferienwohnung mit 1 Schlafzimmer für 2 Personen. Die Wohnung bietet einen schönen Ausblick und ist zentral gelegen. Perfekt für Paare, die einen entspannten Urlaub an der Müritz verbringen möchten.',
     2, 1, NULL, NULL, 8, 4),
    ('relax', 'Relax',
     'Entspannende Ferienwohnung mit 1 Schlafzimmer für 2 Personen. Die Wohnung befindet sich in ruhiger Lage und bietet einen perfekten Rückzugsort nach einem Tag voller Aktivitäten an der Müritz.',
     2, 1, NULL, NULL, 8, 5)
  ) AS r(slug, title, description, max_guests, bedrooms, beds_label, bathrooms, photos, sort_order)
  ON CONFLICT (slug) DO UPDATE SET
    account_id = EXCLUDED.account_id, title = EXCLUDED.title, description = EXCLUDED.description,
    highlights = EXCLUDED.highlights, amenities = EXCLUDED.amenities, max_guests = EXCLUDED.max_guests,
    bedrooms = EXCLUDED.bedrooms, beds_label = EXCLUDED.beds_label, bathrooms = EXCLUDED.bathrooms,
    images = EXCLUDED.images, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order,
    updated_at = now();
END $$;
