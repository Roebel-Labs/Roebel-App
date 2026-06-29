# Gemeinschaftskasse Dashboard — UX Overhaul (2026-06-29)

## Why

The GK admin dashboard (`apps/web/src/app/admin/dashboard/gemeinschaftskasse`) is
functionally correct but reads as opaque and minimal. Pain observed in
production: transactions are mislabeled (a Circles `updateMetadataDigest` call
showed as "Auszahlung in Röbel-Münzen"); there is only one status string
("Wartet auf Freigaben 1/2"); approve/execute feedback was a tiny "…" then a raw
"Bad Request"; nothing explains how the 2-of-4 multisig works or why a
smart-wallet owner differs from an EOA. Goal: drastically more information,
states, feedback, and explanation across all four tabs.

## Constraints

- Keep the existing server/client split — all `@safe-global` usage stays
  server-side; the client only signs/sends (see `safe-client.ts`/`safe-server.ts`).
- German UI text (primary). Primary color navy `#00498B`; secondary `#6B7280`;
  borders `#B4B8C1`.
- Never render raw `0x…` as a person — resolve to a display name (existing
  `resolveCitizenProfiles`); a truncated address may appear only as secondary
  metadata for owners.
- Currency label stays "Röbel-Münzen". Tailwind only (web app).

## Foundation (shared building blocks)

1. **`decodeTx` upgrade (`describe.ts`)** — classify every Safe tx with an icon +
   plain title and a `kind`:
   - Transfers (xDAI/EURe/Münzen) → "Auszahlung — 12,50 € an Guido".
   - Owner mgmt → add/remove member, change threshold.
   - **Circles BaseGroup calls** (`updateMetadataDigest`, etc.) → "Circles-Gruppe
     — Metadaten aktualisieren" via a small BaseGroup ABI. Fixes the mislabel
     where the group token address == the Münzen token address.
   - Unknown → "Vertragsaufruf — `funktionsName()`" (never a wrong label).
2. **Status model + `StatusBadge`** — single source of truth:
   `wartet` · `bereit` · `wird_ausgefuehrt` · `ausgefuehrt` · `fehlgeschlagen`,
   each color + icon + German label.
3. **`SignerProgress`** — all owners as avatars marked ✓ freigegeben / ⏳
   ausstehend + an n/m progress bar. Distinguishes on-chain approveHash vs.
   off-chain signature subtly.
4. **`useTxAction` + inline stepper** — replaces the "…"/"Bad Request":
   - Freigeben: Signiere Freigabe… → Sende On-Chain-Freigabe… → ✓ Freigegeben.
   - Ausführen: Stelle Transaktion zusammen… → Führe aus… → ✓ Ausgeführt (+
     "Auf Gnosisscan ansehen ↗").
   - `mapTxError()` → plain German (Freigabe abgelehnt, kein Mitsignierer, nicht
     genug xDAI, …) + expandable "Technische Details".
5. **`Explainer` + `InfoTooltip`** — collapsible "So funktioniert die
   Gemeinschaftskasse" + `ⓘ` tooltips on Mitsignierer / Freigabe / 2-von-4 /
   Smart-Wallet vs. normale Wallet.

## Tabs

- **Übersicht** — treasury hero (big € reserve) + holdings list with share bars
  and "in € einlösbar" context; status cards (Mitsignierer, Schwelle *with*
  explanation, offene Transaktionen, letzte Aktivität); signer mini-list;
  recent-activity preview; the explainer.
- **Auszahlungen** — explainer + rebuilt CreatePayout (asset picker with live
  balances, amount with € equivalent, recipient name-resolution + validation, a
  "Du zahlst X an Y" review before submit) + rich `TxCard` PendingQueue with the
  new action feedback.
- **Mitglieder** — each signer: avatar, name, "Du" badge, **wallet type**
  (Smart-Wallet vs. normale Wallet, explained), can-sign indicator; threshold
  explanation; add/remove flows using the same rich feedback.
- **Verlauf** — decoded history cards (same engine), status + date + signers +
  amount, Gnosisscan links, filters (Alle / Auszahlungen / Mitglieder /
  Sonstige), empty/loading states.

## New/changed files (indicative)

- `lib/gemeinschaftskasse/describe.ts` — richer decode + `kind`/icon/status.
- `lib/gemeinschaftskasse/tx-errors.ts` — `mapTxError()`.
- `_components/ui/StatusBadge.tsx`, `SignerProgress.tsx`, `TxCard.tsx`,
  `Explainer.tsx`, `InfoTooltip.tsx`.
- `_components/useTxAction.ts` — staged action state machine.
- Rebuilt: `PendingQueue.tsx`, `CreatePayout.tsx`, `Uebersicht.tsx`,
  `Mitglieder.tsx`, `Verlauf.tsx`.
- `constants.ts` — BaseGroup ABI snippet; `TxView` gains `status`, `icon`,
  `category`, decoded `action`.

## Out of scope

Wallet/threshold *governance* policy changes; mobile (Expo) parity; any change
to the signing mechanics (approveHash flow shipped separately and stays).
