-- Per-listing opt-in for native booking: the Calendly event type a listing books (null = off, "Anfragen"
-- stays the primary action). Set by the listing owner in the listing editor.
alter table marketplace_listings add column if not exists booking_event_type_uri text
  check (booking_event_type_uri is null or booking_event_type_uri ~ '^https://api\.calendly\.com/event_types/[A-Za-z0-9-]+$');
