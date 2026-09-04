-- Supabase grants anon/authenticated blanket INSERT/UPDATE/DELETE on every new
-- table. RLS already denies these (no write policy exists), but the grants
-- should not be there at all: every write to the merchant registry goes through
-- the merchant-registry edge function with the service role. Defense in depth,
-- so a future permissive policy cannot silently open a write path.
revoke insert, update, delete, truncate, references
  on merchant_payment_accounts from anon, authenticated;

revoke insert, update, delete, truncate, references
  on merchant_entities from anon, authenticated;
