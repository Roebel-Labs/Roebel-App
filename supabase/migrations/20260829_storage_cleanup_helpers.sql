-- Storage cleanup helpers + weekly cron (applied remotely 2026-08-29 via MCP
-- migrations `storage_cleanup_helpers` and `schedule_weekly_storage_cleanup`).
--
-- Context: Supabase storage hit ~1 GB with ~440 MB of orphaned objects
-- (abandoned AI-chat flyer uploads, replaced avatars/logos, deleted posts).
-- The `images` bucket is append-only for the app (public INSERT, no DELETE
-- policy), so replaced files can never be deleted client-side — instead the
-- `storage-cleanup` edge function reaps verified orphans weekly.
--
-- Safety: an object is only considered an orphan if
--   1. its bucket/prefix is on the approved list below (mini-apps/ excluded:
--      those assets are loaded by hosted mini-apps via relative paths),
--   2. no DB column OR rich-content blob (newsletter HTML, post/DM content,
--      mini-app HTML, notification payloads …) references its URL,
--   3. it is older than 7 days (in-flight drafts are never touched).

create or replace function public.storage_cleanup_list_orphans()
returns table(bucket_id text, name text, size_bytes bigint)
language sql
security definer
set search_path = public, storage
as $fn$
with direct_refs as (
  select avatar_url as u from accounts union all select cover_url from accounts
  union all select image_url from announcements union all select image_url from app_notifications
  union all select cover_image_url from blog_articles
  union all select image_url from business_deals union all select video_url from business_deals
  union all select unnest(media_urls) from business_deals
  union all select logo_url from businesses union all select cover_image_url from businesses
  union all select unnest(gallery_images) from businesses
  union all select image_url from events union all select audio_url from events
  union all select badge_image_url from explorer_checkpoints
  union all select image_url from flyers
  union all select cover_image_url from help_collections union all select icon_url from help_collections
  union all select icon_url from help_items union all select hero_media_url from help_items
  union all select thumbnail_url from help_videos
  union all select modal_image_url from livestreams
  union all select asset_url from lootbox_rewards union all select image_url from lootboxes
  union all select unnest(media_urls) from marketplace_listings
  union all select og_image from mecky_drafts
  union all select image_url from menu_items
  union all select feature_image_url from mini_apps union all select icon_url from mini_apps
  union all select unnest(screenshots) from mini_apps
  union all select cover_image_url from movies
  union all select cover_image_url from news_articles
  union all select hero_image_url from newsletter_issues
  union all select logo_url from organizations
  union all select og_image from post_links
  union all select video_url from posts union all select unnest(media_urls) from posts
  union all select video_url from post_comments union all select unnest(media_urls) from post_comments
  union all select video_url from proposal_comments union all select unnest(media_urls) from proposal_comments
  union all select cover_image_url from restaurants union all select logo_url from restaurants
  union all select image_url from rewards_tasks
  union all select image_url from special_menu_items
  union all select icon_image_url from special_menus union all select cover_image_url from special_menus
  union all select audio_url from story_collections union all select cover_image_url from story_collections
  union all select background_video_url from story_slides union all select background_image_url from story_slides
  union all select cover_image_url from tours
  union all select equipped_frame_asset_url from users union all select cover_image_url from users union all select profile_picture_url from users
  union all select photo_url from wildlife_sightings union all select image_url from wildlife_species
  union all select video_url from event_experiences union all select unnest(media_urls) from event_experiences
  union all select pdf_url from documentation_chapters
  union all select pdf_url from event_tickets union all select qr_code_url from event_tickets
), content_blobs as (
  select html as c from mini_app_versions
  union all select content_html from newsletter_issues
  union all select content from news_articles
  union all select content from blog_articles
  union all select content from posts
  union all select content from post_comments
  union all select content from proposal_comments
  union all select content from direct_messages
  union all select content from mecky_drafts
  union all select content from mecky_messages
  union all select content from event_experiences
  union all select description from events
  union all select content::text from proposals
  union all select metadata::text from notifications
  union all select data::text from notification_log
), content_refs as (
  select (regexp_matches(c, 'storage/v1/(?:object|render/image)/(?:public|sign)/([^?"''\s\\)\}>]+)', 'g'))[1] as p
  from content_blobs where c like '%storage/v1%'
), all_paths as (
  select distinct replace(substring(u from 'storage/v1/(?:object|render/image)/(?:public|sign)/([^?]+)'), '%20', ' ') as fp
  from direct_refs where u like '%storage/v1%'
  union
  select distinct replace(p, '%20', ' ') from content_refs
)
select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
from storage.objects o
left join all_paths p on p.fp = o.bucket_id || '/' || o.name
where p.fp is null
  and o.created_at < now() - interval '7 days'
  and (
    (o.bucket_id = 'images' and (
      o.name ~ '^(event-images|posts|post-images|post-videos|menu-items|profile-pictures|experiences|experience-images|lootbox-rewards|marketplace|marketplace-media|org-covers|org-logos|deals|deal-media|comments|business-images|ai-references)/'
      or (o.name !~ '/' and o.name <> 'probe')
    ))
    or o.bucket_id in ('news-images','blog-images','story-audio','profile-pictures')
  );
$fn$;

create or replace function public.storage_list_large_images(min_bytes bigint default 800000)
returns table(bucket_id text, name text, size_bytes bigint, mimetype text)
language sql
security definer
set search_path = storage
as $fn$
  select o.bucket_id, o.name, (o.metadata->>'size')::bigint, o.metadata->>'mimetype'
  from storage.objects o
  where (o.metadata->>'mimetype') in ('image/jpeg','image/jpg','image/png','image/webp')
    and (o.metadata->>'size')::bigint > min_bytes
    and o.bucket_id in ('images','news-images','blog-images','profile-pictures')
  order by (o.metadata->>'size')::bigint desc;
$fn$;

revoke all on function public.storage_cleanup_list_orphans() from public, anon, authenticated;
revoke all on function public.storage_list_large_images(bigint) from public, anon, authenticated;
grant execute on function public.storage_cleanup_list_orphans() to service_role;
grant execute on function public.storage_list_large_images(bigint) to service_role;

-- Weekly automated cleanup (Mondays 03:15 UTC). The anon key below is the
-- public client key (already shipped in the apps); the body secret only
-- authorizes deleting DB-verified orphans (see edge function threat model).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'storage-orphan-cleanup-weekly';

select cron.schedule(
  'storage-orphan-cleanup-weekly',
  '15 3 * * 1',
  $$
  select net.http_post(
    url := 'https://wwbeqhkslxdxhktqzqti.supabase.co/functions/v1/storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3YmVxaGtzbHhkeGhrdHF6cXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTUyMTIsImV4cCI6MjA2ODY5MTIxMn0.ETISOumSNns3OVO-FC10FDQAZQVdJnubx3Qu_iHGHGI'
    ),
    body := jsonb_build_object('secret', 'rblclean_7f2d91c4a8e35b06', 'action', 'delete'),
    timeout_milliseconds := 120000
  );
  $$
);
