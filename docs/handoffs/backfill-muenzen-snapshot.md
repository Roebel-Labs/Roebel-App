# Handoff: backfill a Gemeinschaftskasse snapshot onto a post (via Supabase MCP)

**For:** a fresh Claude Code agent in this repo that HAS the Supabase MCP loaded
(`claude mcp list` shows `supabase … ✓ Connected`, project ref
`wwbeqhkslxdxhktqzqti`). If the MCP tools aren't available, stop and tell the user
to reload the session — do not guess.

## What you're doing

The app supports a frozen "Gemeinschaftskasse" (civic treasury) balance snapshot on a
feed post, stored in the jsonb column **`public.posts.stadtkasse_snapshot`** with shape:

```json
{ "euro": 263.82, "captured_at": "2026-06-27T10:30:00.000Z" }
```

- `euro` — number; the figure rendered on the card (German `263,82 €`).
- `captured_at` — ISO string; **metadata only, never displayed**.

When this column is non-null the Expo feed + post-detail render a tappable
"Gemeinschaftskasse" card (`apps/expo/components/feed/StadtkasseSnapshotCard.tsx`)
between the body text and the images. The user created a post but forgot to tap the
`@` button, so the column is `null`. **Your job: set it on that one post.**

## The value to store

`euro = 263.82`. This is the current treasury figure (xDAI 286.76 × 0.92 + EURe 0.00,
read from the Gemeinschaftskasse Safe `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` on
Gnosis). A frozen snapshot taken seconds after the post is accurate, so `263.82` is fine.
Use `now()` for `captured_at`.

(Optional — only if the user wants it re-read fresh: recompute via the Gnosis RPC —
`eth_getBalance` of the Safe for xDAI, and `balanceOf` on EURe
`0xcB444e90D8198415266c6a2724b7900fb12FC56E`, then `xDAI/1e18 * 0.92 + EURe/1e18`.)

## Steps (all via the Supabase MCP — execute_sql)

### 1. Find the post — confirm WHICH row before writing
Run a read and show the candidates to the user; do not assume the newest row is theirs
until they confirm (other people post too).

```sql
select id, wallet_address, left(content, 80) as preview, created_at, stadtkasse_snapshot
from public.posts
order by created_at desc
limit 10;
```

Ask the user to point at the right `id` (or narrow by a phrase from their post text /
their wallet address). Get an explicit confirmation of the target `id`.

### 2. Set the snapshot (paste the confirmed id)

```sql
update public.posts
set stadtkasse_snapshot = jsonb_build_object('euro', 263.82, 'captured_at', now())
where id = '<CONFIRMED_POST_ID>'
returning id, content, stadtkasse_snapshot;
```

Only one row should be affected. If 0 rows or >1 rows, stop and report — don't retry blindly.

### 3. Verify + tell the user
Confirm the `returning` row shows `stadtkasse_snapshot` populated with `euro = 263.82`.
Tell the user to pull-to-refresh the feed; the Gemeinschaftskasse card should now appear
under their post text and on the post detail.

## Guardrails

- This is a single-row, opt-in backfill. **Never** run an UPDATE without a `where id = …`.
- Don't touch any other column or row.
- `captured_at` is never shown, so `now()` is correct.
- If the Supabase MCP tools aren't loaded, do NOT improvise another DB path — report back.
```
