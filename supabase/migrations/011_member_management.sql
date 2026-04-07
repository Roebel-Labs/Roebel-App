-- 011_member_management.sql
-- Adds notifications inbox and invite tokens for org member management

-- ── Notifications table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_wallet TEXT NOT NULL,
  type             TEXT NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  is_read          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications (recipient_wallet);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_wallet, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (true);
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE USING (true);

-- Enable Realtime so clients receive instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ── Invite tokens table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invite_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by      TEXT NOT NULL,
  invited_wallet  TEXT,
  token           TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_account
  ON public.invite_tokens (account_id);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_invited_wallet
  ON public.invite_tokens (invited_wallet);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token
  ON public.invite_tokens (token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_pending
  ON public.invite_tokens (status) WHERE status = 'pending';

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_tokens_select" ON public.invite_tokens FOR SELECT USING (true);
CREATE POLICY "invite_tokens_insert" ON public.invite_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "invite_tokens_update" ON public.invite_tokens FOR UPDATE USING (true);
