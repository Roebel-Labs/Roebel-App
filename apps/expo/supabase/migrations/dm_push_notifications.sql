-- Direct-message push notifications
--
-- When a direct_message is inserted, notify every wallet that is an owner or
-- admin of the RECIPIENT account, on the device they are logged in on. Fires
-- the existing `send-notification` Edge Function via pg_net (async), scoped to
-- the recipients' wallets.
--
-- Prereqs (already present from the feed-post feature):
--   * pg_net + supabase_vault extensions
--   * Vault secrets edge_send_notification_url / edge_send_notification_key

-- 1. Link a device's push token to the logged-in wallet so pushes can target
--    a specific user. Populated by the client on login / account switch.
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS wallet_address TEXT;
CREATE INDEX IF NOT EXISTS idx_push_tokens_wallet
  ON public.push_tokens (lower(wallet_address));

-- 2. Per-device opt-out for direct-message notifications (defaults on).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS dms_enabled BOOLEAN NOT NULL DEFAULT true;

-- 3. Trigger function: resolve recipient account → owner/admin wallets, build a
--    German payload, and call the Edge Function scoped to those wallets.
CREATE OR REPLACE FUNCTION public.notify_new_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_account uuid;
  v_wallets text[];
  v_sender_name text;
  v_title text;
  v_body  text;
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

  -- Title = sender account name; body = message excerpt (or sticker fallback).
  SELECT a.name INTO v_sender_name FROM public.accounts a WHERE a.id = NEW.sender_account_id;
  v_title := COALESCE(NULLIF(btrim(v_sender_name), ''), 'Neue Nachricht');

  v_body := NULLIF(btrim(NEW.content), '');
  IF v_body IS NULL THEN
    v_body := 'hat dir eine Nachricht gesendet';
  ELSIF length(v_body) > 140 THEN
    v_body := left(v_body, 140) || '…';
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

-- 4. Fire on every new direct message.
DROP TRIGGER IF EXISTS trg_notify_new_direct_message ON public.direct_messages;
CREATE TRIGGER trg_notify_new_direct_message
  AFTER INSERT ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_direct_message();
