-- Whole-event cancellation flag.
-- Distinct from event_dates.is_cancelled (per-date cancellation).
-- When true, the Expo app shows an "Abgesagt" badge on the event card and a
-- banner on the event detail screen. Event stays visible in listings.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT false;
