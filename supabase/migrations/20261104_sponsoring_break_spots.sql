-- DanceCup 2026: the stream shows ads only full screen in the breaks between rounds, no banner during
-- the dances. The four banner-era packages go off sale (none was paid; RLS + the booking RPC already
-- hide/refuse inactive packages) and two break-spot packages replace them:
--   Logo-Spot          — animated "sponsored by" card generated from the org logo
--   Werbespot nach Maß — a 15 s spot Max produces from the org's dishes/products/photos
-- The client tells them apart by name (/nach maß/i). Idempotent.

update sponsoring_packages p
set is_active = false, updated_at = now()
from sponsoring_campaigns c
where c.id = p.campaign_id and c.slug = 'dancecup-2026'
  and p.name in ('Unterstützer', 'Logo im Werbebanner', 'Video-Spot', 'Präsentiert von');

insert into sponsoring_packages (campaign_id, name, description, includes, price_cents, capacity, accepts, max_video_seconds, sort_order)
select c.id, p.name, p.description, p.includes, p.price_cents, p.capacity, p.accepts, p.max_video_seconds, p.sort_order
from sponsoring_campaigns c
cross join (values
  ('Logo-Spot', 'Euer Logo groß im Bild, wenn die Tänzer Pause machen.',
    array['Vollbild in den Pausen zwischen den Runden', 'Euer Logo blendet animiert ein: „Mit freundlicher Unterstützung von“', 'Automatisch aus eurem Profil-Logo erstellt'],
    2499, 20, array['image'], null::int, 10),
  ('Werbespot nach Maß', 'Ein 15-Sekunden-Spot, den wir für euch schneiden – mit euren Gerichten, Produkten oder Fotos.',
    array['15 Sekunden Vollbild in jeder Pause', 'Wir produzieren den Spot für euch – wie im Fernsehen', 'Ihr gebt ihn vor der Übertragung frei', 'Nur 5 Plätze'],
    4999, 5, array['image', 'video'], 15, 11)
) as p(name, description, includes, price_cents, capacity, accepts, max_video_seconds, sort_order)
where c.slug = 'dancecup-2026'
  and not exists (select 1 from sponsoring_packages x where x.campaign_id = c.id and x.name = p.name);
