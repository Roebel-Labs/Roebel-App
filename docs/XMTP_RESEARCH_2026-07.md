# XMTP Protocol — Deep Research Report (2026-07-10)

Produced by a fan-out research pass (25 primary sources fetched, 124 claims extracted, top 25 adversarially verified by 3-voter panels: 17 confirmed, 8 refuted). Facts below are the **verified** set, plus SDK ground truth pulled directly from npm/GitHub. This report backs the design in `docs/superpowers/specs/2026-07-10-xmtp-dm-integration-design.md`.

## 1. Protocol & network status

- **Current protocol = "v3" generation built on MLS (IETF RFC 9420)** — group-based E2E encryption with forward secrecy and post-compromise security; 1:1 DMs are 2-member MLS groups. The libxmtp (Rust) MLS implementation was independently audited by NCC Group (Dec 2024). ([protocol overview](https://docs.xmtp.org/protocol/overview))
- **XMTP V2 is dead.** Client support ended May 1, 2025; the network went read-only June 23, 2025 (XIP-53). Anything shipped today is v3/MLS — the buggy v2-era stack this repo removed no longer exists. ([XIP-53](https://community.xmtp.org/t/xip-53-xmtp-v2-deprecation-plan/867))
- **Identity is inbox-centric:** an **inbox ID** owns multiple identities (EOA and SCW wallet addresses; extensible to passkeys) and up to **10 app installations** (devices); `Client.revokeInstallations` exists for the cap. 256 lifetime identity updates per inbox. ([manage-inboxes](https://docs.xmtp.org/chat-apps/core-messaging/manage-inboxes), [identity](https://docs.xmtp.org/protocol/identity))
- **Network today: still the centralized V3 production network** (verified as of the Jan-2026 update; live checks 2026-07-10 found no mainnet-cutover announcement). The decentralized network ("D14N") is a migration in progress: Phase 1 = 7 vetted permissioned nodes (jurisdictional diversity caps), Phase 2 = XMTP Commons governance (Wyoming DUNA) + token staking/slashing, Phase 3 = permissionless. Timing claims ("March 2026", "mid-2026 cutover") were **refuted** — treat launch date as unresolved; a 60-day migration window and ~30 min app downtime are planned at cutover. ([decentralization update](https://blog.xmtp.org/xmtps-decentralization-update-jan-2026/), [xmtp.org/decentralization](https://xmtp.org/decentralization))
- **Costs: zero today** (centralized V3 network, no fee schedule in force). After cutover, apps fund their users' messaging via a **gateway** (proxy that pays and forwards): Phase-1 pricing ≈ **$5 per 100,000 messages** (~$0.00005/msg) in USDC with base/storage/congestion components, settled only after majority node attestation (XIP-57). Hosted third-party gateways exist (GatewayHost). For Röbel-scale traffic this is euros per year, but it is a future operational line item: re-check network status before/at cutover. ([calculate-fees](https://docs.xmtp.org/fund-agents-apps/calculate-fees))
- Testnet (launched ~Feb 2025) self-reports 150M+ messages processed; nodes hold fully replicated, quantum-resistant (XWING hybrid post-quantum KEM) encrypted copies within a ~60-day default retention window. (2-1 vote — self-reported figure.)

## 2. React Native SDK (the one we ship)

- **Package:** `@xmtp/react-native-sdk`, latest **5.7.0** (2026-03-14, MIT, SLSA provenance; still `latest` as of 2026-07-10). Repo: [xmtp/xmtp-react-native](https://github.com/xmtp/xmtp-react-native). Adoption is niche (~850 weekly downloads) — plan for reading SDK source over Stack Overflow.
- **Packaging: an Expo native module** (expo-module-scripts; `expo-module.config.json` + Kotlin/Swift sources in the tarball; peer deps exactly `{expo:*, react:*, react-native:*}`). Requires a **custom dev build / EAS build** — never Expo Go. No config plugin needed; managed projects just install + prebuild.
- **Platform minimums:** iOS deployment target **≥16.0** (repo Podfile: "required by XMTP"); Android — README says minSdk 22 but that is **stale/refuted**: the SDK's own `build.gradle` sets **minSdk 23** and wraps `org.xmtp:android` (4.10.x). Röbel is at iOS 16.0 / minSdk 26 → both fine.
- **dbEncryptionKey:** 32 bytes (Uint8Array), **app-managed**; the SDK never stores it. Loss/change ⇒ the local SQLCipher db is unrecoverable and the client falls back to creating a **new installation** (new registration signature; local history lost unless history sync restores from another installation). Store in `expo-secure-store` (docs-recommended). ([create-a-client](https://docs.xmtp.org/chat-apps/core-messaging/create-a-client))
- Local-first: conversations/messages live in an on-device SQLite db; the exact `Client.create` internals claim was partially refuted — **verify API shapes against the installed 5.7.0 typings, not blog posts** (done during implementation).

## 3. Signer / smart contract wallets (thirdweb fit)

- **SCW is a first-class identity kind** (XIP-44, Final since Mar 2024): any ERC-4337 wallet can create/link an XMTP identity. Signer interface: EOA = `{ type:'EOA', getIdentifier, signMessage }`; SCW adds **required `getChainId()`** (e.g. **100 for Gnosis**) and optional `getBlockNumber()` (defaults to latest). Verification is **ERC-1271** with chain-id-mismatch protection (`AssociationError.ChainIdMismatch`); chain id 0 is the EOA sentinel. ([create-a-signer](https://docs.xmtp.org/chat-apps/core-messaging/create-a-signer))
- **ERC-6492 (undeployed/counterfactual accounts) is NOT verified as supported.** Consequence for Röbel: ensure the Gnosis smart account is **deployed** before registration — check `isContractDeployed`, and if needed send one gasless no-op (sponsored) to deploy. Most active users already transact on Gnosis (Münzen mint, MACI), so this only affects brand-new accounts.
- thirdweb v5 `Account.signMessage` on a smart account yields an ERC-1271-verifiable signature against the configured chain — matching the SCW signer contract above. (App precedent: MACI key derivation already signs with this account silently.)

## 4. Content types (the feature toolbox)

Registry: [content types docs](https://docs.xmtp.org/chat-apps/content-types/content-types). Text is default (`TextCodec`); everything else registers at client creation. Standards-track types:

| Type | Package | Use |
|---|---|---|
| Reaction | `@xmtp/content-type-reaction` | emoji reactions (RN SDK bundles a codec) |
| Reply | `@xmtp/content-type-reply` | quote replies |
| Read receipt | `@xmtp/content-type-read-receipt` | timestamp receipts |
| Attachment (<1MB) / Remote attachment | `@xmtp/content-type-remote-attachment` | encrypted media via app-provided storage |
| **Transaction reference** | `@xmtp/content-type-transaction-reference` **2.0.2** | on-chain receipt card (tx hash + metadata) |
| **Wallet send calls** | `@xmtp/content-type-wallet-send-calls` **2.0.0** | EIP-5792 `wallet_sendCalls` transaction **requests** |

- **In-chat payments = wallet-send-calls (request) + transaction-reference (receipt).** This is the official pattern in [xmtp-agent-examples/xmtp-transactions](https://github.com/ephemeraHQ/xmtp-agent-examples/tree/main/examples/xmtp-transactions) and what Base App interops with. For Röbel v1 we send the transfer ourselves (thirdweb, gasless) and post the **transaction-reference receipt**; wallet-send-calls unlocks "Münzen anfordern" (payment requests) later.
- **Production precedents:** Base App (Coinbase) runs chat + agents on XMTP, **production network env only**; **World App's chat is "Secured by XMTP"** with global payments in-chat ([World announcement](https://world.org/blog/announcements/the-new-world-app-secure-chat-global-payments-and-mini-apps-for-everyone)).
- Custom types: RN SDK supports native codecs and JSON `JSContentCodec` definitions with a `contentFallback` string for non-supporting clients (used for the Röbel sticker codec).

## 5. Push notifications

- Official architecture: a **self-hosted notification server** ([example-notification-server-go](https://github.com/xmtp/example-notification-server-go)) subscribes to conversation topics and relays to APNs/FCM; it **cannot decrypt** payloads (no keys) — clients decrypt in an iOS Notification Service Extension / FCM handler. Heavy: new infra + NSE target, not Expo-friendly without a custom plugin. ([push docs](https://docs.xmtp.org/chat-apps/push-notifs/understand-push-notifs))
- Pragmatic v1 (chosen): **sender-triggered push** through the existing `send-notification` edge function — identical payload to today's DB-trigger path. Tradeoff: sender's client must be online at send time (it is, by definition) and the excerpt transits the existing push pipeline exactly as Supabase DMs do today (no privacy regression vs. status quo; strict E2E push comes with the notification server in phase 2).

## 6. Consent / spam, groups, disappearing messages

- Consent states (allowed / denied / unknown) exist per conversation and inbox ([user-consent](https://docs.xmtp.org/chat-apps/user-consent/user-consent)) — the basis for blocking and a future "Anfragen" (message requests) UI.
- Group chats are protocol-native (MLS groups, up to hundreds of members) — future path for org-account inboxes.
- Disappearing messages are SDK-supported per conversation ([disappearing-messages](https://docs.xmtp.org/chat-apps/core-messaging/disappearing-messages)).
- Exact 5.7.0 API surfaces for these were not third-party-verified; they are confirmed against the installed SDK typings during implementation.

## 7. Browser SDK (for the later apps/web phase)

- `@xmtp/browser-sdk` **7.0.0** (published 2026-07-10), peer dep `viem>=2`, WASM bindings + web workers, local db in **OPFS** — **unencrypted**: `dbEncryptionKey` exists in the API for parity but is **ignored** on web ("the database is not encrypted", confirmed by XMTP staff). Origin sandboxing is the only isolation — treat the web client as a lower-trust surface.
- Next.js 15: client-only dynamic import (no SSR), WASM asset serving — the repo already anticipates this (`apps/web/.gitignore` reserves `public/wasm/`; `next.config.mjs` already serves `/wasm/:path*` with `application/wasm`).

## 8. Refuted claims (do NOT rely on)

- "Android minSdk 22" (actual floor: 23; we're at 26).
- "Decentralized mainnet completes March 2026 / cutover mid-2026" (no launch as of 2026-07-10; timing unresolved).
- "Inbox ID is derived from key-package public key material" (wrong derivation story).
- Exact `Client.create` internals from docs prose (verify against installed typings).

## 9. Open questions carried into implementation

1. Does registration succeed for an **undeployed** Gnosis smart account (ERC-6492)? → We don't gamble: deploy-first guard.
2. Which codecs ship **inside** `@xmtp/react-native-sdk` 5.7.0 vs. need the standalone packages / a JS codec? → Read installed typings; transaction-reference is JSON-simple either way.
3. RN 0.83.2 / new-architecture build compatibility of the 5.7.0 native module → proven only by the next EAS build (top build risk; SDK is an Expo module with Rust core, expected fine, contingency = pin/patch).
4. Decentralization cutover date → re-check before launch; budget the gateway (~$5/100k msgs) when it lands.
