-- 20260417_roebel_card_stripe_idempotency.sql
-- Defensive uniqueness guard for Stripe webhook replays.
--
-- Session 5: programmatic Stripe checkout.
--
-- The webhook already de-dupes by looking up the session id before
-- inserting, but a retry arriving in parallel (rare but possible) could
-- race and produce two paid rows for the same Stripe session. A unique
-- partial index turns that race into a Postgres error that the webhook
-- can catch and treat as "already processed".
--
-- Partial so historic rows without a session id (session 1 seed data,
-- manual admin inserts, etc.) remain unconstrained.

begin;

create unique index if not exists idx_roebel_purchases_stripe_session_unique
  on roebel_card_purchases (stripe_session_id)
  where stripe_session_id is not null;

commit;
