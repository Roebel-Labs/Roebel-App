# Gemeinschaftskasse — App Signature-Requests (Safe Messages) + Auto-refresh

- **Date:** 2026-06-28
- **Status:** Approved design — ready for implementation plan
- **Builds on:** the live Gemeinschaftskasse feature + enrichment (both on main).
- **Scope app:** `apps/web`.

## Problem

When an owner connects a Safe **App** (e.g. Monerium) it creates an off-chain **Safe message** that needs M-of-N owner signatures. These messages are a *different* Safe API from transactions, so the dashboard's payout queue never shows them — owners must use the Safe app to co-sign. The Safe is now **2-of-4**, so a Monerium ownership-proof message ("I hereby declare that I am the address owner.", origin `https://monerium.app`) is stuck at 1/2 signatures.

## Goal

A new **"Anfragen"** tab that shows pending Safe messages (app signature-requests) and lets owners **co-sign them in the dashboard** (no Safe app), plus **auto-refresh** so new requests from any connected app appear on their own.

## Decisions (from brainstorming)

- New dedicated **"Anfragen"** tab (5th tab) with a badge count of pending requests.
- **Full in-dashboard co-signing** (reuses the existing signing infra).
- **Auto-refresh** (~15s poll) for the Anfragen tab AND the existing transaction queue.

## Verified facts (live, against the real Safe)

- `@safe-global/api-kit@5.0.1` exposes `getMessages(safeAddress)`, `getMessage(messageHash)`, `addMessageSignature(messageHash, signature)` — all present.
- Live `getMessages` returns 1 pending message: `messageHash 0xea44…`, `origin "https://monerium.app"`, `message "I hereby declare that I am the address owner."`, `confirmations[].owner` (1 signer: the EOA `0x1C11`), `preparedSignature` present. **`confirmationsRequired` is undefined on messages** → required = the Safe's threshold.
- **No execute step:** once signatures ≥ threshold, the Safe service exposes the completed signature for the requesting app to fetch. Co-signing = collect signatures only.
- Owner signing reuses transaction signing exactly: an owner signs the `messageHash`; the envelope is ERC-1271 contract-signature (smart-account owners) or ECDSA (EOA) — i.e. the existing `assembleSenderSignature` — submitted via `addMessageSignature`.

## Architecture

All Safe/Supabase work stays **server-side** behind `/api/gemeinschaftskasse/*` (client only signs + fetches). Reuses `resolveSigner` (client), `assembleSenderSignature` (server), `resolveCitizenProfiles` (server), `MemberRow`/`skeletons`/`approvalLabel`, and the `useIsOwner` gate.

### Types — `lib/gemeinschaftskasse/constants.ts`
```ts
export interface MessageView {
  messageHash: string;
  app: string;            // friendly app name from origin (e.g. "Monerium")
  text: string;           // message text (string) or summary for typed-data
  confirmations: number;
  required: number;       // = Safe threshold
  signers: TxSigner[];    // resolved citizen signers
  date: string | null;    // created
  fullySigned: boolean;   // confirmations >= required
}
```

### Server — `lib/gemeinschaftskasse/safe-server.ts` (extend)
- `getPendingMessages(): Promise<MessageView[]>`:
  - `kit.getMessages(GK_SAFE)` → results; `threshold = (await kit.getSafeInfo(GK_SAFE)).threshold`.
  - For each message: `app` = friendly name from `origin` (hostname → strip TLD/`www`, capitalize; fallback "App"); `text` = `typeof message.message === "string" ? message.message : "Strukturierte Signatur-Anfrage"`; `confirmations = message.confirmations.length`; `signers` resolved via `resolveCitizenProfiles` (batch all confirmation owners); `date = message.created ?? null`; `fullySigned = confirmations >= threshold`.
  - Filter to NOT-fully-signed (pending) for the tab, but return `fullySigned` so the UI can show a "fertig signiert" state briefly.
- `addMessageConfirmation({ messageHash, inner, ownerAddress, isSmart }): Promise<void>`:
  - `signature = await assembleSenderSignature({ inner, ownerAddress, isSmart })` (REUSE — same envelope logic as transactions).
  - `kit.addMessageSignature(messageHash, signature)`.

### Routes (admin-gated, `dynamic="force-dynamic"`)
- `GET /api/gemeinschaftskasse/messages` → `{ items: MessageView[] }`.
- `POST /api/gemeinschaftskasse/confirm-message` → body `{ messageHash, inner, ownerAddress, isSmart }` → `addMessageConfirmation`.

### Client — `lib/gemeinschaftskasse/safe-client.ts` (extend)
- `confirmMessage({ messageHash, account, wallet }): Promise<void>`:
  - `signer = await resolveSigner(account, wallet)` (null → throw "Du bist kein Mitsignierer dieser Kasse.").
  - `inner = await signer.signingAccount.signMessage({ message: { raw: messageHash } })`.
  - `POST /api/gemeinschaftskasse/confirm-message { messageHash, inner, ownerAddress: signer.ownerAddress, isSmart: signer.isSmart }`.

### UI
- **`_components/Anfragen.tsx`** (NEW, client): fetch `/messages`; `HistorySkeleton` while loading; empty state "Keine offenen Anfragen."; one card per message: app name (bold) + message text (muted, quoted) + `approvalLabel(confirmations, required)` + signer avatar stack (reuse the Verlauf pattern) + a **Freigeben** button (visible to owners via `useIsOwner`, hidden/disabled if the connected user already signed or if `fullySigned`). Freigeben → `confirmMessage(...)` → re-fetch. Per-item error + busy state. **Polls every 15s** (`setInterval` re-fetch, cleared on unmount).
- **`page.tsx`**: add the `"Anfragen"` tab (5 tabs total) rendering `<Anfragen />`. A small badge on the tab shows the count of pending (not-fully-signed) messages — page fetches `/messages` once for the count (and refreshes with the same 15s cadence). Keep the other tabs unchanged.
- **`PendingQueue.tsx` (transactions): add the same 15s auto-refresh** so payouts also appear/refresh on their own.

### Auto-refresh detail
- Simple `useEffect` + `setInterval(fetchFn, 15000)` with cleanup. No websockets. Pause is unnecessary at this scale (3–5 owners).

## Error handling

- `getMessages`/`addMessageSignature` failures → `{error}` (existing `jsonError`); UI shows the German error inline, keeps the rest of the list.
- Non-owner connected → Freigeben hidden (via `useIsOwner`), and the server still rejects (defense in depth).
- Already-signed-by-you → Freigeben hidden for that item (check connected address against `signers`).
- Typed-data (object) messages → rendered as "Strukturierte Signatur-Anfrage" (no crash on non-string `message`).

## Constraints (inherited)

German UI; currency only "Röbel-Münzen"/"€" (never CRC); never a raw 0x as a primary label (signers via citizen profiles); all Safe/Supabase work server-side (no `@safe-global`/Supabase key in any `"use client"` file — keeps the build OOM-safe); brand `#00498B`.

## Out of scope

Creating/proposing new messages from the dashboard (apps create them); rejecting messages; message history of already-completed messages (the tab shows pending only); websocket realtime (polling is enough).

## Verification

- Node: none new (no pure logic added beyond reuse).
- Controller live check: `getMessages` already returns the Monerium message; after build, confirm the `/messages` route shape server-side.
- **Browser (you):** the Monerium message appears in **Anfragen** showing "Wartet auf Freigaben (1/2)"; a second owner clicks **Freigeben** → it reaches 2/2 and Monerium accepts the signature. This is the live end-to-end test of message co-signing (the one part not unit-testable).
