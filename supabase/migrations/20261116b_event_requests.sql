-- Event requests: an event found by an assistant (forwarded poster) or by the daily
-- fetch of official pages is offered to the responsible organisation. The organisation's
-- owners publish it under their account; without an answer within two days it is listed
-- under the default account. Service-role only (the web backend is the only reader/writer).

create table if not exists public.event_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  -- Organisation that is responsible for everything on this page (optional).
  account_id uuid references public.accounts(id) on delete set null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text,
  last_found integer,
  created_at timestamptz not null default now()
);

create table if not exists public.event_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_org'
    check (status in ('pending_org', 'published_org', 'published_default', 'team_review', 'rejected')),
  source text not null check (source in ('forward', 'crawl')),
  source_id uuid references public.event_sources(id) on delete set null,
  source_url text,
  -- Stable key of the event at its source (date + normalised title): one request per event.
  dedupe_key text not null unique,
  title text not null,
  description text not null default '',
  date date not null,
  time time,
  location text not null default '',
  category text,
  image_url text,
  website_url text,
  organizer_name text,
  account_id uuid references public.accounts(id) on delete set null,
  requested_by_wallet text,
  -- Trusted origin (official page, or forwarded by the app team): may be listed
  -- under the default account when the organisation does not answer.
  trusted boolean not null default false,
  event_id uuid references public.events(id) on delete set null,
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by_wallet text,
  created_at timestamptz not null default now()
);

create index if not exists event_requests_open_idx on public.event_requests (expires_at) where status = 'pending_org';
create index if not exists event_requests_account_idx on public.event_requests (account_id, status);

alter table public.event_sources enable row level security;
alter table public.event_requests enable row level security;
revoke all on public.event_sources from anon, authenticated;
revoke all on public.event_requests from anon, authenticated;

-- Push for the new notification type: same function as before plus 'event_request'.
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
  IF NEW.type NOT IN ('org_invite', 'post_like', 'post_comment', 'post_reply', 'comment_like', 'comment_tip', 'mini_app', 'forum_reply', 'forum_vote', 'vorhaben_tally', 'vorhaben_task', 'vorhaben_payout', 'vorhaben_safe', 'event_request') THEN
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
  ELSIF NEW.type = 'event_request' THEN
    v_data := jsonb_build_object('type', 'event_request', 'requestId', NEW.metadata->>'request_id');
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
