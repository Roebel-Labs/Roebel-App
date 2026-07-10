-- XMTP v3 DM rail: set when a wallet's app installation registers an XMTP
-- inbox. Other clients use it as the deterministic "peer is reachable on
-- XMTP" signal for rail selection (canMessage alone would match users who
-- registered via third-party XMTP apps but run an old Röbel build).
alter table public.users
  add column if not exists xmtp_registered_at timestamptz;

comment on column public.users.xmtp_registered_at is
  'Set by the app after successful XMTP v3 inbox registration (rail-selection signal).';
