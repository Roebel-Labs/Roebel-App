# Röbel-Taler Onboarding (invite operator) — Runbook

How a citizen becomes a Röbel-Taler member so they can mint daily. Built 2026-06-17.

## Flow (all gasless on Gnosis)
1. App: citizen taps **"Bei Röbel-Taler mitmachen"** → `useRoebelTaler.onboard()`.
2. App → Edge Function **`circles-invite`** with the citizen's Gnosis address.
3. Edge Function gates on **CitizenNFT (Gnosis `0x6FF3…`)**, then the server-held
   **operator** calls `Hub.trust(citizen, expiry)` — the Circles invitation.
4. App calls `Hub.registerHuman(operator, 0x0)` via the citizen's Gnosis smart
   account (sponsored). The `WELCOME_BONUS` flows operator → citizen.
5. Citizen is now a Circles human → `personalMint()` ("Heute abholen") works, and
   `groupMint(roebeltalerGroup, [self], [amt], 0x)` contributes to the Röbeltaler.

## Deploy the Edge Function
```
supabase secrets set OPERATOR_PRIVKEY=0x<operator>   # via Supabase MCP / dashboard
supabase secrets set GNOSIS_RPC_URL=https://rpc.gnosischain.com
# deploy apps/expo/supabase/functions/circles-invite via Supabase MCP deploy_edge_function
```

## The operator avatar
- Must be a **registered Circles human on Gnosis** holding CRC (the invite spends
  `WELCOME_BONUS` per citizen). Key lives ONLY as the `OPERATOR_PRIVKEY` secret.
- Register it BEFORE retiring any bootstrap wallet that invited it.

## Bootstrap — SOLVED: use the Circles InviteFarm community quota
Normal invites cost the inviter ~96 CRC (invitee receives 48), so a fresh operator
with no CRC can't cold-start. The fix is Circles' **InviteFarm**: a community gets an
invitation **quota** that onboards people WITHOUT spending CRC per invite.
- Package: **`@aboutcircles/sdk-invitations`** — `InviteFarm.generateInvites()` /
  `generateReferrals(count)` (the latter pre-deploys accounts for brand-new users).
- One-time: request Röbel's quota from the Circles team (Telegram).
- Then the operator/Edge Function mints invites from the quota instead of spending CRC.

Implementation switch: replace the operator's `trust()` (CRC-funded) path in
`circles-invite` with an InviteFarm `generateInvites()` call backed by the quota.
The app's `registerHuman(inviter)` step is unchanged.

(Side note: `personalMint` reverting on the just-registered burner was the standard
"no issuance accrued yet" case — irrelevant once InviteFarm handles onboarding.)
