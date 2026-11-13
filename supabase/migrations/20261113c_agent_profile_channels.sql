-- The personal assistant as something the person owns: an editable profile, its own
-- mail address, and phone channels (SMS / WhatsApp) linked with a one-time code.

CREATE TABLE IF NOT EXISTS public.chat_agent_profiles (
  wallet                   text PRIMARY KEY,
  bot_id                   uuid REFERENCES public.chat_bots(id) ON DELETE SET NULL,  -- base assistant; null = default preset
  name                     text,                       -- the person's own name for the assistant
  personality              text NOT NULL DEFAULT 'standard',
  custom_instructions      text NOT NULL DEFAULT '',
  spoken_name              text NOT NULL DEFAULT '',   -- how the person's name sounds (voice)
  mail_alias               text UNIQUE,                -- <alias>@<mail domain>
  owner_email              text,                       -- the only address the assistant answers to
  owner_email_verified_at  timestamptz,
  email_briefing           boolean NOT NULL DEFAULT true,
  email_routines           boolean NOT NULL DEFAULT true,
  mail_thread_id           uuid,
  last_briefing_mail_on    date,
  welcomed_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet       text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('sms','whatsapp')),
  address      text NOT NULL,            -- E.164 phone number
  thread_id    uuid,
  verified_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, address)
);
CREATE INDEX IF NOT EXISTS chat_channels_wallet_idx ON public.chat_channels (wallet);

-- One-time codes: text it from the phone (sms/whatsapp) or type it in the app (email).
CREATE TABLE IF NOT EXISTS public.chat_channel_codes (
  code        text PRIMARY KEY,
  wallet      text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('sms','whatsapp','email')),
  address     text,                      -- email: the address being verified
  expires_at  timestamptz NOT NULL
);

-- Provider message ids already handled (webhooks are delivered at least once).
CREATE TABLE IF NOT EXISTS public.chat_inbound_seen (
  id          text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_inbound_seen   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_agent_profiles, public.chat_channels, public.chat_channel_codes, public.chat_inbound_seen FROM anon, authenticated;
