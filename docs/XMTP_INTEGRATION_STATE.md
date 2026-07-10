# XMTP DM Integration — State & Handoff (2026-07-10)

**READ THIS before touching anything DM/XMTP.** Companion docs:
spec `docs/superpowers/specs/2026-07-10-xmtp-dm-integration-design.md`,
plan `docs/superpowers/plans/2026-07-10-xmtp-dm-integration.md`,
research `docs/XMTP_RESEARCH_2026-07.md`.

## What shipped (apps/expo, on main)

XMTP v3 (MLS, `@xmtp/react-native-sdk@5.7.0`) as the E2E transport for
**personal↔personal** DMs, behind the existing UI. Supabase stays the registry
(conversation UUIDs, deep links, read state) and the rail for org/support
chats and not-yet-upgraded peers. Threads and the inbox render the **union**
of both rails; sends pick exactly one.

- Identity = the **thirdweb Gnosis smart account** (SCW signer, ERC-1271,
  chainId 100, silent signatures via inAppWallet). Deploy-first guard sends a
  sponsored no-op when the account is still counterfactual.
- New: `lib/xmtp/{native,client,codecs,transport,push}.ts`,
  `context/XmtpContext.tsx`, `components/messages/{PaymentBubble,MuenzenSendSheet}.tsx`.
- Modified: `hooks/useConversation.ts`, `context/MessagingContext.tsx`,
  `context/RoebelTalerProvider.tsx` (send → returns tx hash),
  `MessageBubble/ChatInput`, `app/messages/[conversationId].tsx`, `app/_layout.tsx`,
  `lib/supabase-{messages,users,app-settings}.ts`.
- Features: **in-chat Röbel Münzen payments** (gasless group-token transfer +
  `transactionReference` receipt bubble — Base-App-compatible wire format),
  emoji **reactions**, **read receipts** ("Gelesen"), **blocking** (consent),
  sticker + listing-inquiry parity, sender-triggered push through the existing
  `send-notification` edge function (same payload as the DB trigger).
- Safety: remote kill switch `app_settings.xmtp_dms_enabled` ('false' = off),
  lazy native imports (old builds can never crash), rail falls back to
  Supabase on any XMTP failure.
- DB: `users.xmtp_registered_at` (migration `20260710_xmtp_registration.sql`,
  **applied to live Supabase**) — the peer-readiness signal for rail selection.

## What it needs from Max (operational gates)

1. **New EAS build** (`eas build`) — the SDK + expo-secure-store are native
   modules; nothing XMTP works in existing builds. JS-only OTA updates to old
   builds are safe (lazy loading), but the rail activates only in the new
   build. iOS ≥16.0 / minSdk 26 already satisfied; `runtimeVersion: appVersion`.
2. **On-device smoke test** (2 accounts, new build): send text both ways,
   send Münzen, react, block/unblock, push arrival, old-thread history intact.
   Automated verification here covered typecheck/lint only — no simulator run.
3. Optional: seed `app_settings.xmtp_dms_enabled='false'` first and flip to
   enabled when ready (missing key = enabled).

## Known limits / phase 2 backlog

- **Org accounts stay on Supabase rail** → model as XMTP groups synced to
  `account_owners` later.
- **Payments**: only personal↔personal (XMTP rail). "Münzen anfordern"
  (payment requests) via `wallet-send-calls` (EIP-5792) is the natural next
  feature; also consider org payments once orgs have a treasury address.
- **Attachments**: image/voice via `RemoteAttachmentCodec` + an encrypted-blob
  bucket (Supabase storage). Replies (`reply` codec) render as fallback text
  for now. Disappearing messages are SDK-native when wanted.
- **Push**: sender-triggered (sender online by definition). A self-hosted XMTP
  notification server (Fly) + NSE would add offline-sender pushes and true
  E2E notifications.
- **Message requests ("Anfragen")**: consent-state UI for unknown senders;
  today unknown external XMTP wallets (not in `users`) are ignored.
- **Unread badge**: XMTP side counts per-conversation (capped 99), merged with
  the Supabase RPC count.
- **10-installation cap** per inbox (XMTP): many reinstalls could hit it;
  `Client.revokeInstallations` exists if a user gets stuck.
- **XMTP decentralization cutover** (date TBD): re-check network status; when
  it lands, apps pay ~$5/100k messages via a funded gateway (see research doc).

## apps/web (phase 2 sketch)

Web has a full Supabase DM product (`apps/web/src/components/messages/*`).
Port the same rail model with `@xmtp/browser-sdk@7.x`: client-only dynamic
import (no SSR), WASM served from `public/wasm/` (gitignore entry + header
route already exist), same SCW signer via thirdweb, same
`users.xmtp_registered_at` signal. Caveats: the web local db (OPFS) is
**unencrypted** (platform limitation) and heavy deps must respect the Vercel
8GB OOM rules (`serverExternalPackages` — but the browser SDK is client-side
anyway). The RN `lib/xmtp/transport.ts` mapping logic is the reference
implementation to mirror.
