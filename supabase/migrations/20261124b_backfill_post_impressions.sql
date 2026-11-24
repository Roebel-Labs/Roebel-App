-- Backfill daily post impressions from the legacy per-viewer table (post_views), so the Dashboard's
-- "Beitragsaufrufe" shows history from before the analytics backbone (20261124_org_analytics).
--
-- post_views keeps one row per (post, wallet) with a running view_count and last_viewed_at only, so
-- the daily split is an ESTIMATE: a single view lands on the day it was seen; several views of the
-- same viewer are spread evenly from the post's publish day to the last view. Today is left out —
-- since the OTA of 2026-11-24 impressions are counted live by track_events.
-- Run once. Re-running adds the history twice.

with src as (
  select public.analytics_owner_of('post', pv.post_id::text) as owner,
         pv.post_id::text as post_id,
         pv.view_count as n,
         least((pv.last_viewed_at at time zone 'Europe/Berlin')::date, (now() at time zone 'Europe/Berlin')::date - 1) as last_day,
         least(
           greatest((p.created_at at time zone 'Europe/Berlin')::date, date '2026-07-01'),
           least((pv.last_viewed_at at time zone 'Europe/Berlin')::date, (now() at time zone 'Europe/Berlin')::date - 1)
         ) as first_day
    from public.post_views pv
    join public.posts p on p.id = pv.post_id
   where pv.view_count > 0
),
spread as (
  select owner, post_id, d::date as day,
         -- even share per day; the remainder goes to the last day so the total stays exact
         (n / (last_day - first_day + 1))
           + case when d::date = last_day then n % (last_day - first_day + 1) else 0 end as views
    from src
   cross join generate_series(first_day, last_day, interval '1 day') as d
   where owner is not null and last_day >= first_day
)
insert into public.analytics_daily (owner_account_id, object_type, object_id, metric, day, count)
select owner, 'post', post_id, 'impression', day, sum(views)::int
  from spread
 where views > 0
 group by owner, post_id, day
on conflict (owner_account_id, object_type, object_id, metric, day)
do update set count = public.analytics_daily.count + excluded.count;
