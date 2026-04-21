-- 20260430_frames_stickers.sql
-- Surface equipped profile frames across every avatar in the app, and let
-- users send owned stickers as messages / comments / post attachments /
-- event experience reactions.
--
--   1. Denormalize the currently-equipped profile_frame asset URL onto
--      public.users so every feed/comment/chat query gets it via the existing
--      users join without an N+1.
--   2. Add sticker_reward_id FK to direct_messages, post_comments, posts, and
--      event_experiences so any of those rows can reference a sticker reward.

begin;

-- =============================================================================
-- 1. users.equipped_frame_asset_url + sync trigger
-- =============================================================================

alter table public.users
  add column if not exists equipped_frame_asset_url text;

-- Backfill: pull whatever is currently equipped as a profile_frame.
update public.users u
set equipped_frame_asset_url = r.asset_url
from public.user_lootbox_rewards ur
join public.lootbox_rewards r on r.id = ur.reward_id
where ur.wallet_address = u.wallet_address
  and ur.is_equipped = true
  and r.type = 'profile_frame';

-- Trigger: when a profile_frame row's is_equipped flips (or is inserted /
-- deleted), recompute the users.equipped_frame_asset_url for that wallet.
create or replace function sync_equipped_frame_asset_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet text;
  v_url text;
begin
  v_wallet := coalesce(new.wallet_address, old.wallet_address);

  select r.asset_url into v_url
  from public.user_lootbox_rewards ur
  join public.lootbox_rewards r on r.id = ur.reward_id
  where ur.wallet_address = v_wallet
    and ur.is_equipped = true
    and r.type = 'profile_frame'
  order by ur.obtained_at desc
  limit 1;

  update public.users
  set equipped_frame_asset_url = v_url
  where wallet_address = v_wallet;

  return null;
end;
$$;

drop trigger if exists user_lootbox_rewards_sync_frame_ins on public.user_lootbox_rewards;
drop trigger if exists user_lootbox_rewards_sync_frame_upd on public.user_lootbox_rewards;
drop trigger if exists user_lootbox_rewards_sync_frame_del on public.user_lootbox_rewards;

create trigger user_lootbox_rewards_sync_frame_ins
  after insert on public.user_lootbox_rewards
  for each row execute function sync_equipped_frame_asset_url();

create trigger user_lootbox_rewards_sync_frame_upd
  after update of is_equipped on public.user_lootbox_rewards
  for each row execute function sync_equipped_frame_asset_url();

create trigger user_lootbox_rewards_sync_frame_del
  after delete on public.user_lootbox_rewards
  for each row execute function sync_equipped_frame_asset_url();

-- =============================================================================
-- 2. sticker_reward_id on content tables
-- =============================================================================

alter table public.direct_messages
  add column if not exists sticker_reward_id uuid references public.lootbox_rewards(id) on delete set null;

alter table public.post_comments
  add column if not exists sticker_reward_id uuid references public.lootbox_rewards(id) on delete set null;

alter table public.posts
  add column if not exists sticker_reward_id uuid references public.lootbox_rewards(id) on delete set null;

alter table public.event_experiences
  add column if not exists sticker_reward_id uuid references public.lootbox_rewards(id) on delete set null;

create index if not exists idx_direct_messages_sticker
  on public.direct_messages(sticker_reward_id) where sticker_reward_id is not null;
create index if not exists idx_post_comments_sticker
  on public.post_comments(sticker_reward_id) where sticker_reward_id is not null;
create index if not exists idx_posts_sticker
  on public.posts(sticker_reward_id) where sticker_reward_id is not null;
create index if not exists idx_event_experiences_sticker
  on public.event_experiences(sticker_reward_id) where sticker_reward_id is not null;

commit;
