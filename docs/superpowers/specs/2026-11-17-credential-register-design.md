# Credential register (Ausweise & Abzeichen) — design

**Date:** 2026-11-17 · **Status:** draft. Max asked for build plans directly; every architectural choice below that he
did not state himself is marked *(my call)* and the ones only he can settle are in section 9.
**Project 2 of 3.** Project 1: [`2026-11-17-sovereign-signup-design.md`](2026-11-17-sovereign-signup-design.md).
Project 3 (mini apps): [`2026-11-17-miniapp-identity-wallet-design.md`](2026-11-17-miniapp-identity-wallet-design.md).

## 1. Intent

Max wants identity in the Röbel app to be a public, sovereign register instead of rows in a database: every role a
person has is a soulbound credential that anyone can verify without asking us. Today that is true for Citizen and
Attester only. He wants Guest too, and then roles that come from the town's real institutions: Stadtvertreter,
Unternehmenszugehörigkeit, Vereinsmitglied and more. He also wants attendance badges for events, in the spirit of
POAPs or stamps.

Issuing must be manageable by the institutions themselves. A Verein with 70 members cannot tap through 70 screens on
a phone, so there has to be a dashboard, ideally in Ortis Studio. And everything in the register must be usable by
mini apps (project 3).

## 2. What exists (verified in code 2026-11-17)

- **Citizen and Attester** are soulbound ERC-721s (`CitizenNFTv2`, `AttesterNFTv2`); voting, MACI sign-up and
  sponsoring depend on them. **Guest** is not a token, just "holds nothing".
- **OrgRegistry** (NSP-14, live): every org is a Safe holding a soulbound OrgNFT. `setRole(orgId, account,
  None|Member|Admin)` can only be called by the org's Safe, one account per call, no expiry, no custom roles. Each
  call emits a public `RoleSet` log. Owners are the Safe's owners.
- **Off-chain** the database is still the authority: `account_owners(account_id, wallet_address, role
  owner|admin|member)`, written only through the `org-membership` edge function, invites one at a time, no bulk
  import. Production has 36 orgs, 13 admin rows and 9 member rows: real member lists have never been entered.
- **No** badge, ERC-1155, EAS or POAP contract exists. "Attended" exists twice off-chain: `tickets.status =
  'checked_in'` (door scanner `app/org/scan-tickets.tsx`) and `reward_claims` with action `event_attend` (Smart
  Event QR, `app/e/[id].tsx`). `app/stamp-scan.tsx` is a stub that writes nothing.
- **Ortis Studio** (branch `feat/ortis-studio-desktop`, never merge unasked) holds no wallet. It pairs with a
  signed-in account and gets a chat session token, which the membership and ticket routes do not accept. It has no
  org-management features. Anything on chain needs the phone or a server to sign.
- The app shows three hard-coded credential cards (`lib/credentials.ts`, `components/profile/credential-art.ts`).
- The data-protection impact assessment (`docs/DPIA_ROEBEL_APP.md` §2.1) does not list OrgRegistry, although its
  `RoleSet` logs already publish who is an admin or member of which org, including Fraktionen.

## 3. Goals, non-goals, anti-goals

**Goals**
- One register on Gnosis where any org can define credential types and issue them, and one question anyone can ask:
  "does this account hold that credential right now?"
- Guest, Citizen and Attester appear in the same register.
- Bulk issuing: 70 members in one confirmation.
- Event badges with almost no extra work for the organiser.
- A person decides whether a credential about them is shown publicly.
- A management dashboard, usable in the browser and in Ortis Studio.

**Non-goals**
- Replacing CitizenNFT/AttesterNFT or changing how citizenship is granted.
- Loyalty stamp cards (count-based "10 Stempel = 1 Kaffee"). Badges can feed that later.
- Transferable or tradeable tokens of any kind.
- Self.xyz / passport-based credentials (reserved in CitizenNFT, separate topic).
- Cross-community federation of credentials (the register is per community; the type ids are namespaced so it can
  follow later).

**Anti-goals**
- A permanent public list of who belongs to a party, a church, a union or a self-help group, created without each
  person's own decision.
- An issuer needing one transaction or one fingerprint per member.
- A member needing to understand wallets, tokens or gas to receive an Ausweis.
- A register whose answers depend on our database being up.

## 4. Approaches considered

| Approach | Verdict |
|---|---|
| **A. One purpose-built `CredentialRegistry` contract**: soulbound ERC-1155, types namespaced by org, batches as Merkle roots, holders claim | **Chosen** *(my call)*. One confirmation per batch for the issuer, the holder's own transaction is their consent, the same mechanism serves roles, memberships and badges, and an unclaimed entry stays provable without being listed. Fits the house pattern (OrgRegistry: own contract, Hardhat tests, internal audit, test env first). |
| B. Extend OrgRegistry (`setRole` with more roles, batch) | Rejected: every member becomes a public log entry the moment the org acts, with no say for the person; no expiry, no badges; OrgRegistry's `attesters` pointer is immutable, so it needs a redeploy anyway. |
| C. Ethereum Attestation Service | Rejected: the repo has no EAS usage and the org-safe design already decided against it; on-chain attestations have the same public-by-default problem, off-chain ones need our own distribution and revocation anyway. |
| D. Hats Protocol (ERC-1155 role trees) | Rejected for now: good for officer hierarchies, but no claim/consent step, no private mode, no badges, and a foreign contract to audit and explain. |
| E. One ERC-721 contract per role, like CitizenNFT | Rejected: a deployment and an audit per role; orgs could never define their own. |

## 5. Design

### 5.1 The register contract (`CredentialRegistry`, Gnosis)

- **Standard:** ERC-1155 where a holder's balance of a type is 0 or 1, non-transferable (transfers and approvals
  revert), with mint and burn events so block explorers show holdings.
- **Type:** `typeId = keccak256(orgId, localId)`. A type has: the org that owns it, a kind (`Role`, `Membership`,
  `Badge`), a metadata URI (name, description, image, benefits; same size limit and style as OrgRegistry), a default
  validity period (0 = no expiry), whether public claiming is allowed, an optional supply cap and claim window (for
  badges), and a claim policy (`IssuerBatch` or `SelfClaim`).
- **Who may do what:**
  - Create or edit a type: the org's Safe, or an account with the `Admin` role in OrgRegistry for that org.
  - Issue and revoke: the same, plus per-type **delegates** the org appoints (for example a door-scanner account or,
    if the org wants instant badges, a node-held key that can do nothing else).
  - The community namespace (`orgId = 0`) belongs to the contract owner (the Attester Safe, later the Timelock):
    that is where Guest lives.
  - The owner can mark a type as **recognised** (an official office of the community, e.g. Stadtvertreter issued by
    the Stadt org). Recognition is a seal, not a permission: it is what apps check when they need "an official".
- **Batches:** issuing means adding a batch = one Merkle root + count + the issuer. One transaction, any number of
  people. A leaf commits to the type, the recipient, a random salt and a `validUntil`. Two leaf kinds:
  - *address leaf*: the recipient's account is known (they use the app);
  - *claim-key leaf*: the recipient is not known yet (paper letter, QR, link). The leaf names a one-time key; whoever
    holds that key can claim to their own account by signing with it.
- **Claiming (public):** the holder sends `claim` with their proof. That mints the credential to them. Their own
  transaction is the record that they wanted it public.
- **Keeping it private:** a holder who does not claim still holds a valid proof against an on-chain root. Anyone
  they show it to can check it with a read call; nobody can list them, because leaves are salted. The register only
  reveals how many entries a batch has.
- **One question for everything:** `holds(typeId, account)` for public credentials, and a read-only proof check for
  private ones. For the reserved types **Citizen** and **Attester** `holds` asks the existing NFT contracts, so
  nothing is re-minted and voting is untouched. Those two addresses are settable by the owner (two-step), because
  an immutable pointer is exactly what makes the v3 NFT cutover painful for OrgRegistry.
- **Revocation and expiry:** an issuer revokes a leaf (burns it if it was claimed); a holder can renounce; an expired
  credential stops counting without a transaction. Revoking an org in OrgRegistry makes all its types stop counting.
- **Guest:** a `SelfClaim` type in the community namespace. A new account claims it once, in the same sponsored
  operation as its first on-chain action, so it costs no extra prompt.
- **Ownership:** two-step ownable, no proxy. A new version is a new deployment with a migration, as with the NFTs.

### 5.2 Membership and OrgRegistry roles *(my call)*

OrgRegistry keeps answering "who may act for this org" (Safe owners and `Admin`). The new register answers "who
belongs to it". The app stops pushing ordinary members into OrgRegistry with `setRole(Member)`; existing `Member`
entries are left as they are. The database's `account_owners` stays the working copy for app permissions for now;
turning the chain into the authority for membership is the org-safe roadmap's stage R5 and is not part of this
project.

### 5.3 Public or private is the holder's decision

- When someone receives a credential the app asks once: **"Öffentlich zeigen"** or **"Privat behalten"**, with one
  sentence each on what it means. The person can switch either way at any time in their profile (Max, 2026-11-17).
  Public → private renounces the on-chain token and keeps the proof; the app must say plainly that the earlier
  public record stays visible in the chain's history and cannot be erased. Private → public is a claim.
- Types of kind `Role` that the community has recognised (offices) are public by nature: accepting the office means
  accepting it on the register.
- **The org decides whether its members may be public at all** (Max, 2026-11-17: "Bürger für Röbel" publishes its
  members, parties may not want to). Per org a switch "Mitglieder dürfen öffentlich sichtbar sein": on = each
  member chooses public or private; off = membership can only be held privately. Orgs of sub-type `fraktion` and
  `stadt` start with it **off** and their admins can switch it on; all other orgs start with it on. Offices
  (recognised roles) of any org are always public. An attester can switch an org to off (protection), the org can
  switch it back on.
- **Private proof, two levels.** (1) *Vorzeigen* (this project): the holder shows a proof to someone they choose;
  that person learns who the holder is and that the credential is valid, nobody else learns anything, nothing can
  be looked up. This is selective disclosure, not zero knowledge. (2) *Zero-knowledge proof* (follow-up plan
  `credreg-6-zk`, not written yet): each credential type also has an anonymous group (Semaphore-style; the repo has
  Semaphore and MACI experience); the holder proves "I am a member of X" without revealing which member, e.g. to a
  mini app or for an anonymous vote among members. Open points for that plan: proving time on older phones, and
  who maintains the group roots.
- Badges default to public but ask the same question.

### 5.4 Issuing in bulk (the 70-member case)

1. An org admin opens the dashboard, picks a type (or creates one from a template: Mitglied, Vorstand,
   Mitarbeiter:in, Ehrenmitglied, Stadtvertreter:in…), and adds people: by searching app users, by pasting or
   importing a list (name plus optional email or phone, only used to deliver the invitation), or by choosing
   "everyone currently in the member list".
2. The dashboard shows what will happen: n people who use the app get a notification, m people get a personal link
   or a printable letter with a QR code.
3. One confirmation on the admin's phone ("70 Mitgliedsausweise ausstellen", one fingerprint) puts the batch on
   chain. Studio and the browser cannot sign, so they hand the prepared batch to the phone through the node, the
   same way Studio already asks the phone to approve agent actions.
4. Each person accepts in the app (public or private). Someone without the app follows their link, installs it,
   creates an account (project 1) and lands on the accept screen.
5. The dashboard shows per person: invited, accepted (public/private is **not** shown to the org unless public),
   expired, revoked. Renewal for a new year is a new batch from the same list. Leaving the Verein = revoke.

### 5.5 Event badges (Abzeichen)

- An organiser switches on "Abzeichen für Teilnehmende" for an event: name and image (default: the event poster),
  that creates a `Badge` type with the event's time window.
- Who gets it comes from what already exists: tickets checked in at the door and Smart Event QR claims.
- **When it arrives** *(my call, see section 9)*: the organiser taps "Abzeichen vergeben" once (during or after the
  event, can be repeated for latecomers) and that is one batch. Orgs that want badges to appear on the spot can
  appoint the node's badge key as a delegate for that one type; the node then adds small batches every few minutes
  while the event runs. The default needs no server key.
- For the attendee the badge is claimed in the same sponsored operation as the Röbel Münzen for attending, so there
  is still one fingerprint.
- `app/stamp-scan.tsx` (a stub today) is out of scope and stays untouched.

### 5.6 In the Expo app

- **Profil:** the three hard-coded cards become a list driven by the register: Gast/Bürger/Bescheiniger as today,
  then roles and memberships as cards (art from the type's metadata, a neutral default per kind), badges as a
  collection grid. Recognised offices show a seal.
- **Annehmen:** notification and inbox entry → the accept screen (5.3).
- **Vorzeigen:** a holder can show a QR code that proves a credential for a few minutes (works for private ones);
  an org admin or anyone with the app can scan and sees "gültig / abgelaufen / widerrufen", the type and the org,
  never a wallet address.
- **Org side on the phone:** issue to one person, revoke, approve a batch prepared on the dashboard, appoint a
  door-scanner delegate.
- Other people's profiles show only their public credentials.

### 5.7 Node backend

- Mirror tables for types, batches and invitations (with the salts and claim keys that make the proofs; locked
  down, reachable only through server routes), filled from chain events by a reader in the style of
  `packages/org-registry`, so lists are fast but the chain stays the truth.
- Server routes for the dashboard that accept both the app's signed requests and the Studio/browser pairing
  session, and check that the caller is owner or admin of the org.
- Invitation delivery: push for app users; link, QR and printable PDF for everyone else; email only if the org
  entered one, used once.
- Sponsoring: claiming and self-claiming for everyone including guests (onboarding budget), issuer actions for
  citizens, via the existing sponsor policy. For accounts still on the old sign-in the vendor-side sponsorship
  rules must allow the new contract (owner gate).

### 5.8 Dashboard

- Built as pages in the web app (`/dashboard/credentials`, next to the existing `/dashboard/members`), so it works
  in any browser *(my call)*. Ortis Studio gets a section "Ausweise" that uses the same server routes; because the
  Studio branch is separate and must not be merged unasked, that section is its own last plan on that branch.
- Screens: types (create from template, edit, image), people (list, import, status), batches (history, pending
  phone confirmation), event badges, delegates.

### 5.9 Rollout

Contract on the burner test environment first, internal audit twice (as for OrgRegistry), then Max deploys to
production with the Attester Safe as owner. App surfaces behind a new flag pair (`credentials_enabled`,
`credentials_enabled_production`), preview channel first. No new native modules.

## 6. Constraints

Everything in project 1's section 6 applies (German UI, English code, no vendor names, never show wallet addresses,
StyleSheet + `useTheme()`, fewest prompts, Max runs deploys and EAS, Supabase through the MCP, work in a worktree and
stage by path). Additionally:
- Hardhat + OpenZeppelin 5.2 in `contracts/governor-contract/contracts/verification-system`, tests in
  `contracts/governor-contract/test`.
- The DPIA must be updated before production: add OrgRegistry (already missing) and the new register, and describe
  the public/private choice. This design is not legal advice; Max should have the membership part looked at.

## 7. Left to the builder

Exact Solidity names and storage layout, leaf encoding, gas trade-offs; table and route names; metadata hosting
(follow what OrgRegistry metadata does); card art defaults; copy; test strategy.

## 8. What project 3 relies on from here

`holds(typeId, account)`, the private-proof check, type metadata, the recognised flag, a published ABI and reader,
and a node route that answers "which of these types does the signed-in user hold" for the app's own use.

## 9. Decisions that are Max's

1. ~~Public or private per person, party-like orgs private-only~~ **Decided by Max 2026-11-17:** each person
   switches public/private any time; each org decides whether its members may be public (Fraktion/Stadt start
   private, can open up); zero-knowledge membership proofs as a follow-up plan.
2. **Guest as a self-claimed token** (5.1). It makes "all roles are SBTs" true at no extra prompt, and puts a public
   count of guests on chain. Alternative: Guest stays "holds nothing".
3. **Citizen and Attester are shown through the register, not re-minted** (5.1).
4. **Badges arrive when the organiser issues them**, instant only if the org opts into the node key (5.5).
5. **Members stop being written to OrgRegistry** (5.2).
