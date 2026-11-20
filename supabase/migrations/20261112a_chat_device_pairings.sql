-- Device pairing for desktop clients of the chat suite (Ortis Studio).
-- Spec: docs/superpowers/specs/2026-11-12-ortis-studio-workspace-design.md §3.1
--
-- The desktop shows a short code (and QR). The owner approves it either in the Röbel app
-- (existing chat session) or in the browser after an Ortis ID login. The desktop polls with a
-- secret it alone holds (only its SHA-256 is stored) and receives a normal chat session token once.
--
-- Server-only: RLS on, no policies, grants revoked. Only apps/web (service role) touches it.

CREATE TABLE IF NOT EXISTS public.chat_device_pairings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL,
  poll_hash      text NOT NULL UNIQUE,
  device_name    text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'claimed')),
  wallet         text,
  approved_via   text CHECK (approved_via IN ('app', 'ortis_id')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  approved_at    timestamptz,
  claimed_at     timestamptz
);

-- A code is unique among live requests only; old rows may repeat it.
CREATE INDEX IF NOT EXISTS chat_device_pairings_code_idx
  ON public.chat_device_pairings (code, expires_at DESC);

ALTER TABLE public.chat_device_pairings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_device_pairings FROM anon, authenticated;
