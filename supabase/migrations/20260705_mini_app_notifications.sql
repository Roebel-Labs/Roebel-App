-- Mini-app notification SENDING side (store v2 collects the opt-ins; this
-- adds delivery). Applied to project wwbeqhkslxdxhktqzqti via Supabase MCP
-- (migration name: mini_app_notifications). This file is the repo mirror.

-- 1) Broadcast log — one row per dashboard send (dev or admin). Service-role
--    only; the dashboard reads it through /api/mini-apps/notifications.
create table if not exists public.mini_app_notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  mini_app_id uuid not null references public.mini_apps(id) on delete cascade,
  title       text not null,
  body        text not null,
  target_url  text,
  sent_by     text not null,            -- 'admin' oder Entwickler-Wallet (lowercased)
  recipients  int  not null default 0
);
create index if not exists mini_app_notifications_app_idx
  on public.mini_app_notifications(mini_app_id, created_at desc);
alter table public.mini_app_notifications enable row level security;
-- keine anon-Policies: nur service_role.

-- 2) Push-Hub: der notifications-Trigger kennt jetzt auch type='mini_app'.
--    data.type='mini_app' + slug/url, damit der Expo-Push-Handler die App
--    öffnen kann.
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
  IF NEW.type NOT IN ('org_invite', 'post_like', 'post_comment', 'post_reply', 'comment_like', 'mini_app') THEN
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
  ELSE
    -- post_like / post_comment / post_reply / comment_like all open the post.
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
