-- Ferienwohnungen (vacation rentals) shown on Erkunden and on their own
-- detail page. Each rental belongs to an org account (the host); booking
-- requests are sent as a message into the host's org chat, so no guest
-- contact data lands in a public table. Rows are curated by admins for now
-- (no client writes); published rows are public.

CREATE TABLE IF NOT EXISTS public.vacation_rentals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  account_id          uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title               text NOT NULL,
  -- Short line under the title, e.g. "Ferienwohnung in Röbel/Müritz".
  kind_label          text NOT NULL DEFAULT 'Ferienwohnung',
  description         text,
  -- [{ "title": "...", "text": "...", "icon": "<Ionicons name>" }]
  highlights          jsonb NOT NULL DEFAULT '[]'::jsonb,
  amenities           text[] NOT NULL DEFAULT '{}',
  max_guests          int NOT NULL CHECK (max_guests BETWEEN 1 AND 50),
  bedrooms            int CHECK (bedrooms >= 0),
  beds_label          text,
  bathrooms           int CHECK (bathrooms >= 0),
  size_sqm            int CHECK (size_sqm > 0),
  price_per_night     numeric(10,2) NOT NULL CHECK (price_per_night >= 0),
  cleaning_fee        numeric(10,2) CHECK (cleaning_fee >= 0),
  min_nights          int NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  check_in_from       text,
  check_out_until     text,
  house_rules         text[] NOT NULL DEFAULT '{}',
  cancellation_policy text,
  payment_note        text,
  address             text,
  latitude            double precision,
  longitude           double precision,
  images              text[] NOT NULL DEFAULT '{}',
  contact_email       text,
  contact_phone       text,
  website_url         text,
  badge               text,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  sort_order          int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacation_rentals_published_idx
  ON public.vacation_rentals (sort_order, title) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS vacation_rentals_account_idx
  ON public.vacation_rentals (account_id);

ALTER TABLE public.vacation_rentals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published vacation rentals are public" ON public.vacation_rentals;
CREATE POLICY "Published vacation rentals are public"
  ON public.vacation_rentals FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

REVOKE ALL ON public.vacation_rentals FROM anon, authenticated;
GRANT SELECT ON public.vacation_rentals TO anon, authenticated;
