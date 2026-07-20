-- apps/expo/supabase/migrations/conversations_inbox_rpc.sql
--
-- Whole chat inbox in ONE round-trip: conversations + peer account + (for
-- personal peers) the owner's users row + last message (with sticker embed)
-- + the caller's last_read_at. Replaces 4 batched queries + 2 queries PER
-- conversation. Client falls back to the legacy path while this function is
-- missing (see fetchConversations). SECURITY DEFINER matches the exposure of
-- the existing anon-readable tables (all "allow_all" RLS, e.g.
-- account_owners_select in 005_accounts_system.sql) — the account-id scoping
-- is identical to what the client already filters on.
--
-- Requires direct_messages.sticker_reward_id (added in
-- supabase/migrations/20260430_frames_stickers.sql) and the
-- *_account_id / conversation_participants.account_id columns (added in
-- supabase/migrations/20260518_dm_account_scoping.sql, backfilled in
-- 20260519_dm_account_scoping_fixup.sql) — both already live.

create or replace function public.get_conversations_inbox(p_account_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.row order by t.sort_ts desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'conversation', to_jsonb(c),
        'peer_account', (
          select jsonb_build_object(
            'id', a.id, 'account_type', a.account_type, 'sub_type', a.sub_type,
            'name', a.name, 'slug', a.slug, 'avatar_url', a.avatar_url,
            'is_verified', a.is_verified
          )
          from public.accounts a where a.id::text = peer.peer_id
        ),
        'peer_user', pu.j,
        'peer_wallet', pw.wallet_address,
        'last_message', lm.j,
        'last_read_at', cp.last_read_at
      ) as row,
      coalesce(lm.created_at, c.created_at) as sort_ts
    from public.conversations c
    cross join lateral (
      select case
        when c.participant_one_account_id::text = p_account_id
        then c.participant_two_account_id::text
        else c.participant_one_account_id::text
      end as peer_id
    ) peer
    -- Owner wallet only for PERSONAL peers (org avatars come from the
    -- accounts row — resolving org owners would show the wrong identity).
    left join lateral (
      select ao.wallet_address
      from public.account_owners ao
      join public.accounts a2 on a2.id = ao.account_id
      where ao.account_id::text = peer.peer_id
        and a2.account_type = 'personal'
      limit 1
    ) pw on true
    left join lateral (
      select jsonb_build_object(
        'wallet_address', u.wallet_address, 'username', u.username,
        'profile_picture_url', u.profile_picture_url,
        'equipped_frame_asset_url', u.equipped_frame_asset_url,
        'xmtp_registered_at', u.xmtp_registered_at
      ) as j
      from public.users u where u.wallet_address = pw.wallet_address
    ) pu on true
    left join lateral (
      select
        to_jsonb(m) || jsonb_build_object(
          'sticker', (
            select jsonb_build_object(
              'id', lr.id, 'type', lr.type, 'name', lr.name, 'asset_url', lr.asset_url
            )
            from public.lootbox_rewards lr where lr.id = m.sticker_reward_id
          )
        ) as j,
        m.created_at
      from public.direct_messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) lm on true
    left join lateral (
      select cp2.last_read_at
      from public.conversation_participants cp2
      where cp2.conversation_id = c.id and cp2.account_id::text = p_account_id
      limit 1
    ) cp on true
    where c.participant_one_account_id::text = p_account_id
       or c.participant_two_account_id::text = p_account_id
  ) t
$$;

grant execute on function public.get_conversations_inbox(text) to anon, authenticated;
