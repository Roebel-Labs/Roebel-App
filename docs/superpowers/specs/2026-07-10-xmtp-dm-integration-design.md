# XMTP DM Integration — Design Spec

**Date:** 2026-07-10
**Scope:** `apps/expo` (priority). `apps/web` is phase 2 (documented here, not implemented).
**Status:** Draft for review — implementation proceeds behind a kill switch; everything is reversible.

## 1. Goal

Re-introduce the XMTP protocol as the transport for direct messages in the Röbel app — this time on **XMTP v3 (MLS)**, not the v2 stack that was buggy and got replaced by Supabase Realtime — while:

1. keeping the existing DM design and every existing feature working (inbox, threads, stickers, listing inquiries, org accounts, push, unread counts, deep links),
2. making the **thirdweb inAppWallet + ERC-4337 smart account the one and only identity** (no new keys, no new login),
3. adding new messenger features that XMTP unlocks, headlined by **in-chat Röbel Münzen payments** (the Base App / World App pattern), plus reactions, read receipts, and blocking,
4. never breaking users on old builds (the XMTP native module only exists in the next EAS build).

## 2. Why it will not repeat the v2 failure

The old integration ran on XMTP v2: a JS-heavy stack, wallet-pair topics, no groups, no local database, brittle streams. XMTP shut v2 down (writes ended May–June 2025) and rebuilt the protocol:

- **v3 = MLS (RFC 9420)** group encryption with forward secrecy + post-compromise security; 1:1 chats are 2-member MLS groups.
- The SDK core is **libxmtp (Rust)** with a local **SQLCipher-encrypted SQLite** db on device; the RN SDK (`@xmtp/react-native-sdk`, latest **5.7.0**) is a thin Expo-module binding. Message history, conversation list, and sends are local-first.
- Identity moved to **inbox IDs**: one inbox can hold multiple wallets and up to 10 app "installations"; smart contract wallets are first-class (ERC-1271 signature verification with an explicit chain id).
- Production apps run on it at scale: Base App (Coinbase) and Convos ship XMTP v3 messaging, including in-chat payments via standard content types.

Defensive posture anyway (lesson learned): the integration is **additive**, sits behind a **remote kill switch** (`app_settings.xmtp_dms_enabled`), the Supabase rail remains fully functional, and the native module is **lazy-loaded** so a JS update can never crash an old build that lacks it.

## 3. Constraints (verified in-repo)

- Expo SDK 55, RN 0.83.2, React 19.2, new architecture ON, `runtimeVersion.policy = appVersion`.
- iOS `deploymentTarget` 16.0 (XMTP requires ≥16.0 ✓), Android `minSdkVersion` 26 (XMTP requires ≥22 ✓). No Expo Go; EAS dev/prod builds — **XMTP ships only with the next native build** (user runs `eas build`/`eas update` himself).
- DMs are **account↔account** (`conversations` UUID registry, pair-keyed on `accounts.id`); org accounts are multi-wallet (`account_owners`, roles owner/admin). XMTP is wallet/inbox-addressed — the mapping is the heart of this design.
- Transport is isolated behind three files (`lib/supabase-messages.ts`, `hooks/useConversation.ts`, `context/MessagingContext.tsx`); all UI consumes the `Message`/`ConversationWithLastMessage` type shapes.
- Wallet: thirdweb v5 (`5.119.3` resolved), inAppWallet + smart account, `sponsorGas: true` on Base **and** Gnosis; the **same deterministic smart-account address on both chains**; the Gnosis account already sends gasless txs (MACI, Münzen). `users.wallet_address` stores it lowercased.
- Röbel Münzen P2P transfer **already exists and is gasless**: `useRoebelTaler().send(to, amount)` → ERC-1155 `safeTransferFrom` of the group token on the Circles Hub (Gnosis). UI copy: "Röbel Münzen", never CRC.
- German UI, `StyleSheet.create()` + `useTheme()`, never render 0x addresses (`safeDisplayName`).

## 4. Approaches considered

**A. Full cutover to XMTP** (drop Supabase DMs, orgs as XMTP groups, migrate history). Rejected: breaks old builds instantly, org/support flows become fragile day one, E2E history can't be backfilled honestly, and it maximizes the blast radius the user explicitly fears from the v2 experience.

**B. Separate "private chat" product next to existing DMs.** Rejected: two inboxes, split-brain UX, payments land in a silo — does not satisfy "integrate into the direct messages".

**C. Rail-picker behind the existing UI (chosen).** The Supabase `conversations` row stays the canonical registry for every conversation (ids, deep links, dedup, unread anchor). Per conversation, the client picks the transport:

- **XMTP rail** iff my active account is personal AND the peer account is personal AND the peer has registered XMTP (`users.xmtp_registered_at` set) AND `canMessage(peer)` confirms reachability.
- **Supabase rail** otherwise (org-involved conversations, support contact, peers on old builds).

Threads render the **union** of legacy Supabase rows and XMTP messages (sorted by time), so history is preserved and rail upgrades are seamless. Receiving always reads both rails, which makes the rail decision a **send-time-only** concern — no flapping hazards. iMessage's blue/green-bubble model, applied to a Dorf.

## 5. Identity design (thirdweb — hard requirement)

- **XMTP identity = the smart-account address** (identical on Base/Gnosis, already the app-wide user key). Signer type **SCW** with `chainId = 100` (Gnosis): ERC-1271 verification runs against Gnosis, where users' accounts actually transact.
- Signer implementation wraps `gnosisAccount.signMessage({ message })` from `GnosisWalletContext` — the exact pattern already proven by MACI key derivation and the mini-app EIP-1193 bridge. inAppWallet signs silently (no user prompt).
- **Deployment guard:** ERC-1271 needs deployed code. Before first client creation, check `isContractDeployed` on Gnosis; if undeployed (brand-new user who never transacted), send a gasless no-op self-transaction (sponsored, ~seconds) to deploy, then proceed. Belt-and-braces even if the network accepts ERC-6492 pre-deploy signatures.
- **Local db encryption key:** random 32 bytes per device, generated with the existing crypto polyfill, stored in **expo-secure-store** (docs-recommended; Keychain/Keystore) keyed by wallet address. The SDK never persists this key; loss ⇒ the local db is unrecoverable and the client falls back to a fresh installation (re-registration signature, local history re-synced where the network still has it). That recovery path is handled explicitly.
- **Client lifecycle:** one client per wallet (not per active account), created after `autoConnectFinished && gnosisAccount ready` — mirroring the UserContext invariant so the reconnect window never tears the client down. Real logout closes the client and drops nothing else.
- After successful registration the app sets `users.xmtp_registered_at` (new column, one migration) — the deterministic readiness signal other clients use for rail selection (avoids "sent into the void via Base App registration" edge cases that `canMessage` alone would allow).

## 6. Feature set

### v1 (this build)

| Feature | Mechanism | Rail |
|---|---|---|
| Text DMs | standard `text` content type | XMTP preferred, Supabase fallback |
| Stickers | custom JSON codec `roebel.de/sticker:1.0` `{ stickerRewardId }`, `contentFallback: "🎁 Sticker"`; mapped back to the existing `sticker_reward_id` + `lootbox_rewards` join | both (Supabase keeps column) |
| Listing inquiries | unchanged JSON-in-text (existing `MessageBubble` parser works on both rails) | both |
| **Münzen senden in chat** | existing gasless `useRoebelTaler().send()` → then message with standard `transactionReference` content type (`xmtp.org/transactionReference:1.0`, `networkId eip155:100`, tx hash + metadata) → `PaymentBubble` renders "X Röbel Münzen" | XMTP only (personal↔personal; recipient = peer's wallet, unambiguous) |
| Reactions | standard `reaction` content type; long-press bubble → emoji row; aggregated chips under bubbles | XMTP only |
| Read receipts | standard `readReceipt` content type sent on thread focus; "Gelesen" under own last message | XMTP only |
| Blocking | XMTP consent `deny` on the conversation; thread menu "Blockieren"; denied conversations hidden from inbox | XMTP only (new capability) |

Push notifications for XMTP sends: the **sender's client** invokes the existing `send-notification` edge function with the exact payload the DB trigger uses today (`type: direct_message`, `walletAddresses` = peer account's owner/admin wallets minus own, `data.conversationId` = registry UUID) — deep links, foreground suppression, and `dms_enabled` preferences all keep working unchanged. Payment/sticker pushes use neutral bodies ("hat dir Röbel Münzen gesendet" / sticker text), no amounts.

Unread counts: existing RPC for the Supabase rail + client-computed XMTP unread (lastMessage.sentAt vs the conversation's Supabase `last_read_at`, which `markConversationRead` already maintains cross-device). No schema change.

Inbound XMTP conversations with no registry row (e.g. peer started the chat): resolve peer wallet → personal account → `findOrCreateConversation` lazily. Wallets unknown to Röbel (external XMTP apps): ignored in v1 (counted in dev logs), never rendered as 0x.

### Phase 2 (documented, not in this build)

Image/voice attachments (`remoteAttachment` + encrypted blob in a Supabase storage bucket), replies (`reply` content type), **"Münzen anfordern" payment requests** (`wallet-send-calls`, EIP-5792 — the request half of the Base App payment pattern), disappearing messages (SDK-native), org accounts as XMTP **groups** (membership synced to `account_owners`), a message-requests ("Anfragen") consent UI for external XMTP senders, decentralized push via a self-hosted XMTP notification server on Fly, and the `apps/web` integration (`@xmtp/browser-sdk` 7.x — WASM already anticipated in the repo: `public/wasm/` gitignore entry + `application/wasm` header route exist; needs client-only dynamic import, and note the web local db is **unencrypted** by platform limitation).

## 7. Architecture

```
app/messages/* + components/messages/*   ← unchanged UI (screens, bubbles, input)
        │  consumes Message / ConversationWithLastMessage (additive fields only)
        ▼
hooks/useConversation.ts        ← merges rails per thread, picks send rail
context/MessagingContext.tsx    ← merges rails for inbox + unread badge
        │
        ├── lib/supabase-messages.ts        (existing, untouched behavior)
        └── lib/xmtp/
             ├── client.ts      — lazy native import, client create/cache, db key,
             │                    deploy guard, users.xmtp_registered_at flag
             ├── signer.ts      — SCW signer over gnosisAccount (chainId 100)
             ├── codecs.ts      — text/reaction/readReceipt/transactionReference + roebel sticker codec
             ├── transport.ts   — rail decision, send/list/stream, XMTP→Message mapping
             └── push.ts        — sender-triggered send-notification invoke
context/XmtpContext.tsx          ← provider under GnosisWalletProvider; boot gating,
                                   kill switch (app_settings), registration state
```

**Additive `Message` fields:** `source: 'supabase' | 'xmtp'`, `reactions?: { emoji, count, reactedByMe }[]`, `payment?: { txHash, amountRaw, currency: 'muenzen', direction }`, `deliveryStatus?: 'sending' | 'sent' | 'failed'`. Existing consumers ignore them; `MessageBubble` gains payment + reaction rendering; `ChatInput` gains a Münzen button (visible only on the XMTP rail).

**Streaming:** one `conversations.streamAllMessages()` in `XmtpContext` feeds MessagingContext (inbox refresh + unread) and the open thread (via the active-conversation id). Streams are re-established on foreground (`AppState`), matching XMTP RN guidance that streams die in background.

**Failure handling:** XMTP client creation failure → app runs Supabase-only (log to Sentry, no user-visible change). XMTP send failure → bubble marked failed with retry (no silent cross-rail fallback — prevents duplicates). Payment tx success + message send failure → funds moved; receipt message is retried from a local queue; balance refresh covers the recipient regardless.

## 8. Rollout & compatibility

| | Peer: old build | Peer: new build |
|---|---|---|
| **Me: old build** | Supabase, unchanged | I send Supabase; peer reads both rails → fine |
| **Me: new build** | Peer unregistered → Supabase rail | Both registered → XMTP rail; legacy history stays visible |

- Old builds never load XMTP code paths (module absent → lazy import guard falls back; `runtimeVersion: appVersion` additionally fences OTA updates).
- Kill switch: `app_settings` key `xmtp_dms_enabled` (missing/`'true'` = on, `'false'` = off) — remote off returns everyone to Supabase sends without an update.
- One Supabase migration: `users.xmtp_registered_at timestamptz` (nullable). Applied via Supabase MCP.
- Requires a **new EAS build** (native module); until the user runs it, everything ships dark and inert.
- **Network env: `production`** (same as Base App). Messaging is free today (centralized V3 network). When XMTP's decentralized cutover eventually lands (date unresolved as of 2026-07-10), apps fund users' messages via a gateway at ~$5 per 100k messages — a future operational line item, re-check status before that launch.
- Top build risk: `@xmtp/react-native-sdk` 5.7.0 (Mar 2026) on RN 0.83.2/new-arch is unproven until the user's EAS build compiles; contingency = pin an older Expo-module-compatible release or patch-package.

## 9. Verification plan

- Scoped `tsc` + ESLint on all touched/new files (repo has ~431 pre-existing errors — compare before/after, no new ones).
- `npx expo export` bundle check to prove module resolution + lazy-import guards don't break Metro.
- Pure-function unit checks where feasible (XMTP→Message mapping) without native runtime.
- On-device end-to-end (two accounts, payment send, reactions, push) **requires the user's EAS build** — explicitly out of scope for this session and called out in the handoff.

## 10. Research appendix (protocol facts)

See `docs/XMTP_RESEARCH_2026-07.md` (committed alongside this spec) for the full cited research report: protocol/network status, SDK APIs, content-type registry, push options, and production-app precedents.
