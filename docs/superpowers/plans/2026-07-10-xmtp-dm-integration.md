# XMTP v3 DM Integration (apps/expo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make XMTP v3 the transport for personal↔personal DMs in the Expo app — same UI, same registry, new E2E rail — plus in-chat Röbel Münzen payments, reactions, read receipts, and blocking.

**Architecture:** Rail-picker behind the existing three-file transport boundary (`lib/supabase-messages.ts` / `hooks/useConversation.ts` / `context/MessagingContext.tsx`). Supabase `conversations` UUID stays the canonical registry for every conversation; XMTP DMs are derived per peer-wallet and merged into threads/inbox. Send picks one rail; receive always reads both.

**Tech Stack:** `@xmtp/react-native-sdk@5.7.0` (Expo native module, MLS), thirdweb v5 smart account on Gnosis (SCW signer, chainId 100), `expo-secure-store` (db key), existing Supabase edge `send-notification` for push.

**Spec:** `docs/superpowers/specs/2026-07-10-xmtp-dm-integration-design.md` · **Research:** `docs/XMTP_RESEARCH_2026-07.md`

## Global Constraints

- German UI copy; currency is always **"Röbel Münzen"** (never CRC/Taler in copy); never render `0x…` addresses.
- Styling: `StyleSheet.create()` + `useTheme()`; fonts via existing `Inter-*`/`MonaSans*` tokens. NO NativeWind.
- Preserve the exact public shapes of `Message`, `Conversation`, `ConversationWithLastMessage`, `PeerAccount`, `MessagingContextValue` — only **additive** fields.
- XMTP env default **`production`** (`EXPO_PUBLIC_XMTP_ENV` override); kill switch `app_settings.xmtp_dms_enabled` (`'false'` = off; missing = on).
- XMTP identity = the **Gnosis smart account** (`useGnosisWallet().gnosisAccount`), SCW signer `chainId 100`; deploy-first guard for undeployed accounts (gasless).
- All XMTP imports **lazy** (`await import(...)`) behind `lib/xmtp/native.ts` so builds without the native module never crash.
- Payments only on the XMTP rail (personal↔personal); reuse `useRoebelTaler().send()` (gasless ERC-1155 group token).
- `users.wallet_address` is lowercased everywhere; timestamps: XMTP `sentNs` (ns) ↔ ISO strings via `ns/1e6 → Date`.
- Do not run `eas update`/`eas build` (user-run); no `git add .` — pathspec staging only.
- Repo has ~431 pre-existing tsc errors — verify no NEW errors in touched files only.

---

### Task 1: Supabase migration + registered-flag plumbing

**Files:**
- Create: `apps/expo/supabase/migrations/20260710_xmtp_registration.sql`
- Modify: `apps/expo/lib/supabase-users.ts` (add `markUserXmtpRegistered`)

**Interfaces:**
- Produces: `users.xmtp_registered_at timestamptz` column; `markUserXmtpRegistered(walletAddress: string): Promise<void>`.

- [ ] **Step 1:** Write migration file:

```sql
-- XMTP v3 DM rail: set when a wallet's app installation registers an XMTP
-- inbox. Other clients use it as the deterministic "peer is reachable on
-- XMTP" signal for rail selection (canMessage alone would match users who
-- registered via third-party XMTP apps but run an old Röbel build).
alter table public.users
  add column if not exists xmtp_registered_at timestamptz;

comment on column public.users.xmtp_registered_at is
  'Set by the app after successful XMTP v3 inbox registration (rail-selection signal).';
```

- [ ] **Step 2:** Apply via Supabase MCP `apply_migration` (project `wwbeqhkslxdxhktqzqti`), name `xmtp_registration`.
- [ ] **Step 3:** Add to `lib/supabase-users.ts`:

```ts
/** Marks this wallet's user row as XMTP-reachable (rail-selection signal). */
export async function markUserXmtpRegistered(walletAddress: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ xmtp_registered_at: new Date().toISOString() } as any)
    .eq('wallet_address', walletAddress.toLowerCase());
  if (error) console.error('markUserXmtpRegistered error:', error);
}
```

- [ ] **Step 4:** Commit `feat(expo): xmtp registration column + flag helper`.

### Task 2: Native-module guard + kill switch

**Files:**
- Create: `apps/expo/lib/xmtp/native.ts`
- Modify: `apps/expo/lib/supabase-app-settings.ts` (export `fetchXmtpDmsEnabled`)

**Interfaces:**
- Produces: `loadXmtp(): Promise<XmtpSdk | null>` (memoized dynamic import; null when module missing/broken), `type XmtpSdk = typeof import('@xmtp/react-native-sdk')`; `fetchXmtpDmsEnabled(): Promise<boolean>` (true unless `app_settings.xmtp_dms_enabled === 'false'`).

- [ ] **Step 1:** `native.ts` — memoized `await import('@xmtp/react-native-sdk')` in try/catch, `console.warn` once on failure.
- [ ] **Step 2:** `fetchXmtpDmsEnabled()` wraps existing private `fetchAppSetting('xmtp_dms_enabled')`.
- [ ] **Step 3:** Commit `feat(expo): lazy xmtp native loader + remote kill switch`.

### Task 3: Client bootstrap (signer, db key, deploy guard)

**Files:**
- Create: `apps/expo/lib/xmtp/client.ts`

**Interfaces:**
- Consumes: `loadXmtp`, `markUserXmtpRegistered`, `gnosis` chain, thirdweb `Account`.
- Produces:
  - `getXmtpClient(): XmtpClientHandle | null` (module cache)
  - `bootXmtpClient(account: Account): Promise<XmtpClientHandle | null>` — full boot: kill switch → sdk load → db key (SecureStore, key `xmtp_dbkey_<wallet>`, hex, 32 bytes via `crypto.getRandomValues`) → registered? `Client.build` : (deploy guard → `Client.create` with SCW signer) → registered flag (AsyncStorage `xmtp_registered_<wallet>` + `markUserXmtpRegistered`).
  - `dropXmtpClient(): Promise<void>` (logout teardown, keeps db)
  - `XmtpClientHandle = { client: Client<SupportedCodecs>, inboxId: string, wallet: string }`
- SCW signer (exact):

```ts
const signer: XmtpSigner = {
  getIdentifier: async () => new sdk.PublicIdentity(account.address, 'ETHEREUM'),
  getChainId: () => 100,
  getBlockNumber: () => undefined,
  signerType: () => 'SCW',
  signMessage: async (message: string) => ({
    signature: await account.signMessage({ message }),
  }),
};
```

- Deploy guard (exact):

```ts
const deployed = await isContractDeployed(getContract({ client, chain: gnosis, address: account.address }));
if (!deployed) {
  await sendTransaction({
    account,
    transaction: prepareTransaction({ to: account.address, value: 0n, chain: gnosis, client }),
  });
}
```

- Codecs registered: `TextCodec, ReactionCodec, ReadReceiptCodec, ReplyCodec, StaticAttachmentCodec, RemoteAttachmentCodec` (SDK natives) + `TransactionReferenceCodec`, `RoebelStickerCodec` (Task 4).
- `Client.build` failure (lost db/key) falls back to `Client.create`; both wrapped so any failure returns null (Supabase-only mode).

- [ ] Steps: implement, typecheck file, commit `feat(expo): xmtp client bootstrap with thirdweb SCW signer on gnosis`.

### Task 4: Content codecs (payments + stickers)

**Files:**
- Create: `apps/expo/lib/xmtp/codecs.ts`

**Interfaces:**
- Produces:
  - `TransactionReferenceContent = { namespace?: string; networkId: string; reference: string; metadata?: { transactionType: string; currency: string; amount: number; decimals: number; fromAddress?: string; toAddress?: string } }`
  - `TransactionReferenceCodec implements JSContentCodec<TransactionReferenceContent>` — contentType `xmtp.org/transactionReference:1.0` (wire-compatible with `@xmtp/content-type-transaction-reference`, JSON UTF-8 in `content` bytes, English explorer fallback, `shouldPush → true`)
  - `RoebelStickerContent = { stickerRewardId: string }`; `RoebelStickerCodec` — contentType `roebel.de/sticker:1.0`, fallback `'🎁 Sticker'`
  - `CONTENT_TYPE_TEXT/REACTION/READ_RECEIPT/TRANSACTION_REFERENCE/ROEBEL_STICKER` string ids (`authority/type:maj.min`)
- Encode/decode pattern (both codecs):

```ts
encode(content) {
  return {
    type: this.contentType,
    parameters: {},
    content: new TextEncoder().encode(JSON.stringify(content)),
  };
}
decode(encoded) {
  return JSON.parse(new TextDecoder().decode(encoded.content));
}
```

- [ ] Steps: implement, commit `feat(expo): xmtp codecs — transactionReference (Base-App compatible) + roebel sticker`.

### Task 5: Transport adapter (rails, mapping, merge)

**Files:**
- Create: `apps/expo/lib/xmtp/transport.ts`
- Modify: `apps/expo/lib/supabase-messages.ts` (additive fields + owner-wallet plumbing)

**Interfaces:**
- `Message` gains optional: `source?: 'supabase' | 'xmtp'`, `reactions?: MessageReaction[]` (`{ emoji: string; count: number; reactedByMe: boolean }`), `payment?: MessagePayment` (`{ txHash: string; networkId: string; amount: number; direction: 'sent' | 'received' }` — direction derived at render from `isOwn`, store amount as decimal number), `delivery?: 'sending' | 'sent' | 'failed'`.
- `ConversationWithLastMessage` gains: `peerOwnerWallet: string | null`, `peerXmtpRegisteredAt: string | null` (personal peers; from the existing `account_owners`/`users` batch queries — add `xmtp_registered_at` to the users select).
- `PeerAccount` (Task 6) gains `ownerWallet: string | null`, `xmtpRegisteredAt: string | null`.
- `transport.ts` produces:
  - `isXmtpRailEligible(peer: { accountType: string; ownerWallet: string | null; xmtpRegisteredAt: string | null }, myAccountType: string | undefined): boolean`
  - `canMessageCached(wallet: string): Promise<boolean>` (static `Client.canMessage(env, [PublicIdentity])`, 10-min module cache)
  - `getDmForWallet(handle, peerWallet): Promise<Dm>` (findOrCreateDmWithIdentity)
  - `fetchXmtpThread(handle, dm, ids: { conversationId, myAccountId, peerAccountId }, opts?: { beforeNs?: number; limit?: number }): Promise<{ messages: Message[]; peerReadAtNs: number | null; oldestNs: number | null }>` — uses `dm.messagesWithReactions({ limit, beforeNs, direction: 'DESCENDING' })`; maps text → `content`; transactionReference → `payment` (+ `content: ''`); roebel sticker → `sticker_reward_id`; readReceipt messages are folded into `peerReadAtNs` (latest peer receipt) and excluded from the list; reply/attachment from other apps render via `fallback` text into `content`; unknown w/o fallback dropped. `created_at = new Date(sentNs / 1e6).toISOString()`; `sender_account_id = senderInboxId === handle.inboxId ? myAccountId : peerAccountId`; reactions aggregated from `childMessages` (`action === 'added'` minus `removed` per emoji+sender, `reactedByMe` when sender inbox is mine).
  - `sendXmtpText(handle, dm, text): Promise<string>`; `sendXmtpSticker(handle, dm, stickerRewardId)` (send with `{ contentType: ROEBEL_STICKER_TYPE }`); `sendXmtpReaction(handle, dm, ref: string, emoji: string, action: 'added' | 'removed')`; `sendXmtpReadReceipt(handle, dm)` (`dm.send({ readReceipt: {} })`); `sendXmtpTransactionReference(handle, dm, content: TransactionReferenceContent)`.
  - `listXmtpInbox(handle): Promise<XmtpInboxEntry[]>` (`listDms({ lastMessage: true }, 100, ['allowed', 'unknown'])`; `XmtpInboxEntry = { dm, peerWallet, lastMessage: DecodedMessage | null }`; peer wallet via `dm.peerInboxId()` + session-cached static `Client.inboxStatesForInboxIds` → `identities[0].identifier`)
  - `countXmtpUnread(handle, dm, lastReadAtIso, inboxId): Promise<number>` (`dm.messages({ afterNs, limit: 99 })` filtered to peer senders + countable types)
  - `blockXmtpConversation(dm)` / `unblockXmtpConversation(dm)` (`updateConsent('denied' | 'allowed')`), `getXmtpConsentState(dm)`
- Also export `fetchAccountOwnerWallets(accountId: string): Promise<string[]>` from `supabase-messages.ts` (owner/admin wallets, lowercased — push targeting).

- [ ] Steps: implement both files, typecheck, commit `feat(expo): xmtp transport — rail selection, thread merge mapping, consent`.

### Task 6: XmtpContext provider + boot wiring

**Files:**
- Create: `apps/expo/context/XmtpContext.tsx`
- Modify: `apps/expo/app/_layout.tsx` (wrap `MessagingProvider` with `XmtpProvider`)
- Modify: `apps/expo/hooks/useConversation.ts` (peer hydration select adds `xmtp_registered_at`, owner wallet fields)

**Interfaces:**
- `useXmtp(): { handle: XmtpClientHandle | null; ready: boolean; enabled: boolean; subscribeMessages(cb: (m: DecodedMessage) => void): () => void }`
- Boot gating: `useWalletBoot().autoConnectFinished === true` AND `useGnosisWallet().gnosisAccount != null` → `bootXmtpClient` once per wallet; on account null after `autoConnectFinished` → `dropXmtpClient()`. Never tear down during the reconnect window (mirror UserContext invariant).
- Stream: after boot, `client.conversations.streamAllMessages(cb, 'dms', ['allowed', 'unknown'], onClose)`; re-arm on `AppState` → `active` (+ `syncAllConversations(['allowed', 'unknown'])`); fan out to subscriber set.

- [ ] Steps: implement provider, wire into `_layout.tsx` directly around `<MessagingProvider>`, extend peer hydration, typecheck, commit `feat(expo): XmtpProvider — gated boot, message stream, logout teardown`.

### Task 7: Thread merge in useConversation + read receipts

**Files:**
- Modify: `apps/expo/hooks/useConversation.ts`

**Interfaces (returned additions):** `rail: 'xmtp' | 'supabase'`, `peerReadAt: string | null`, `sendPayment(amountRaw: bigint, amountDisplay: string): Promise<void>` (Task 9 fills body), `sendReaction(messageId: string, emoji: string, add: boolean)`, `blockPeer(): Promise<void>`, `unblockPeer(): Promise<void>`, `consent: 'allowed' | 'denied' | 'unknown'`.

Behavior:
- After peer hydration: compute `rail` via `isXmtpRailEligible(...)` + `canMessageCached(peer.ownerWallet)`; get `dm` handle when eligible.
- Thread load: Supabase `fetchMessages(id, 50)` + (xmtp rail) `fetchXmtpThread(..., { limit: 50 })`; merge sort desc by `created_at`; both cursors paginate in `loadMore` (supabase `beforeDate`, xmtp `beforeNs`).
- `sendMessage(text, stickerRewardId)`: xmtp rail → `sendXmtpText` / `sendXmtpSticker`, then refetch xmtp page + fire sender push (`notifyDmPush`, Task 8); supabase rail → existing `sendMsg`. On xmtp send error: snackbar-style `console.error` + rethrow-safe no-crash (keep `isSending` semantics).
- Read receipts: on mount + on new inbound xmtp message while mounted → `sendXmtpReadReceipt` (throttled: only when a new peer message arrived since last receipt); expose `peerReadAt` (ISO from `peerReadAtNs`).
- Subscribe to `useXmtp().subscribeMessages` — refetch thread when `message.topic === dm.topic`.

- [ ] Steps: implement, typecheck, commit `feat(expo): merged dual-rail thread — xmtp send/receive, receipts, block`.

### Task 8: Inbox merge + unread + sender push

**Files:**
- Create: `apps/expo/lib/xmtp/push.ts`
- Modify: `apps/expo/context/MessagingContext.tsx`

**Interfaces:**
- `notifyDmPush(opts: { senderName: string; body: string; recipientWallets: string[]; conversationId: string }): Promise<void>` — `supabase.functions.invoke('send-notification', { body: { type: 'direct_message', title: senderName, body, walletAddresses: recipientWallets, data: { type: 'direct_message', conversationId } } })`; fire-and-forget with catch.
- MessagingContext: after `fetchConversations`, when xmtp ready & active account personal → `listXmtpInbox`; match entries to rows by `peerOwnerWallet`; override `lastMessage`/`hasUnread` when xmtp side is newer (map via thread adapter, single-message variant `mapXmtpMessage`); add per-conversation xmtp unread counts (`countXmtpUnread` for candidates) into `unreadCount`; unmatched entries → resolve wallet → `fetchPersonalAccountIdByWallet` → `findOrCreateConversation` → one reload (session-guarded set).
- Subscribe to `subscribeMessages` → debounce 500ms → refresh (replaces nothing; adds to existing realtime effect).

- [ ] Steps: implement, typecheck, commit `feat(expo): merged inbox + xmtp unread + sender-triggered push`.

### Task 9: In-chat Röbel Münzen payments

**Files:**
- Create: `apps/expo/components/messages/MuenzenSendSheet.tsx`
- Create: `apps/expo/components/messages/PaymentBubble.tsx`
- Modify: `apps/expo/context/RoebelTalerProvider.tsx` (`send` returns `Promise<string>` — the `transactionHash` from `sendTransaction`)
- Modify: `apps/expo/components/messages/ChatInput.tsx` (coin button, `onOpenPayment?: () => void`, shown only when prop present)
- Modify: `apps/expo/components/messages/MessageBubble.tsx` (render `message.payment` via `PaymentBubble`, reaction chips, `onLongPress` hook-up)
- Modify: `apps/expo/app/messages/[conversationId].tsx` (sheet state, long-press reaction bar, header ⋯ menu with Blockieren, "Gelesen" indicator)

**Interfaces:**
- `MuenzenSendSheet({ visible, onClose, peerName, onSend(amountRaw: bigint, amountDisplay: string): Promise<void> })` — amount input (`de-DE` decimals via `parseTalerAmount`), balance line (`useRoebelTaler().groupBalance`), quick amounts [1, 5, 10], primary button `Senden`, error text on failure. Modal bottom sheet, theme tokens.
- `PaymentBubble({ payment, isOwn, colors })` — coin icon, `"<amount> Röbel Münzen"`, subtitle `"Gesendet"`/`"Empfangen"`; primary-tinted card, no tx hash shown.
- Payment flow (in `useConversation.sendPayment`): `send(peerWallet, amountRaw)` → txHash → `sendXmtpTransactionReference(handle, dm, { namespace: 'eip155', networkId: 'eip155:100', reference: txHash, metadata: { transactionType: 'transfer', currency: 'Röbel Münzen', amount: Number(amountDisplay.replace(',', '.')), decimals: 18, fromAddress: myWallet, toAddress: peerWallet } })` → refetch + `notifyDmPush` body `"hat dir Röbel Münzen gesendet"`.
- Reaction UI: long-press bubble → inline emoji row `['👍', '❤️', '😂', '😮', '😢', '🙏']` (xmtp rail only); chips under bubble; tap own chip → remove.

- [ ] Steps: implement components, wire screen, typecheck, commit `feat(expo): in-chat Röbel Münzen payments + reactions + read receipts + blocking`.

### Task 10: Verification + docs + handoff

- [ ] `pnpm tsc --noEmit` in `apps/expo` — diff error count vs `main` baseline (no new errors in touched files).
- [ ] `pnpm lint` (expo eslint) on touched files.
- [ ] `npx expo export --platform ios --output-dir /tmp-scratch-export` (Metro resolution proof incl. lazy import). Delete output.
- [ ] Update `CLAUDE.md` (root): messaging section — dual-rail note.
- [ ] Update memory + write `docs/XMTP_INTEGRATION_STATE.md`: what shipped, what needs the EAS build, phase-2 list (attachments, replies, Anfordern/wallet-send-calls, org groups, Anfragen UI, notification server, web).
- [ ] Final commit + push.

## Self-review

- Spec coverage: rails (T5-T8), identity/signer (T3), payments (T9), reactions/receipts/blocking (T7/T9), push (T8), kill switch (T2), migration (T1), old-build immunity (T2 lazy loader), verification (T10). Web = phase 2 doc (T10). ✓
- Types consistent: `XmtpClientHandle` (T3) consumed by T5-T9; `Message` additive fields defined once (T5). ✓
- No placeholders. ✓
