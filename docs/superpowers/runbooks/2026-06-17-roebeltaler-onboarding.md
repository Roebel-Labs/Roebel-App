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

## ⚠️ OPEN — the CRC bootstrap (question for the Circles team)
The invite economics have a genuine cold-start: an inviter needs **CRC** to invite,
but CRC only accrues (~24/day) **after** a human registers. Today **no Röbel wallet
holds CRC** (the burner is registered but `personalMint` reverted — likely
just-registered/issuance-not-accrued or `stopped`). So the *first* registrations
can't be funded by a normal invite. Resolve with Circles:
- Is there an **invitation farm / Gnosis Pay invite quota** (`invitationFarmAddress`,
  `gnosisPayInviteQuotaGranteeAddress` in `circlesConfig[100]`) that seeds the first
  inviter without pre-existing CRC?
- Why did `personalMint` revert for the freshly-registered burner — timing, or a
  required prior step? (Decode the revert with the Circles team.)
- Recommended once unblocked: register the **operator early** so it accrues CRC, and
  onboard citizens as CRC allows; or have the Circles team bootstrap the operator.

Everything in the app + the Edge Function is built and correct for the standard
`trust` → `registerHuman` flow; this bootstrap is the only thing between "built" and
"a citizen can self-onboard end-to-end."
