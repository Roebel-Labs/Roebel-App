-- Replay-order guard: 20260830_forum_a2_hardening.sql (drops the open UPDATE
-- policies) sorts lexicographically BEFORE 20260830_forum_a2_votes_subscriptions.sql
-- (which creates them), so a filename-ordered replay of this repo's migrations
-- would end with the open policies recreated. This trailing migration makes any
-- replay order converge on the hardened end-state. Idempotent; applied files
-- are never renamed (standing rule).

DROP POLICY IF EXISTS forum_threads_update ON public.forum_threads;
DROP POLICY IF EXISTS forum_replies_update ON public.forum_replies;
