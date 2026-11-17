# Sovereign sign-up — design

**Date:** 2026-11-17 · **Status:** draft, awaiting Max's approval
**Builds on:** [`2026-09-26-passkey-sovereign-accounts-design.md`](2026-09-26-passkey-sovereign-accounts-design.md),
[`2026-09-26-ortis-identity-migration-design.md`](2026-09-26-ortis-identity-migration-design.md),
[`../../PASSKEY_ACCOUNTS_STATE.md`](../../PASSKEY_ACCOUNTS_STATE.md), [`../../PASSKEY_SIGNIN_NOTES.md`](../../PASSKEY_SIGNIN_NOTES.md)

This is project 1 of 3. Project 2 (public register of soulbound roles + credential management in Ortis Studio) and
project 3 (roles exposed to mini apps) get their own designs afterwards and are out of scope here.

## 1. Intent

A person can join the Röbel app with no email, no phone number and no social login, and owns their account in a way
that neither Apple, Google, thirdweb nor we can take away or reset. Max wants to be able to say in marketing that
this is a decentralised, sovereign stack that does not depend on US corporations, and for that to be true.

The audience is a whole town, including people who have never used a wallet. So independence has to be the default
without making sign-up harder than one fingerprint, and nobody should lose a citizen account by accident.

## 2. What Max decided

1. **Default sign-up = "Unabhängiges Konto" with a passkey.** No email. (Built, off in production.)
2. **12 words ("Wiederherstellungswörter") as an optional backup for every independent account.** They restore the
   account on a new phone without Apple, Google, guardians or us. They are a *recovery* key, not an instant key:
   using them starts the same 3-day wait as guardian recovery, and the owner can cancel.
3. **Expert path:** the app creates the key itself and the 12 words *are* the main key. Nothing is stored in an
   Apple or Google keychain.
4. **Google, Apple and email sign-in stay** as a clearly secondary choice "for users who do not care about privacy".

## 3. Goals, non-goals, anti-goals

**Goals**
- A new user can sign up on the independent path in production, as a guest, and later become a citizen.
- Every independent account can switch on the 12 words; the expert path works end to end (create, use, back up,
  restore on a new phone).
- A citizen account on the independent path always has a way back: guardians or a saved backup.
- A written, honest list of what the independent path still depends on (section 9).

**Non-goals**
- Moving existing thirdweb users. They keep their login; the existing opt-in handover ("wrap, don't move") stays as
  it is and is offered later.
- Removing thirdweb, Supabase, Vercel or Expo from the stack.
- Soulbound Guest card, new roles, Studio dashboard, mini-app role access (projects 2 and 3).
- A web sign-up. Expo is the only citizen client.

**Anti-goals** (failure even if it works)
- An app update or flag flip that logs anyone out.
- A citizen who loses their account because the app never made them set up a way back.
- 12 words that give a thief instant control.
- Marketing copy in the app that claims more independence than section 9 supports.
- More fingerprint prompts than today for the same action.

## 4. Approaches considered

| Approach | Verdict |
|---|---|
| **A. Extend the passkey Safe stack on main** (Safe 1.4.1 + Safe4337Module + Candide SocialRecoveryModule, own sponsor route) | **Chosen.** Deployed and audited on Gnosis, already carries guardians, the 3-day delay, cancel, sponsoring and the app-wide wallet adapter. The expert key is just another owner type; the 12 words fit the recovery module. |
| B. Netizen Accounts (Kernel, node-held signing) | Rejected: the node holds the user's key. That is the opposite of the claim. |
| C. Plain seed-phrase wallet (EOA, no smart account) | Rejected: no gasless transactions, no recovery, a lost phrase is a lost Bürgerkarte, and every verifier and the sponsor would need a third identity type. |

Max handed over the how; A is my pick.

## 5. Design

### 5.1 Three ways in (welcome screen, logged out)

In this order, one primary button:

1. **"Unabhängiges Konto"** (primary) — passkey, as built. Subtext as today.
2. Under it, a text link: **"Ohne Apple- oder Google-Schlüsselbund: mit 12 Wörtern"** — the expert path.
3. **"Mit Google, Apple oder E-Mail anmelden"** — secondary, one line of honest subtext along the lines of
   "Bequem, aber dein Schlüssel liegt bei einem Anbieter."
4. "Erst mal umsehen".

"Anmelden" for returning users offers: passkey, 12 words / backup file, Google/Apple/email.

### 5.2 Expert path (new)

- **Key:** a BIP-39 12-word phrase (English wordlist, standard, so the words work in any other wallet tool)
  generated on the device; the account key is the standard Ethereum derivation `m/44'/60'/0'/0/0`.
- **Account:** the same kind of Safe as the passkey path (4337 module and recovery module enabled at setup), with
  that key as its single owner. Counterfactual until the first sponsored action, as today.
- **Storage:** the phrase stays on the device in the secure store, device-only (never synced to a cloud keychain).
- **Sign-up flow:** create → show the 12 words once with a short "write them down" screen → confirm three of them →
  in the app. The user may skip the confirm step as a guest; see 5.4.
- **Backup file (second step, needs a store build):** Settings → "Backup-Datei speichern": the phrase encrypted
  with a password the user chooses, handed to the system share sheet so they can put it anywhere. Same file restores
  the account. The current binary can neither share a file on Android nor pick one (no `expo-sharing`, no
  `expo-document-picker`), so this part waits for the next store build; the first step ships with the words only.
  **OPEN, Max's decision — see section 10.**
- **Restore on a new phone:** "Mit 12 Wörtern anmelden" (later also "Backup-Datei öffnen") → the same account,
  immediately (the words are the owner key here, so no 3-day wait).
- **Guardians and owner changes** *(my call)*: an expert account may also have human guardians. A guardian recovery
  ends in a **new 12-word phrase** as the owner (the sponsor's recovery mode must accept an ECDSA owner as well as a
  passkey signer). Replacing leaked words by the user themselves (rotation) is deferred.
- **Finding the account after an owner change** *(my call, in scope)*: once the owner has changed, the key no
  longer derives the Safe address. This gap already exists for a passkey account recovered on one device and opened
  on another (`PASSKEY_SIGNIN_NOTES.md` §7, not built). With words recovery becoming a normal path it must be
  closed: sign-in resolves owner → Safe from chain data (owner-change and recovery events), optionally sped up by a
  server index that is always re-checked on chain. The builder picks the mechanism.
- **Signing prompts:** never more than the passkey path. Builder's call how the device unlock is used, with one
  rule: revealing the words, exporting the backup and changing recovery settings always require the device unlock.

### 5.3 Wiederherstellungswörter for passkey accounts (new)

- Settings → Passkey → "Wiederherstellungswörter einrichten". The app generates 12 words, shows them once, the user
  confirms, the app **forgets the words** and keeps only what it needs to list them as a recovery method.
- On chain they are guardians in the existing recovery module, so everything already built applies: recovery to a
  new passkey after 3 days, cancel by the owner, alerts.
- **The words must be enough on their own.** The module has one guardian threshold (default 2). So the words stand
  for as many guardian addresses as the current threshold (derived from the phrase at successive indexes). The app
  stores only those public addresses (a fixed small pool, e.g. 5) and adds or removes them when the user changes the
  threshold, in the same sponsored op. In the UI they appear as one entry, "Wiederherstellungswörter", never as
  several people. *(My call. Alternative considered: a Zodiac Delay module with the words as an owner-in-waiting;
  rejected for now because it adds a second contract per account and an unsponsorable EOA transaction.)*
- **Restore:** "Konto wiederherstellen" → "Mit 12 Wörtern" → new passkey on this phone → one sponsored op carrying
  the word-derived approvals (the existing `multiConfirmRecovery` path) → 3 days → finalize.
- **Alerts:** today the recovery warning goes out by email only, and email is optional. Add a push notification and
  an in-app banner to the account's signed-in devices when a recovery starts, with "Das war ich nicht → abbrechen".

### 5.4 The way-back rule before the Bürgerkarte

A guest needs nothing. Before an independent account can **request citizenship**, the app requires at least one of:
at least one guardian set up (a family member or friend; the vouching attesters are added after approval, as in
the existing rule), Wiederherstellungswörter confirmed, or (expert path) the words confirmed, later also a backup
file exported. For this to be possible a guest must be able to do those things, see 5.6. Google/Apple/email accounts are exempt (they come
back by logging in again). Enforced in the app before `createAttestationRequest`; the screen explains why in one
sentence and offers the fastest option.

### 5.5 Signature-derived keys (voting key, Nostr key, commitment salt)

Today these are wrapped with the passkey and backed up on our server; a new passkey after recovery cannot open
them. With words in play:
- Expert path: wrap them with a key derived from the phrase. Restoring from words restores them too.
- Passkey path with Wiederherstellungswörter: store a second wrapped copy under a key derived from the words, so a
  words-recovery brings back voting and Nostr identity, not just the account.
The server only ever holds ciphertext.

### 5.6 Sponsoring

- The sponsor route today only accepts a Safe it can prove belongs to a passkey (x, y). It must also accept the
  expert-path Safe (same setup, ECDSA owner), with the same strictness about what "genuine" means.
- **Guests:** today a non-citizen independent Safe is sponsored for exactly one thing, the citizenship request.
  Bring it to parity with what a thirdweb guest can do today in the app (collecting Röbel Münzen and the profile
  sync that goes with it), under the existing small per-account onboarding budget plus a global daily cap for all
  guests together, failing closed. No value transfers, no arbitrary targets.
- **Guests can set up and use their way back** *(my call)*: guardian management (add, revoke, threshold, cancel)
  and recovery are sponsored for non-citizen independent Safes too, for any guardian address, under the onboarding
  budget and the global guest cap. Today both are citizen-only, which would make 5.4 impossible on the default path.
- Recovery ops signed by word-derived guardians ride the existing `recovery` mode.
- **Röbel Münzen** *(my call)*: no new rules for who gets Münzen. A guest gets them exactly as today (after an
  invitation by a registered person); the sponsor then covers collecting and the profile sync for that Safe. What
  is in scope is closing the known gap that an account whose identity is the Safe itself cannot join Circles at
  all (`PASSKEY_SIGNIN_NOTES.md` §7): a new citizen on the independent path must be able to get Röbel Münzen like
  any other citizen.

### 5.7 Verifiers

Every place that checks a signature (list in `PASSKEY_SIGNIN_NOTES.md` §2a) already accepts a deployed or
counterfactual Safe via ERC-1271 / ERC-6492. The expert-path Safe produces standard Safe signatures, so no new
rule; the builder confirms each endpoint with a test rather than assuming.

### 5.8 Rollout

- Everything behind the existing flags (`passkey_accounts_enabled`, `passkey_accounts_enabled_production`) plus one
  new flag for the expert path and words, so the passkey default can open in production first.
- Order: preview channel → Max's device pass → production for **new sign-ups** → migration offer to existing users
  later (out of scope).
- No new native modules if at all avoidable, so this ships by OTA on the ≥ 3.8.0 binaries. If one is unavoidable,
  stop and tell Max before building: it means a store build and the never-log-out checks.
- Boot stays as designed: a flag flip never signs anyone out; a session of the new owner type restores without a
  prompt.
- **Split the gate** *(my call)*: today one pair of flags opens every passkey surface at once (sign-up, the
  migration screen for existing users, recovery links, "thirdweb trennen"). "Production for new sign-ups" means
  existing thirdweb users must not see migration or detach yet, so the gate is split into sign-up/sign-in,
  migration and detach before the production flag is flipped.
- **Existing accounts that already moved to a passkey** *(my call)*: they can switch on the words too, but
  word-derived guardians do not count as people for the irreversible "thirdweb trennen" check. That check keeps
  requiring two human guardians until Max decides otherwise.

### 5.9 Staying logged in across updates (hard requirement, added 2026-11-17)

Max: after every new store build users are logged out today, and that must never happen. This applies to all three
sign-in paths and is a release blocker for this project:
- An app update, store build or OTA, never ends a session. A session ends only when the user logs out or the
  account is recovered elsewhere.
- A failed restore is not a logout. Today any error while restoring (including no network) is swallowed, the app
  shows the logged-out state and wipes the cached user although the stored session is still there. Restore must
  tell "no stored session" apart from "could not restore right now", keep the person in and retry.
- Restore failures are recorded with their reason, so a logout after an update can be explained instead of guessed.
- Every store build gets an update test before release: install the previous store version, log in on each path,
  install the new build over it, confirm still logged in. On Android with the same signing key as the store.
- The cause of today's logouts is under investigation separately and is fixed on its own, not as part of this
  project; this project must not ship before that fix is confirmed on a real update.

## 6. Constraints

- The app is live. thirdweb login keeps working untouched.
- UI German, code and comments English. StyleSheet + `useTheme()`. Never show wallet addresses.
- "Röbel Münzen" by name, never "Währung" or CRC.
- Most on chain, fewest prompts: batch related calls into one sponsored op.
- Max runs EAS updates, production deploys and paymaster funding himself.
- Supabase changes through the Supabase MCP.

## 7. Operational gates for production (Max)

Already known from the state doc, repeated because they block this project's goal:
1. `id.ortis.app` serves the Apple and Android app-association files (deploy `ortis-id`).
2. A dedicated production paymaster for the passkey sponsor route, owned by a Safe, funded; its signer key in
   Vercel production. Never the Netizen demo signer.
3. Unapplied migrations applied (persistent sponsor budget, key backup, contact email) and the edge functions with
   the Safe verifier redeployed.
4. A shared rate limiter instead of the in-memory one.
5. Flags set; privacy text updated for the optional warning email.

## 8. Left to the builder

- File format and KDF for the backup file (must be documented in the repo so a third party can decrypt it without
  our app; that is part of the sovereignty claim).
- Exact German copy, screens and where the entries sit in Settings.
- Size of the word-derived guardian pool and how threshold changes are batched.
- The guest allowlist entries, derived from what thirdweb guests do today.
- Test strategy; the existing byte-exact vectors and fork tests are the pattern to follow.

## 10. Open decision for Max

**Backup file and the next store build.** The file export/import needs two native modules, so it cannot ship by
OTA. Options: (a) ship passkey default + words + expert path with words only by OTA now, backup file with the next
store build *(my recommendation)*; (b) hold the whole expert path until a store build; (c) drop the file and offer
an encrypted QR code or text instead, which works in today's binary.

## 9. Honest dependency list (ships as `docs/SOVEREIGNTY_LEDGER.md`)

The builder writes and maintains a short table: for each of key custody, key backup, recovery, gas, bundler, RPC,
app distribution, database, hosting — who it depends on for each of the three sign-in paths, and what happens to
the user if that party disappears or turns hostile. Marketing claims are checked against it. Known at design time:
the passkey default still syncs through the Apple or Google keychain unless the user adds the words; the app is
distributed through the Apple and Google stores; Supabase, Vercel and Expo host the app's backend and updates; the
optional "E-Mail oder Google als Helfer" recovery option uses thirdweb. None of them can move or seize an
independent account; some can interrupt service.
