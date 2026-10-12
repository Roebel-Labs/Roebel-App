-- Stop the weekly org follower digest push (Max, 2026-10-12: users must not receive these).
-- The first run sent 37 pushes to 23 org owners/admins. send_follower_digest() stays defined but unscheduled.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'follower-digest-weekly') then
    perform cron.unschedule('follower-digest-weekly');
  end if;
end $$;
