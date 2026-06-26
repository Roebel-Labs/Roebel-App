-- Stadtkasse snapshot embed on posts.
--
-- A post can carry a FROZEN snapshot of the civic treasury (Stadtkasse) euro
-- figure, captured at compose time via the "@" menu in the Expo composer. There
-- is no Stadtkasse table — the value is computed from on-chain reads
-- (getTreasuryEuro: xDAI + EURe + Röbel Münzen on Gnosis) — so the frozen value
-- lives inline on the post row as a small JSON blob:
--
--   { "euro": 263.45, "captured_at": "2026-06-26T18:22:00.000Z" }
--
-- euro        = number, the frozen treasury figure (formatted de-DE at render)
-- captured_at = ISO string, metadata only (never displayed on the card)
--
-- NULL/absent  -> no card is rendered. `select('*')` already returns the column,
-- so no read-path query changes are required.

alter table public.posts
  add column if not exists stadtkasse_snapshot jsonb;

comment on column public.posts.stadtkasse_snapshot is
  'Frozen Stadtkasse snapshot captured at compose time: { euro: number, captured_at: iso-string }. NULL = no snapshot.';
