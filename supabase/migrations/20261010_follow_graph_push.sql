-- Follow graph: mute-aware pushes, follower digest preference, weekly org follower digest.

create or replace function public.notify_user_notification_push()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_url  text;
  v_key  text;
  v_data jsonb;
BEGIN
  IF NEW.type NOT IN ('org_invite', 'post_like', 'post_comment', 'post_reply', 'comment_like', 'mini_app', 'forum_reply', 'forum_vote', 'vorhaben_tally', 'vorhaben_task', 'vorhaben_payout', 'vorhaben_safe') THEN
    RETURN NEW;
  END IF;

  -- Muted actors never reach the recipient's lock screen (the inbox filters them client-side).
  IF NEW.metadata ? 'actor_wallet' AND EXISTS (
    SELECT 1 FROM public.account_hides h
    JOIN public.account_owners ao ON ao.account_id = h.target_account_id
    JOIN public.accounts a ON a.id = h.target_account_id AND a.account_type = 'personal'
    WHERE h.kind = 'muted'
      AND h.viewer_wallet = lower(NEW.recipient_wallet)
      AND lower(ao.wallet_address) = lower(NEW.metadata->>'actor_wallet')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'org_invite' THEN
    v_data := jsonb_build_object(
      'type', 'org_invite',
      'accountId', NEW.metadata->>'account_id',
      'invitationId', NEW.metadata->>'invitation_id'
    );
  ELSIF NEW.type = 'mini_app' THEN
    v_data := jsonb_build_object(
      'type', 'mini_app',
      'slug', NEW.metadata->>'slug',
      'url', NEW.metadata->>'target_url'
    );
  ELSIF NEW.type = 'forum_reply' THEN
    v_data := jsonb_build_object('type', 'forum_thread', 'threadId', NEW.metadata->>'thread_id');
  ELSIF NEW.type = 'forum_vote' THEN
    v_data := jsonb_build_object('type', 'forum_thread', 'threadId', NEW.metadata->>'thread_id');
  ELSIF NEW.type IN ('vorhaben_tally', 'vorhaben_task', 'vorhaben_payout', 'vorhaben_safe') THEN
    v_data := jsonb_build_object(
      'type', 'vorhaben',
      'screen', NEW.metadata->>'screen',
      'proposalId', NEW.metadata->>'proposal_id',
      'taskId', NEW.metadata->>'task_id'
    );
  ELSE
    v_data := jsonb_build_object(
      'type', 'post',
      'postId', NEW.metadata->>'post_id',
      'commentId', NEW.metadata->>'comment_id'
    );
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_user_notification_push: missing vault secrets, skipping push for notification %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'type', NEW.type,
      'title', NEW.title,
      'body', NEW.body,
      'walletAddresses', jsonb_build_array(NEW.recipient_wallet),
      'data', v_data
    )
  );

  RETURN NEW;
END;
$function$;

create or replace function public.notify_new_main_post()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_author   text;
  v_title    text;
  v_body     text;
  v_url      text;
  v_key      text;
  v_event_id uuid;
  v_data     jsonb;
BEGIN
  -- Display name: wallet-safe account resolver → user display name → username.
  v_author := COALESCE(
    public.account_display_name(NEW.account_id),
    (SELECT NULLIF(btrim(u.display_name), '') FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address)),
    (SELECT NULLIF(btrim(u.username), '')     FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address))
  );
  v_title := COALESCE(NULLIF(btrim(v_author), ''), 'Neuer Beitrag');
  -- Final guard: never let a wallet address through as the title.
  IF v_title ~* '^0x[a-f0-9]{6,}$' THEN
    v_title := 'Neuer Beitrag';
  END IF;

  -- Body: content excerpt, or a fallback for media/event-only posts.
  v_body := NULLIF(btrim(NEW.content), '');
  IF v_body IS NULL THEN
    v_body := 'hat einen neuen Beitrag geteilt';
  ELSIF length(v_body) > 140 THEN
    v_body := left(v_body, 140) || '…';
  END IF;

  -- Routing: event-experience posts deep-link to the parent event detail page
  -- (data.type='event'), all other "Für Alle" posts deep-link to the post page.
  IF NEW.post_type = 'event_experience' THEN
    v_event_id := COALESCE(
      NEW.linked_event_id,
      (SELECT ee.event_id FROM public.event_experiences ee WHERE ee.id = NEW.linked_experience_id)
    );
  END IF;

  IF v_event_id IS NOT NULL THEN
    v_data := jsonb_build_object('type', 'event', 'eventId', v_event_id);
  ELSE
    v_data := jsonb_build_object('type', 'post', 'postId', NEW.id);
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_new_main_post: missing vault secrets, skipping push for post %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'type', 'post_new',
      'title', v_title,
      'body', v_body,
      -- actorWallet/accountId let send-notification skip viewers who hid the author.
      'data', v_data || jsonb_build_object('actorWallet', lower(NEW.wallet_address), 'accountId', NEW.account_id)
    )
  );

  RETURN NEW;
END;
$function$;

alter table public.notification_preferences add column if not exists follower_digest_enabled boolean not null default true;

create or replace function public.send_follower_digest()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_key text; v_sent int := 0; r record;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_send_notification_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_send_notification_key';
  if v_url is null or v_key is null then
    raise warning 'send_follower_digest: missing vault secrets';
    return 0;
  end if;
  for r in
    select a.id, a.name, count(*)::int as n,
           (select jsonb_agg(distinct lower(ao.wallet_address)) from public.account_owners ao
            where ao.account_id = a.id and ao.role in ('owner','admin')) as wallets
    from public.account_follows f
    join public.accounts a on a.id = f.target_account_id and a.account_type = 'organisation'
    where f.created_at > now() - interval '7 days'
    group by a.id, a.name
  loop
    continue when r.wallets is null;
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object(
        'type', 'follower_digest',
        'title', r.name,
        'body', case when r.n = 1 then '1 neuer Follower diese Woche' else r.n || ' neue Follower diese Woche' end,
        'walletAddresses', r.wallets,
        'data', jsonb_build_object('type', 'org', 'accountId', r.id)
      )
    );
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.send_follower_digest() from public, anon, authenticated;

-- Monday 08:00 UTC = 10:00 CEST / 09:00 CET.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'follower-digest-weekly') then
    perform cron.unschedule('follower-digest-weekly');
  end if;
  perform cron.schedule('follower-digest-weekly', '0 8 * * 1', $cron$ select public.send_follower_digest(); $cron$);
end $$;
