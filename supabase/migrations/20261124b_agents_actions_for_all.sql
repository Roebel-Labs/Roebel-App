-- Every agent may propose public actions (posts, events, Anzeigen, Mittagstisch …).
-- Execution stays gated: each one needs the person's approval card (or an explicit
-- "immer erlauben" grant); money always asks. See apps/web/src/lib/chat/harness/policy.ts.
update public.chat_bots
   set tools = (select array_agg(distinct t order by t) from unnest(tools || array['actions','roebel','user','memory','web']) t)
 where not ('actions' = any(tools));
