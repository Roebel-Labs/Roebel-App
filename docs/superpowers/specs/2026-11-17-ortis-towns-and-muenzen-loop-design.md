# Ortis towns: setup, credentials across towns, Münzen loop — design

**Date:** 2026-11-17 · **Status:** draft for Max's approval. **Project 4.** Builds on projects 1–3
(`2026-11-17-sovereign-signup-design.md`, `2026-11-17-credential-register-design.md`,
`2026-11-17-miniapp-identity-wallet-design.md`).

## 1. Intent

Röbel becomes the first of many towns on Ortis. Each new town gets the same civic stack — citizenship, credentials,
votes and its own Röbel-Münzen-style group — without Ortis becoming the authority over any of it. Münzen are a
reward for local participation, spent inside the app and kept as recognition; they never touch euros or shops.

## 2. What Max decided (2026-11-17)

1. Münzen: spend inside the app + recognition, more later only if it raises no real-world legal questions. No
   paying at local shops, no euro in or out.
2. Economy approach 1: **one community pool per town**; rewards come out of it, in-app spending flows back in.
3. Ortis hosts each town's backend by default *(my reading of "1." together with my recommendation; correct me)*;
   a town can move to running it itself.

## 3. Goals, non-goals, anti-goals

**Goals:** a new town goes live through one guided flow; each town owns its on-chain layer; credentials and
citizenship are per town but checkable across towns; a self-refilling Münzen loop per town that rewards
participation.
**Non-goals:** shop payments, euro exchange, cross-town citizenship rules beyond "one home town", migrating Röbel to
the new factory (Röbel stays as deployed, registered as town #1).
**Anti-goals:** Ortis able to grant citizenship, issue credentials, move Münzen or change reward rules; Münzen that buy
votes or influence; a town locked into Ortis hosting; wording that frames Münzen as money ("Währung", euro values).

## 4. Approaches considered

| | Verdict |
|---|---|
| **Pool per town (closed loop)** | **Chosen by Max.** |
| Participation unlocks conversion (no pool) | Rejected as the main mechanism (excludes people who cannot attend); kept only as today's entry rule: group membership. |
| Points in the database | Rejected: not sovereign, not verifiable. |
| One shared registry/group for all towns | Rejected: Ortis would sit in the middle of every town's authority. |

## 5. Design

### 5.1 Layers and ownership

| Layer | Per town | Owner | Operator |
|---|---|---|---|
| On chain | CitizenNFT + AttesterNFT, Governor + Timelock (+ MACI), OrgRegistry, CredentialRegistry, Münzen group, pool Safe | the town (Attester Safe first, Timelock later) | none |
| Backend node | database, mini-app index, sponsoring, push, identity service | the town's data | Ortis (hosted) or the town (sovereign), same software, switchable without any account changing |
| App | Ortis app with a town switch; Röbel keeps its own app as town #1 | Ortis | Ortis |

### 5.2 Setting up a town ("Gemeinde gründen")

A flow in the Ortis operator console, run by Ortis staff as a service:
1. **Founding circle:** ≥ 3 people from ≥ 2 different institutions become the first attesters and create the town's
   Attester Safe from their phones (each signs in with project 1's independent account).
2. **Deploy:** the community factory (`contracts/governor-contract/scripts/community-factory.cjs`) is extended to also
   deploy OrgRegistry and CredentialRegistry and to create the Circles group and the pool Safe; ownership goes to the
   town's Safe, the deployer renounces everything, the set is recorded in CommunityRegistry. Ortis pays the gas.
3. **Backend:** Ortis provisions the town's node (hosted mode) with its own sponsoring budget and web address.
4. **Go live:** the town appears in the app's town switch; attesters verify the first citizens.
5. **Hand-over record:** a public, signed record of every address and owner, stating Ortis holds no keys.

### 5.3 Credentials and citizenship across towns

- Each town has its own Citizen/Attester set and CredentialRegistry (the reserved community namespace of
  `credreg-1` is that town's).
- One account, one home town: a person is citizen where they live, guest or member elsewhere. Enforced socially by
  each town's attesters; votes are per town, so a double citizenship cannot distort a vote.
- Cross-town checks go through CommunityRegistry ("citizen of any listed town"), exposed to mini apps as a
  credential reference (project 3).
- The app's town switch changes which town's register, feed and Münzen are shown; credentials from all towns show
  in the profile, grouped by town.

### 5.4 The Münzen loop per town

- **Group:** one Circles v2 group per town (as Röbel today); joining stays the entry rule.
- **Pool:** a Safe owned by the town holds Münzen for rewards. Reward rules (what pays how much, per-event caps,
  per-person daily limits) live in the town's settings and change only through the town's governance.
- **Out (rewards):** attendance (via credential badges, project 2), organising an event, helping with a Vorhaben,
  first steps in the app. One per person per occasion, bound to citizenship or group membership.
- **In (sinks):** everything spent in the app flows to the pool: lootbox keys, boosting a post or event, comment
  tips' platform share if any, profile extras, mini-app payments' town share, sponsoring a Vorhaben.
- **Start-up funding:** the pool is seeded by the founding circle and willing members converting their own personal
  Münzen into it; optionally a small share of each conversion goes to the pool *if* Circles v2's group mint policy
  allows it — to be verified before building (open question).
- Circles' yearly decay (~7 %) keeps Münzen moving.
- **Recognition:** profile shows Münzen earned through participation (not the balance) next to badges.
- **Never:** voting weight, euro values, redemption, shop payment.

## 6. Constraints

Project 1's constraints apply (German UI, no vendor names, never wallet addresses, fewest prompts, Max runs deploys).
"Röbel Münzen" in Röbel; other towns name their own Münzen. Legal check of the Münzen framing before the first
non-Röbel town goes live.

## 7. Open questions

1. Can a Circles v2 group route a share of each conversion to a treasury? (Verify against the deployed group/mint
   policy contracts before planning that part.)
2. Ortis hosting as a paid service: pricing and contract are outside this design.
3. Does the Ortis app replace the Röbel app eventually, or do both stay?
