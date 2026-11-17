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

**Goals:** a town grows from its first citizens to a full community without Ortis staff in the loop; each town owns its on-chain layer; credentials and
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

### 5.2 Growing a town from its citizens (replaces the staffed setup, Max 2026-11-17)

Ortis starts with individual citizens, not with town halls, so a town cannot be set up by staff or by one person.
It grows in stages, guided by an AI agent, with humans signing every step and Ortis staff only handling exceptions.

| Stage | Trigger | What exists | What people get |
|---|---|---|---|
| 0 Ort | someone signs up and picks a town (postcode/location) | nothing per town; the shared hosted node | guest card, feed, mini apps, Ortis agents; "In deinem Ort sind schon N Leute" |
| 1 Initiative | ≥ 3 founders from the town meet and vouch for each other | identity contracts deployed (Citizen/Attester, credential register), founders = provisional attesters, label "im Aufbau" | founders can verify neighbours, Vereine can join |
| 2 Gemeinschaft | e.g. ≥ 25 verified residents, ≥ 5 attesters, ≥ 2 orgs | governance (Governor/Timelock/MACI), Münzen group + pool | votes, Münzen rewards, full features |
| 3 Anerkannt | the town administration or council joins | recognised offices (Stadtvertreter etc.) | official roles on the register |

- **Lazy deployment:** contracts are deployed only when a stage needs them, gas paid from an Ortis budget, so
  thousands of stage-0 towns cost nothing.
- **Bootstrapping trust without attesters:** founders confirm each other by meeting in person (phone-to-phone QR
  scan) and are additionally vouched for by a **Paten-Gemeinde**: attesters of an established nearby town (Röbel
  first) confirm the founders once. Provisional attesters have limited power until stage 2 (no revocations, caps on
  verifications per day), which limits damage from a faked start.
- **The founding agent ("Gründungs-Assistent"):** a Mecky-style agent in the app and in Ortis Studio that explains
  the stages, invites neighbours, suggests local Vereine and places from public data, drafts the founding text,
  prepares every deployment and threshold change for the founders to sign, watches the stage thresholds, writes the
  public hand-over record and answers first-level support. It never holds keys and cannot sign; humans approve each
  step on their phones.
- **Backend scaling:** all stage-0 to stage-2 towns share one hosted multi-tenant node; a town gets its own node only
  when it asks for it (sovereign mode) or outgrows the shared one.
- **Honest wording:** below stage 3 the citizen card means "verified resident confirmed by neighbours", not an
  official municipal status; the app says so.
- **Ortis staff:** review flagged starts (suspicious founder patterns), handle abuse, never approve citizens.

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
