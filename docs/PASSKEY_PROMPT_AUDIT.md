# Passkey prompt audit (fingerprint / face prompts)

**Status (2026-09-27):** branch `feat/passkey-fewer-prompts`. Preview-only, like every passkey session.
Rule from Max: as much on-chain as possible, as FEW fingerprint prompts as possible.

Under a passkey session every `account.signMessage`, `account.signTypedData`, `sendTransaction` /
`sendBatchTransaction` and `getPrfSecret` is one WebAuthn assertion, which means one prompt. Restoring a session never
prompts (`lib/passkey/boot.ts`). thirdweb sessions sign silently and are unchanged by everything below.

**Legend.**
- **Auto**: fires without a tap on the thing it signs for (mount, focus, interval, retry, launch). An automatic prompt
  is a bug.
- **Before / After**: prompts per occurrence.
- **T**: the passkey API session token (below). One signature per device session (≤ 30 days) replaces the
  per-request signatures of every web route and edge function listed. "After" assumes tokens are ON. With tokens OFF
  (env unset), those rows fall back to "Before", except where a guard is listed.

## The fix in one paragraph

The identity signs ONE `Röbel Sitzung` message per device session. `POST /api/passkey/session/start` verifies it and
returns an HMAC token bound to the identity and the device id, stored by id in `passkey_api_sessions` so it can be
revoked (sign-out revokes it). The `verifyAccountSignature` rules apply: Safe 1271/6492, Safe-admin envelope,
thirdweb admin.

The app gets the token lazily, on the first signed request of a passkey session, and never at app start. It caches
it in SecureStore under `passkey_api_session_v1` and signs a fresh one when fewer than 3 days are left. Every
request that used to carry a fresh signature sends the token instead:
- web: `Authorization: Bearer`;
- edge: `x-roebel-session`;
- both: `x-roebel-device`.

A server without tokens is detected **before** signing (`GET /api/passkey/session`), so it never costs an extra
prompt. A refused token falls back to the per-request signature.

## Signed requests (off-chain)

| # | Trigger (code) | Screen | How often | User / Auto | Before | After |
|---|---|---|---|---|---|---|
| 1 | `org-membership` `create_account` (`UserContext.tsx:125` → `createPersonalAccount`) | first login | once per account | Auto (right after the sign-in prompt) | 1 | 1, which is now the session-token signature, so later calls are free (kept: the personal account is needed at once) |
| 2 | `org-membership` `list_invites` (`hooks/useOrgMembers.ts:33`) | Org → Mitglieder | every mount + after every remove/role/revoke | Auto | 1 per load (2 per mutation) | 0 (T) |
| 3 | other `org-membership` actions (invite, accept, decline, leave, remove, role, update_account, create org) | org screens, notifications, edit-org, opening hours, create-org | per tap | User | 1 each (create org: 2) | 0 (T) |
| 4 | `merchant-registry` `upsert_account` / `link_entity` (`app/payments/onboarding.tsx`) | Konto & Karte, merchant step | per tap (deploy step 3–4) | User | 1 each | 0 (T) |
| 5 | Chat sign-in (`lib/chat/session.ts` `signIn`) via Welcome "Los geht's" | Mecky chat | once per 30-day chat token | User | 1 | 0 (T), or the one session signature |
| 6 | Chat re-sign inside `withAuth` (`lib/chat/api.ts`) from bootstrap focus, thread focus, 4 s task poll, inspiration | Mecky chat | every 4 s after a failed or cancelled sign | **Auto (bug)** | 1 per tick | **0**: background calls never sign on a passkey session (`background: true`), with or without T |
| 7 | `tickets_list` (`app/tickets/index.tsx`) | Meine Tickets | every focus | **Auto (bug)** | 1 per focus | 0 (T); without T: first open only, later focus refreshes only when silent |
| 8 | `order_status` poll (`app/tickets/[order].tsx`) | ticket order | every 4 s for up to 180 s | **Auto (bug)** | up to ~45 | 0 (T); without T: 1 on open, **poll ticks skipped** (`canSignSilently`) |
| 9 | `ticket_types_list` + `connect_status` + `orders_list` (`app/org/event-tickets/[id].tsx`) | Org event tickets | every mount (+1 after refund) | Auto | 3 (signed one at a time since ccff59ee) | 0 (T), or the one session signature (parallel calls share it; it waits in the same signature queue) |
| 10 | `connect_status` (`app/org/payments.tsx`) | Org → Zahlungen | every focus | **Auto (bug)** | 1 per focus | 0 (T); without T: first open only |
| 11 | `connect_session` + Stripe's own `fetchClientSecret` refresh (`ConnectOnboardingModal.tsx:43,59`) | Stripe onboarding modal | open + automatic refreshes | Auto (:59) | 1 each | 0 (T) |
| 11b | Org money dashboard (`app/org/money.tsx` → `useConnectInstance`: `connect_session` when opened, plus Stripe's own automatic `fetchClientSecret` refreshes) | Org → Einnahmen | open + automatic refreshes | Auto (refresh) | 1 each | 0 (T); without T: 1 when opened, **refreshes never prompt** (`canSignSilently`; the screen is reopened instead) |
| 12 | `checkout`, `checkin`, `ticket_types_upsert`, `connect_onboard` | event tickets, scanner, org | per tap / scan | User | 1 each | 0 (T) |
| 13 | `refund_order` | Org event tickets | per tap | User | 1 | 1 (kept on purpose: money-moving, the server requires a fresh signature) |
| 14 | Key backup read (`lib/passkey/key-backup.ts`) | Schlüssel sichern, key restore | per use | User | 1 (with PRF) | 0 with a cached token; else 1 signed read that also yields the PRF |
| 15 | Key backup write | Schlüssel sichern, first key of a passkey-only person | per use | User | 1 | 0 (T) (`replace: true` keeps its proof) |
| 16 | Gnosis Pay SIWE (`app/payments/onboarding.tsx:130`) | Konto & Karte | on screen mount, once per 24 h token | **Auto (bug)** | 1 | **0 on mount** (the button signs in); a vendor API cannot take our token |
| 17 | Account deletion (`lib/supabase-account-deletion.ts`) | Einstellungen | per tap | User | 1 | 1 (kept: destructive, fresh signature) |
| 18 | Passkey warning email add/remove (`lib/passkey/email.ts`) | Passkey settings | per tap | User | 1 | 1 (kept: it is the recovery-alert channel, a security setting) |
| 19 | Nostr binding (`registerIdentity`, `lib/nostr/identity.ts:184`) | Einstellungen → Nostr | per tap | User | 1 | 1 (kept: the signature is a persisted public proof that the relay syncer re-checks) |
| 20 | Nostr silent self-heal (`ensureIdentitySilently` via `ConsentGate.tsx:32`) when a local key exists but is unregistered | any (4 s after launch) | **every app start** until registered | **Auto (bug)** | 1 per start | **0**: never on a passkey session (`identity.ts` guard moved to the top) |
| 21 | Mini-app `personal_sign` / `eth_signTypedData*` | mini apps | per confirm sheet | User | 1 | 1 (third-party servers) |
| 22 | XMTP: activate / link Safe to inbox (`lib/xmtp/client.ts:360,455`) | Nachrichten, Passkey settings | per tap | User | 1+ | 1+ (unchanged; silent boot already guarded at `client.ts:338`) |
| 23 | Migration, guardians, recovery, detach, email proof, sign-in (`lib/passkey/*`) | Passkey settings, recovery | per tap | User | 1 each | unchanged |

## Keys (PRF)

| # | Trigger | How often | User / Auto | Before | After |
|---|---|---|---|---|---|
| 24 | MACI key (`MaciContext.generateAndStoreKeypair`) | first vote on a device | User | device blob: 1; backup: 1–2; new: 2–3 | same; the key is persisted locally after the first unwrap, so later uses cost **0**; concurrent resolves share ONE prompt (`singleFlight`) |
| 25 | Nostr key (`deriveAndStoreIdentity`) | first Nostr use | User | as above | as above |
| 26 | Commitment salt (`deriveCommitmentSalt`) | verification request, birthdate sheet | User (or chained) | **1 on EVERY call** from a device blob (the salt was never persisted without a preimage) | 1 once; persisted under `passkey_commitment_salt_v1.<identity>` |
| 27 | "Schlüssel sichern" (`completeKeysForSession`) | per tap | User | read 1 + write 1 (+ PRF) | read 0–1 + write 0 (T) (+ PRF only when a blob must be wrapped or compared) |

`getPrfSecret` is only reached when a slot has no local key (`resolvePasskeySecret` case (b)/(c)) or when "Schlüssel
sichern" must wrap or compare a blob. The tests in `lib/passkey/__tests__/fewer-prompts.test.ts` show:
- the first use costs one PRF;
- every later use costs none;
- three concurrent resolutions of a slot share one PRF.

## On-chain

| # | Trigger | Screen | How often | User / Auto | Before | After |
|---|---|---|---|---|---|---|
| 28 | Münzen claim (`personalMint` + `groupMint`) | Münzen page | per tap | User | 1 (fixed on main: one batch, no retry) | 1 |
| 29 | Vote `publishMessage` (`components/VoteButtons.tsx`) | proposal | per tap | User | 1, **+2 automatic retries** on cancel/failure, and a **re-sent vote** when the Supabase mirror failed | **1**: one attempt on a passkey session; the tx is never re-sent after it succeeded (receipt reused, all sessions) |
| 30 | MACI `signUp` | proposal | per tap | User | 1 | 1 (cannot share an op with the vote: the vote needs the stateIndex that `signUp` assigns) |
| 31 | Circles profile resync (`app/edit-profile.tsx:140`) | Profil bearbeiten | **every save** while published, even a bio-only or neighbourhood edit | Auto (hidden) | 1 | 0 unless name, bio or photo changed (passkey session) |
| 32 | `registerHuman` on event-QR scan (`app/e/[id].tsx:32`) | event QR landing | once per account | The scan is the tap | 1 | 1 (unchanged; see open points) |
| 33 | Verification request (`useVerification`) incl. the chained auto request at the end of onboarding (`app/welcome/consent.tsx:100`) | Bürger request | per request | User (chained) | salt 0–3 + tx 1 | salt 0–1 + tx 1 |
| 34 | Münzen send / tip / chat payment / lootbox / Circles profile toggle / guardians / org Safe | various | per tap | User | 1 each | 1 each |
| 35 | Background claim (`useDailyMint`), XMTP deploy self-transfer, MACI signUp at start | n/a | never on a passkey session | Auto | 0 (already guarded on main) | 0 |

No other automatic on-chain op fires on a passkey session:
- `useDailyMint.claim` refuses.
- The XMTP self-transfer only runs without a passkey session.
- `refreshSignUp` only reads.
- `GnosisWalletContext` returns the adapter.

## What a typical session costs now (tokens ON)

- Sign in: 0 (restore) or 1 (discoverable sign-in).
- First authenticated request of the session (org, tickets, chat, key backup…): **1**, then **0** for up to 30 days
  on this device.
- Each on-chain action: 1 (a vote, a claim, a send).
- First use of a key on a new device: 1 PRF, then 0.

## Open points (not changed, by design or for Max to decide)

- `app/e/[id].tsx` sends `registerHuman` when the event-QR screen opens. The scan is the person's intent, but a
  confirm button would make it explicit.
- `app/welcome/consent.tsx` sends the Bürger request as part of finishing onboarding. It is one flow with 1–2
  prompts; making it a separate tap is a UX decision.
- `create_account` right after the first passkey login still prompts once. That signature now doubles as the session
  token, so nothing else in the session prompts.
