# Live Room: app-native DanceCup livestream (2026-11-05)

**Status:** building (Max: "okay go build", 2026-11-05) · **Event:** DanceCup Röbel, Sat 2026-11-07 · **Rehearsal:** Fri 11-06
Supersedes §5.4 of `2026-10-22-roebel-studio-livestream-design.md` for this year. The Electron studio is NOT built
for 11-07: **OBS produces the stream**; our graphics are a web page OBS loads as a browser source.

```
 Sony FX / iPhone ─▶ OBS (MacBook) ─RTMPS─▶ Cloudflare Stream Live input ─▶ simulcast outputs: YouTube, Facebook
                    ▲  browser sources:                    │ HLS (+ recording → replay)
                    │  /live/<slug>/overlay                 ▼
                    │  (/live/<slug>/guest, stretch)  Röbel App live room (expo-video, PiP, background audio)
                    │                                       │ chat · reactions · Unterstützen · Publikumsliebling · reminders
                    └──── Supabase Realtime (postgres_changes + broadcast + presence) ◀┘
 Operator console /admin/dashboard/live (Max's laptop/phone): rundown, on-stage, chat moderation, alerts, poll, CF input
```

## Data (migration `supabase/migrations/20261105_live_room.sql`)

All new tables are prefixed `live_` (a legacy `livestreams` table exists; do not touch it).

| table | key columns | anon access |
|---|---|---|
| `live_shows` | `id, slug unique, event_id → events, title, subtitle, status ('scheduled'\|'live'\|'ended'), hls_url, replay_url, poster_url, starts_at, cf_live_input_id, beneficiary_account_id → accounts, current_item_id → live_rundown_items, chat_enabled bool, slow_mode_seconds int, voting_open bool, overlay jsonb, updated_at` | SELECT all columns **except** none secret (the RTMPS key is never stored) |
| `live_rundown_items` | `id, show_id, position int, title, subtitle, detail, org_account_id, image_url, planned_at, status ('upcoming'\|'on_stage'\|'done'), on_stage_at` | SELECT |
| `live_chat_messages` | `id, show_id, wallet, display_name, avatar_url, body (1–280), kind ('chat'\|'support'\|'system'), amount_cents, created_at, hidden_at, featured_at` | SELECT where `hidden_at is null` |
| `live_supports` | `id, show_id, display_name, message, show_name, amount_cents, status ('pending'\|'paid'\|'expired'\|'refunded'), stripe_*` | none |
| `live_votes` | `show_id, item_id, wallet, unique(show_id, wallet)` (one vote, changeable) | none; RPC `live_vote_results(p_show_id)` → `(item_id, votes)` |
| `live_reminders` | `item_id, wallet, unique(item_id, wallet), sent_at` | none |
| `live_mutes` | `show_id, wallet` | none |

`live_shows.overlay` (jsonb, operator-controlled, drives the OBS page):
`{ lower_third: bool, next_up: bool, bug: bool, qr: bool, poll: bool, alerts: bool, reactions: bool, featured_message_id: uuid|null, message: string|null }`

Realtime publication: `live_shows`, `live_rundown_items`, `live_chat_messages`.
Seed: show `dancecup-2026` linked to the DanceCup event, beneficiary = the sponsoring campaign's beneficiary.

**Realtime channel** `live:<show_id>` (Supabase broadcast + presence, anon key):
- presence: each viewer tracks `{ k: <random device key> }` → viewer count = number of presence keys.
- broadcast `react`: `{ e: '❤️'|'🔥'|'👏'|'💃'|'🎉' }`, client throttle ≤ 4/s. The overlay renders them on air.

## Web API (apps/web, scope `roebel-live-v1`)

`POST /api/live` signed (`verifySignedRequest`, scope `roebel-live-v1`):
- `live_session { show_id }` → `{ token, expires_at, display_name, avatar_url }` — HMAC token (12 h) so chat/vote/remind don't need a signature each.

`POST /api/live/act` with header `Authorization: Live <token>`, JSON `{ action, ... }`:
- `chat { show_id, body }` → `{ message }` (429 `SLOW_MODE`, 403 `MUTED`/`CHAT_CLOSED`)
- `vote { show_id, item_id }` → `{ ok }` (409 `VOTING_CLOSED`)
- `remind { item_id, on: bool }` → `{ on }`
- `my_state { show_id }` → `{ vote_item_id, reminder_item_ids }`

`POST /api/live/support` (public, IP rate-limited): `{ show_id, amount_cents (100–50000), display_name?, message? (≤140), show_name: bool, wallet? }`
→ `{ url, support_id }` Stripe Checkout (direct charge on the beneficiary's connected account, card only, `metadata.kind='live_support'`).
Webhook `/api/webhooks/stripe-connect` settles it → `live_supports.status='paid'` + inserts a `live_chat_messages` row
`kind='support'` (display_name = name or "Jemand", body = message or "", amount_cents) → app + overlay see it via Realtime.
Return URL: `/live/support/return?support_id=…&return_to=roebel://live/<slug>`.

`GET /api/live/<slug>/results` (public, cached 5 s) → `{ items: [{ item_id, title, votes }] }` for app + overlay.

Operator: `POST /api/live/admin` (admin cookie, `isAuthenticated()`), `{ action, show_id, ... }`:
`set_status {status}`, `set_on_stage {item_id}` (marks previous done, pushes reminders of that item: "Jetzt auf der Fläche: …"),
`next` (advance to next upcoming), `rundown_replace {rows:[{title,subtitle,detail,planned_at}]}` (CSV import),
`rundown_upsert {item}`, `rundown_delete {item_id}`, `set_overlay {patch}`, `set_flags {chat_enabled, slow_mode_seconds, voting_open}`,
`hide_message {message_id}`, `feature_message {message_id|null}`, `mute {wallet}`, `cf_create_input` (creates the Cloudflare
live input, stores `cf_live_input_id` + `hls_url`), `cf_input_info` (→ rtmps url + stream key + connection state, never stored),
`cf_add_output {url, stream_key}`, `cf_list_outputs`, `cf_delete_output {output_id}`, `system_message {body}`.

## Clients

**Expo** (`app/live/[slug].tsx`, runtime 3.9.0 OTA; uses no LiveKit so it also runs on 3.7.0):
native `expo-video` player (PiP, background audio, live-edge badge, retry while the input is offline, "Gleich geht's los"
countdown before start), chat over/under video, floating reactions, viewer count, Unterstützen sheet → Stripe Checkout,
"Jetzt auf der Fläche / Als Nächstes" card + "Erinnern" bell per rundown item, Publikumsliebling voting sheet with live
results. Entry points: LivestreamBanner, event page CTA, deep link `roebel://live/<slug>`. Event pages whose event has a
`live_shows` row open the live room instead of the YouTube embed.

**Web**: `/live/<slug>/overlay` (1920×1080, transparent, OBS browser source: lower third of the on-stage item, "Als Nächstes",
logo bug + "Live in der Röbel App" QR, support alerts, featured chat message, poll results, on-air reactions).
`/admin/dashboard/live` operator console. `/live/support/return` landing.

## Rules carried over
UI German, code English · no wallet addresses on screen · "Unterstützen", never "Spende" · votes are a "Meinungsbild" ·
Expo: StyleSheet + useTheme · Stripe: direct charges only, never Münzen through Stripe · no secrets in clients.

## Part 2 (2026-11-05 evening): Röbel Studio first, guests, test show

Max: "everything runs fully functional by only using Röbel Studio". OBS + the web console stay as the fallback.
Migration `20261106_live_guests_test_show.sql`: `live_shows.is_test`, `live_shows.guests_enabled`, `live_guest_requests`, show `testlauf`.

**Studio auth:** `/api/live/admin` also accepts `Authorization: Studio <LIVE_STUDIO_TOKEN>` (Vercel env, ≥ 24 chars). The
operator pastes it once into the studio's Live-Raum panel (own localStorage key, never in ShowState).

**Guests (LiveKit, Vercel env `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`):** one LiveKit room per accepted request.
- Phone (3.9.0 runtime only, `@livekit/react-native`): act `guest_request { show_id, note? }` → `{ request }`; poll
  `guest_status { show_id, request_id }` every 2 s → once `accepted`: `{ status, room, livekit_url, token }` → join, publish
  camera + mic, show the studio's return feed if any; `guest_cancel` to leave. Status `declined`/`ended` → close.
- Studio: admin `guest_list` (poll 2 s) → `{ requests: [{ id, display_name, avatar_url, note, status, room, created_at }], livekit }`;
  `guest_accept { request_id }` → `{ room, livekit_url, token }` (studio joins the room, guest video becomes a source);
  `guest_studio_token` (re-join), `guest_decline`, `guest_end`.

**Test show `testlauf`** (`is_test`, always live on a public test HLS stream, sample rundown, voting open): reachable from the
app's developer settings. act `test_support { show_id, amount_cents, body? }` posts a fake support (no money) and
`test_next { show_id }` advances the on-stage item (wraps around, sends the reminder pushes) — both refused on real shows.
Unterstützen with real money stays off on the test show (no beneficiary).
