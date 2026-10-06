-- notification_log is a GLOBAL audit log of every push (no recipient column). The anon key could read
-- ALL of it, so every app inbox showed other people's targeted notifications (task, tally and payout
-- notices, comment likes, replies) and anyone could read DM/like/comment push texts.
-- From now on the anon key reads only the broadcast types meant for everyone; targeted notifications
-- reach their recipient through the wallet-scoped `notifications` table. Fixes already-installed app
-- versions immediately (their deny-list query simply gets fewer rows). Idempotent.

DROP POLICY IF EXISTS "Allow anon to read notification logs" ON public.notification_log;
DROP POLICY IF EXISTS "Anon reads broadcast notification logs" ON public.notification_log;

CREATE POLICY "Anon reads broadcast notification logs" ON public.notification_log
  FOR SELECT TO anon
  USING (notification_type IN (
    'event_new', 'news_breaking', 'news_featured', 'post_new', 'broadcast', 'proposal_new', 'category'
  ));

NOTIFY pgrst, 'reload schema';
