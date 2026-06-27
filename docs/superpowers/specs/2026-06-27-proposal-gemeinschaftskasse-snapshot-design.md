# Gemeinschaftskasse snapshot on proposals — Design

**Date:** 2026-06-27
**Scope:** web proposal creation + expo proposal detail. Frozen snapshot, opt-in.

## Goal

Let a proposer attach a **frozen snapshot of the Gemeinschaftskasse** (civic treasury
euro figure) to a governance proposal. When the proposer ticks an opt-in toggle in the
web create form, the server captures the current euro figure at store time and writes it
onto the proposal. The expo proposal-detail screen then renders the **existing**
`StadtkasseSnapshotCard` so voters see how much was in the pot when the proposal was made.

Data flow: **web toggle → server captures at store time → expo detail renders the card.**

## Decisions (locked with user)

- **Frozen, not live.** Euro figure captured when the proposal is stored; never re-read.
- **Opt-in.** A checkbox in the web create form; no card on proposals that don't tick it.
- **Capture server-side** (in the store API), not in the browser — tamper-proof, no client RPC.
- **Card placement:** under the proposal content, above the vote buttons (expo detail).
- **Reuse the existing card** (`StadtkasseSnapshotCard`) — no new component.
- **No DB migration** — rides in the existing `proposals.content.metadata` JSONB.

## Data model

Reuse the `proposals.content` JSONB. Add to `content.metadata`:

```json
{ "gemeinschaftskasse_snapshot": { "euro": 263.82, "captured_at": "2026-06-27T…Z" } }
```

- `euro` — number, the frozen fiat figure (xDAI→€ + EURe; excludes Röbel Münzen).
- `captured_at` — ISO string, metadata only (never displayed on the card).
- Absent → no card. `select('*')` already returns `content`, so no read-query change.

## Euro source (web, server-side)

New helper in `apps/web/src/lib/muenzen/gnosis.ts` (already `server-only`, viem):

```ts
const XDAI_EUR = 0.92; // xDAI is USD-pegged; approx USD→EUR. Matches the Expo hero.
export async function treasuryEuro(): Promise<number> {
  const [xdai, eure] = await Promise.all([nativeBalance(ADDR.safe), eureBalance(ADDR.safe)]);
  return (Number(xdai) / 1e18) * XDAI_EUR + Number(eure) / 1e18;
}
```

`ADDR.safe = 0x3A08…` (the Gemeinschaftskasse Safe). This matches the new „Gesamt
Guthaben" fiat figure on the expo Gemeinschaftskasse screen (xDAI×0.92 + EURe, no Münzen).

## Web changes

### `lib/proposal-types.ts`
Extend `ProposalContent.metadata` with
`gemeinschaftskasse_snapshot?: { euro: number; captured_at: string }`.

### `app/api/proposals/store/route.ts`
- Read `attachTreasurySnapshot: boolean` from the request body.
- Build `metadata` from `{ wordCount, estimatedReadTime }`; when `attachTreasurySnapshot`,
  `await treasuryEuro()` and add `gemeinschaftskasse_snapshot = { euro, captured_at }`.
- Wrap the treasury read in try/catch — on failure, store the proposal **without** the
  snapshot (never block proposal creation; the proposal is already on-chain).

### `components/proposals/CreateProposalForm.tsx`
- New state `attachTreasurySnapshot` (default false).
- A checkbox **„Gemeinschaftskasse-Stand anhängen"** (with a one-line helper) placed after
  the description field, before the on-chain-actions section.
- Include `attachTreasurySnapshot` in the existing POST body to `/api/proposals/store`.

## Expo changes

### `lib/governance-types.ts`
- Add `gemeinschaftskasseSnapshot?: { euro: number; captured_at: string }` to `Proposal`.
- In `mapSupabaseToProposal`, read
  `supabaseProposal.content?.metadata?.gemeinschaftskasse_snapshot` and map it (guard on
  `typeof euro === 'number'`). It flows through `useProposalDetails` via its `...mappedProposal`
  spread.

### `app/proposal/[id].tsx`
- Import `StadtkasseSnapshotCard` and `useRouter`.
- After `<ProposalContent>` and before `<VotingStats>`, render:
  ```jsx
  {proposal.gemeinschaftskasseSnapshot && (
    <View style={styles.snapshotWrap}>
      <StadtkasseSnapshotCard
        euro={proposal.gemeinschaftskasseSnapshot.euro}
        onPress={() => router.push('/treasury')} />
    </View>
  )}
  ```
- Add `snapshotWrap: { paddingHorizontal: 20, marginTop: 8, marginBottom: 8 }`.

## Error handling & edge cases

- **Treasury read fails at store time:** proposal stored without the snapshot + a warning log.
- **Legacy proposals / no snapshot:** card not rendered (field absent).
- **Malformed metadata:** mapper guards on `typeof euro === 'number'`.

## Out of scope (YAGNI)

- The card on the proposal **list** card (`ProposalCard`) — detail only for now.
- Web-side rendering of the card (proposals are voted on in expo).
- Editing/removing the snapshot after creation (proposals are immutable on-chain).
- A date on the card (consistent with the posts snapshot — value only).

## Files touched

| File | Change |
|------|--------|
| `apps/web/src/lib/muenzen/gnosis.ts` | new `treasuryEuro()` helper |
| `apps/web/src/lib/proposal-types.ts` | extend `ProposalContent.metadata` |
| `apps/web/src/app/api/proposals/store/route.ts` | capture snapshot when flag set |
| `apps/web/src/components/proposals/CreateProposalForm.tsx` | opt-in checkbox + POST field |
| `apps/expo/lib/governance-types.ts` | `Proposal` field + mapper |
| `apps/expo/app/proposal/[id].tsx` | render `StadtkasseSnapshotCard` |
