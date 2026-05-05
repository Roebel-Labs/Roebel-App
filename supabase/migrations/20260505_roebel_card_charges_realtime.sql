-- 20260505_roebel_card_charges_realtime.sql
-- Add roebel_card_charges to the supabase_realtime publication so the
-- citizen device can subscribe to INSERTs (partner created a pending
-- charge) and UPDATEs (charge approved/declined/expired) instead of
-- polling. Other tables in this app (orders, messages, notifications)
-- are already published, so no infra changes needed.
--
-- Idempotent: rerunning is a no-op once the table is in the publication.

do $$
begin
  alter publication supabase_realtime add table roebel_card_charges;
exception when duplicate_object then
  null;
end$$;
