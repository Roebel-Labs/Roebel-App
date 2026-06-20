-- Clean notification titles & bodies (root-cause fix)
--
-- Two long-standing problems in the notifications produced by DB triggers:
--   1. Personal accounts sometimes store their raw wallet address as
--      `accounts.name`, so DM / feed-post pushes showed a "0x…" title.
--   2. Marketplace "Contact seller" messages are JSON payloads
--      ({"type":"listing_inquiry",…}); the DM push used the raw message content
--      as the body, so a JSON blob showed up as the notification text.
--
-- This migration adds a shared display-name resolver that never returns a
-- wallet address, and rewrites the DM and feed-post trigger functions to use it
-- (plus a clean preview for JSON message bodies).

-- 1. Resolve a human display name for an account, never a wallet address.
--    accounts.name (when not wallet-like) → owner wallet's users.display_name
--    → users.username → NULL.
CREATE OR REPLACE FUNCTION public.account_display_name(p_account_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name   text;
  v_wallet text;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Trust accounts.name only when it is set and not a wallet address.
  SELECT NULLIF(btrim(a.name), '') INTO v_name
    FROM public.accounts a
   WHERE a.id = p_account_id;

  IF v_name IS NOT NULL AND v_name !~* '^0x[a-f0-9]{6,}$' THEN
    RETURN v_name;
  END IF;

  -- Otherwise resolve the account's owner wallet and look up the user profile.
  SELECT ao.wallet_address INTO v_wallet
    FROM public.account_owners ao
   WHERE ao.account_id = p_account_id
   ORDER BY (ao.role = 'owner') DESC
   LIMIT 1;

  IF v_wallet IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
           NULLIF(btrim(u.display_name), ''),
           NULLIF(btrim(u.username), '')
         )
    INTO v_name
    FROM public.users u
   WHERE lower(u.wallet_address) = lower(v_wallet);

  -- Guard against display_name/username themselves being wallet-like.
  IF v_name IS NOT NULL AND v_name ~* '^0x[a-f0-9]{6,}$' THEN
    RETURN NULL;
  END IF;

  RETURN v_name;
END;
$$;

-- 2. Direct-message push: human title + clean body (no raw wallet / JSON).
CREATE OR REPLACE FUNCTION public.notify_new_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_account uuid;
  v_wallets text[];
  v_title text;
  v_body  text;
  v_json  jsonb;
  v_url   text;
  v_key   text;
BEGIN
  -- Legacy/wallet-only rows have no sender account — skip.
  IF NEW.sender_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Recipient = the conversation participant that isn't the sender.
  SELECT CASE
           WHEN c.participant_one_account_id = NEW.sender_account_id
             THEN c.participant_two_account_id
           ELSE c.participant_one_account_id
         END
    INTO v_recipient_account
    FROM public.conversations c
   WHERE c.id = NEW.conversation_id;

  IF v_recipient_account IS NULL THEN
    RETURN NEW;
  END IF;

  -- Owners/admins of the recipient account, excluding anyone who also owns the
  -- sender account (so the sender never notifies themselves).
  SELECT array_agg(DISTINCT ao.wallet_address)
    INTO v_wallets
    FROM public.account_owners ao
   WHERE ao.account_id = v_recipient_account
     AND ao.role IN ('owner', 'admin')
     AND ao.wallet_address NOT IN (
       SELECT wallet_address FROM public.account_owners WHERE account_id = NEW.sender_account_id
     );

  IF v_wallets IS NULL OR array_length(v_wallets, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Title = resolved sender display name (never a wallet address).
  v_title := COALESCE(public.account_display_name(NEW.sender_account_id), 'Neue Nachricht');

  -- Body = message excerpt. Marketplace inquiries are JSON payloads → render a
  -- short product preview instead of the raw JSON.
  v_body := NULLIF(btrim(NEW.content), '');
  IF v_body IS NULL THEN
    v_body := 'hat dir eine Nachricht gesendet';
  ELSE
    IF left(v_body, 1) = '{' THEN
      BEGIN
        v_json := v_body::jsonb;
      EXCEPTION WHEN others THEN
        v_json := NULL;
      END;
    END IF;

    IF v_json IS NOT NULL AND v_json->>'type' IN ('listing_inquiry', 'product_inquiry') THEN
      v_body := '📦 ' || COALESCE(NULLIF(btrim(v_json->>'title'), ''), 'Marktplatz-Anfrage');
    ELSIF v_json IS NOT NULL THEN
      v_body := 'Neue Nachricht';
    ELSIF length(v_body) > 140 THEN
      v_body := left(v_body, 140) || '…';
    END IF;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_new_direct_message: missing vault secrets, skipping push for message %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'type', 'direct_message',
      'title', v_title,
      'body', v_body,
      'walletAddresses', to_jsonb(v_wallets),
      'data', jsonb_build_object('type', 'direct_message', 'conversationId', NEW.conversation_id)
    )
  );

  RETURN NEW;
END;
$$;

-- 3. Feed-post push: use the wallet-safe resolver for the author title.
CREATE OR REPLACE FUNCTION public.notify_new_main_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      'data', v_data
    )
  );

  RETURN NEW;
END;
$$;
