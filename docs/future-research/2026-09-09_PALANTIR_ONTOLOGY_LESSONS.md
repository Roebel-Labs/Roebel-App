# Palantir Foundry's Ontology, read against the stack we actually run

**Date:** 2026-09-09
**Status:** Research v2. Max's v1 report (Foundry primitives, civic track record, open substitutes) is the input; this version corrects it where it collides with what already exists, maps every Foundry primitive to the live Röbel / Netizen code, names the real gap, and turns the staged plan into one that fits the roadmap and the standing rules.
**Read with:** [`COORDINATION_PROTOCOL_THESIS.md`](COORDINATION_PROTOCOL_THESIS.md) (six-layer stack), [`../superpowers/specs/2026-07-31-nsp12-public-decision-record-design.md`](../superpowers/specs/2026-07-31-nsp12-public-decision-record-design.md) (the record grammar), [`../superpowers/specs/2026-07-26-netizen-node-manifest.md`](../superpowers/specs/2026-07-26-netizen-node-manifest.md) (NSP-0), `netizen_labs/docs/STRATEGY.md` §8 (D0 to D4), and the mission-site spec `netizen_labs/docs/superpowers/specs/2026-09-06-netizen-labs-mission-site-design.md` (the four-stage loop).

---

## 0. The one-paragraph verdict

Foundry's transferable idea is not the ontology. It is the **Action**: every change to shared state is a typed, permissioned, validated, audited transition, and AI is confined to reading and proposing because it holds no key that can apply one. We already have that idea in two places, half built: the decision record (NSP-12) has the audit grammar and the agent mandate, and the chain has the hardest version of it (MACI ballots, the 3-of-5 tally, the Timelock). What we do not have is (a) the generic **action-type standard** that makes every transition in the loop look the same, and (b) the objects for the **Execution and Result stages**, which is exactly where the mission-site research found the whole field stops. So the plan is: write **NSP-13** (not NSP-0, which is taken), route the loop's writes through one handler, add Task, Bounty, Evidence, Signoff, Payout as record kinds plus one small escrow contract, and give Mecky the three tiers through surfaces that already exist. Nothing else from Palantir should cross over.

---

## 1. Corrections to v1

The v1 report is sound on Foundry itself and on the civic track record. Six things change once it meets the repos.

1. **"Publish NSP-0 / Ortis manifest" collides.** NSP-0 is the **Netizen Node Manifest** (v2, approved 2026-07-26, `@netizen-labs/protocol`). NSP-1 through NSP-12 are all assigned; NSP-10 is the indexer, NSP-11 operations, NSP-12 the Public Decision Record. The action-type standard is **NSP-13**, and it is a *surface of* the manifest (the manifest declares which action types a node runs, the way it declares services and agent roles), not a competitor to it.
2. **"Model the graph in Postgres/Supabase" inverts the truth order we already committed to.** Supabase is the fast read model with a documented exit plan (`2026-07-27_DATA_SOVEREIGNTY_SUPABASE_EXIT.md`). The layers of record are the signed Nostr event stream (fork-with-fallback: the explorer must resolve a proposal without Supabase) and the chain for anything that moves money or counts votes. The read model is rebuildable; it is never the source. v1's event-sourcing benchmark ("reconstruct any object from the event stream") is right, and it is already NSP-12's success condition.
3. **"Propose-then-human-confirm" is not new to us; it is NSP-12 §2 and §4.** Editor-agents may move `idee` to `entwurf` and park stale drafts, never score or reject on merit. Impact-agents write plain-language summaries under their own labeled key. Champions, implementers, facilitators are human or human-operated org keys. That is Foundry's "LLMs can only ask to use tools," specified before we read Foundry. What v1 adds is the *generalization*: the same rule for every transition in the loop, including the money-moving ones, expressed in one schema.
4. **Foundry's audit trail is immutable to end users, not to the operator.** The NHS admitted Palantir engineers reach identifiable data through an admin role. Our equivalent is stronger by construction: transitions are signed events under human-held keys, mirrored across nodes (NSP-9), and money moves only through contracts. Say this plainly in positioning: "immutable" for us means cryptographic, not policy.
5. **Ontology MCP is generally available** since the week of 16 June 2026, with one MCP tool per action type and SQL read tools per object type ([Palantir docs](https://www.palantir.com/docs/foundry/ontology-mcp/overview), [June 2026 announcements](https://www.palantir.com/docs/foundry/announcements/2026-06)). Our public Röbel MCP (`/api/roebel/mcp`) is the read half of that already. The write half (one tool per action type, confirmation mandatory) is a Stage 2 deliverable below.
6. **The NHS story is still open, and the numbers are contested, not disproven.** The Commons committee report (June 2026) urged exercising the February 2027 break clause; the government said it would decide "later this year," while its own evaluation runs to 2029 ([The Register](https://www.theregister.com/public-sector/2026/06/15/palantirs-nhs-data-deal-called-in-for-a-second-opinion/5254908), [Digital Health](https://www.digitalhealth.net/2026/03/government-considers-use-of-break-clause-in-palantir-nhs-contract/)). Foxglove's FOI work stands: about 30 percent of trusts on Inpatient CCS did fewer operations, and NHS England added the caveat that it cannot attribute the gains to the platform ([Foxglove](https://www.foxglove.org.uk/2026/06/16/nhs-trusts-palantir-fdp-tools-fewer-operations/), [Computer Weekly](https://www.computerweekly.com/news/366644346/NHS-trusts-operating-on-fewer-patients-with-Palantir-FDP-warns-Foxglove), [stats regulator](https://www.theregister.com/public-sector/2026/07/23/stats-watchdog-prescribes-stronger-caveats-for-nhs-palantir-claims/5276900)). Treat it as "benefit unproven and adoption thin," not "failed."

The constitutional court judgment is as v1 states: 16 February 2023, 1 BvR 1547/19 and 1 BvR 2634/20, both provisions violate informational self-determination for lack of a sufficient intervention threshold, Hesse given until 30 September 2023 ([BVerfG press summary](https://www.bundesverfassungsgericht.de/SharedDocs/Entscheidungen/EN/2023/02/rs20230216_1bvr154719en.html)). The court's warning about "unnoticed manipulation or access by third parties" through private, foreign software is the sentence to quote whenever the Amt asks why the stack is open and self-hosted.

---

## 2. Foundry primitive by primitive, against what runs today

| Foundry | Netizen / Röbel today | Status | Where |
|---|---|---|---|
| Object types | Proposal head (kind 32100), meeting record (32103), Meinungsbild result (32104), impact summary (32105), decision cycle (32106); Citizen and Attester as NFTs; debates onchain (Deliberate on Gnosis) plus forum threads; Places, Events, Organizations as app tables | **Partial**: discussion and proposal objects exist; Task, Bounty, Evidence, Signoff, Payout do not | `packages/protocol/src/decisions.ts`, `packages/publisher`, CitizenNFTv2 / AttesterNFTv2, `debate_contents`, `forum_*` |
| Link types | `a` tags (`kind:pubkey:d`) as the only legal cross-reference; NIP-10 threading for deliberation; Governor proposal id on the head | **Live** for the record; app tables link by foreign key | NSP-12 §3 "reference rule" |
| Action types | Stage transitions (kind 2100, regular and immutable, `from`/`to`, signed by whoever §2 authorizes); onchain: `propose`, `castVote` (MACI), `queue`/`execute` (Timelock), attestation with v2 percentage bands, Safe transactions | **Partial**: the transitions are actions in all but name; no shared schema, no generic handler | NSP-12 §2, `MaciAttesterGovernor`, Timelock, Attester Safe |
| Submission criteria | Role per stage (author, editor-agent, facilitator, implementer); CitizenNFT gate on votes; attester quorum bands; Röbeltaler gate on debates; `app_settings` flags | **Live**, scattered across contracts, RLS, RPC checks, and edge functions | contracts, `is_verified_citizen` RPC gates, `app_settings` |
| Permissions | RLS, `account_owners`, org membership edge function, Safe signers, agent npubs labeled `bot: true` with Art. 50 labels | **Live**, with the known gap that the RLS lockdown is in HEAD but not applied (EAS adoption gate) | `org-membership`, `nostr_identities`, RLS migrations |
| Side effects | Nostr publication (`nostr_publications`), push via `send-notification`, Timelock execution, Circles mint and transfer, Monerium rails (gated) | **Live** per feature, not declared per action | edge functions, `packages/publisher` |
| Audit log / decision lineage | kind-2100 transition trail; `coordinator_audit_log`, `consent_audit_log`, `points_card_audit`, `workspace_actions` (actor_kind human/agent, acting_for, kind, scope) | **Partial**: four separate logs with four shapes; only the Nostr trail is signed and mirrorable | migrations, NSP-9 mirror relay |
| Functions on Objects | MACI tally pipeline (Shamir 3-of-5 to genProofs to onchain), threshold getters, Circles trust and invite logic, x402 metering | **Live** as code, not as declared, versioned functions | `contracts/`, `scripts/`, `packages/*` |
| Interfaces | Implicit: anything with a CitizenNFT is `Verifiable`; anything published is `Auditable` | **Missing** as a construct; harmless to defer | |
| Object sets | Supabase views and explorer filters | **Live** enough | |
| Ontology branching / proposals | Manifest is signed as a whole and forkable; specs go through docs and review | **Different mechanism**, adequate | NSP-0 |
| AI tool surface | Mecky: Claude chat, story and RSS generation on cron, outreach log, story drafts; public Röbel MCP for reads; editor-agent and impact-agent roles specified, agent-watcher package exists | **Partial**: read and content-authoring work today; no governed write surface for the loop | `apps/web/src/app/api/chat/mecky`, `/api/roebel/mcp`, NSP-12 §4, `packages/agent-watcher` |
| Human-in-the-loop as hard boundary | The coordinator private key exists only during a 3-of-5 tally, in RAM, for minutes; the Timelock is the only executor; agents hold labeled npubs and no NFTs | **Live**, and it is the strongest instance of the pattern anywhere in the two repos | `docs/MACI_SHAMIR_OPERATIONS.md` |

Two readings of the table.

- **The Discussion and Proposal stages are further along than v1 assumes**, and their human-in-the-loop boundary is enforced in keys and contracts already, which is the single thing v1 says not to leave to configuration. We should say so on the Labs site; it is a proof point no competitor has.
- **The Execution and Result stages are where every row says "missing."** There is no object for a task derived from a passed proposal, no bounty tied to it, no evidence, no sign-off, no staged payout, and no record event that closes the loop back to the proposal head. `rewards_tasks` is a points quest system, `muenzen_tips` is person-to-person, x402 meters data access. That gap is not a coincidence: the Carnegie and Supercooperation research says the whole field stops at discussion. Closing it is the product.

---

## 3. What to build: NSP-13, the action-type standard

**Name and place.** NSP-13 "Governed Actions." A zod schema in `@netizen-labs/protocol` beside the manifest and `DECISION_KINDS`; the manifest gains an `actions` surface listing the action types a node runs and which roles may apply each. The indexer (NSP-10) validates action records against it; federation (NSP-9) mirrors them; the agent-watcher reads it to know what an agent may propose.

**Shape of one action type** (this is v1's JSON Schema idea, made concrete for our layers):

```jsonc
{
  "name": "task.signoff.approve",          // dotted: object.verb
  "version": 1,
  "object": 32108,                          // the head kind this acts on (Task)
  "params": { "taskId": "a-ref", "evidenceId": "a-ref", "note": "string?" },
  "from": ["evidence_submitted"],           // state machine, closed world
  "to": "signed_off",
  "criteria": [                             // submission criteria, all must hold
    { "role": "attester", "min": 2, "distinct": true },
    { "object": "evidence", "exists": true }
  ],
  "apply": ["human"],                       // who may sign: human | org | agent
  "record": { "kind": 2101, "tags": ["action", "a", "from", "to", "prior"] },
  "effects": {
    "onchain": { "iface": "IStagedEscrow", "fn": "releaseStage(bytes32,uint8)" },
    "notify": ["author", "champion"]
  }
}
```

**Binding to the record.** One new regular, immutable kind, **2101 "action applied,"** the sibling of the 2100 stage transition: `action` tag (name and version), `a` tag to the object head, `from`/`to`, `prior` (hash of the head as it stood), params hash, signed by the applier. Stage transitions stay kind 2100 and become the special case of an action whose only effect is the `stage` tag. Everything else in the loop gets its own action type and emits 2101. That gives Foundry's action log and decision lineage as signed, mirrorable events, and it gives the event-sourcing benchmark for free: replay 2100 and 2101 and you have the object.

**Binding to the chain.** Actions that move value or count votes name a Solidity interface and function in `effects.onchain`. Existing: `IGovernor.propose`, MACI `publishMessage`, `TimelockController.execute`. New: **`IStagedEscrow`** for bounties (fund, claim, submitEvidence pointer, releaseStage, refund), funded from the Gemeinschaftskasse Safe by a Timelock-executed proposal, released on 2-of-N attester sign-off. Small, auditable, one contract.

**New object kinds** (addressable, `d`-tagged, registered in `DECISION_KINDS` next to 32100 to 32106; numbers proposed, not final): 32107 Task, 32108 Bounty, 32109 Evidence (content-addressed pointer to files, the IPLD idea from v1), 32110 Signoff, 32111 Payout. Each links to its proposal head by `a` tag. A Result page is then a query over the head and everything that references it; no new "result" object is needed.

**Actions for the loop, first cut** (thirteen, matching v1's list, renamed to our stages): `debate.open`, `argument.post`, `proposal.promote` (idee to entwurf, editor-agent), `proposal.ready` (author), `meinungsbild.open` (facilitator), `meinungsbild.close` (result pointer, 32104), `proposal.commit` (implementer, beschlussvorlage), `task.create`, `bounty.fund`, `task.claim`, `evidence.submit`, `task.signoff.approve`, `payout.release`, plus `evidence.reject`. Every one has a human or org applier; four of them (`proposal.promote`, `proposal.park`, impact summaries, reminders) are the agent whitelist, and they are exactly the ones NSP-12 already assigns to agents.

**Scope discipline.** NSP-13 governs the coordination loop's objects only. The Röbel app has 120-odd tables (events, restaurants, wildlife, transit, lootboxes, cards). Routing all of that through actions would be Foundry's "digital twin of the town" mistake by another road. The rule is: if it appears on a proposal's Result page or moves community money, it is an action; otherwise it is an app table.

---

## 4. Mecky and the agents: three tiers on surfaces we have

| Tier | Rule | Surface today | Change |
|---|---|---|---|
| 1. Read everywhere | Query any object, summarize, find precedent, draft | Public Röbel MCP reads; Mecky chat; cron generation | Expose the loop objects through the MCP as read tools (the Ontology MCP shape) |
| 2. Propose, human confirms | Emit a validated, unsigned NSP-13 action payload; a permitted human signs it (Nostr key via the identity bridge, or the smart account) | Not built | One MCP tool per action type, `apply: human` enforced by the handler, never by the model; the app shows "Mecky proposes: …" with a confirm that signs |
| 3. Narrow whitelist | Mechanical, reversible, non-financial: completeness check, dedup, park after six months, impact summaries, reminders | NSP-12 editor-agent and impact-agent mandates; agent-watcher pinned roles; Art. 50 labels; `bot: true` | Declare the whitelist in the manifest `actions` surface with `apply: agent`; anything else the handler rejects for an agent key |

**The hard boundary, in keys.** Agents hold labeled npubs and paymaster-sponsored smart accounts with scoped budgets (Netizen Accounts, live on Gnosis since 2026-08-15). They hold no CitizenNFT, no AttesterNFT, no Safe signer slot, no coordinator share. So they cannot cast a vote, approve a sign-off, or release a payout even if the handler had a bug, because the contracts do not know them as members of those classes. This is Autar's D1 ("scoped budgets Onchain") and the "AI membership, not AI plutocracy" line from the strategy, made checkable: list the agent keys, show they hold none of the four credentials.

---

## 5. The staged plan, re-cut to the roadmap

v1's stages survive; the gates now point at things that already exist or already block.

**Stage 0. NSP-13 spec (two weeks).** Zod schema, the thirteen action types, kinds 2101 and 32107 to 32111, the manifest `actions` surface, and a one-page "how an action record is verified" for the explorer. *Gate:* each action has a closed-world state machine and at least one criterion; the Röbel manifest example validates.

**Stage 1. One write path for the loop.** A single Supabase edge function `apply-action` that validates against NSP-13, checks criteria (roles from NFTs and org membership, state from the read model), writes the read model, publishes the 2101 record, and enqueues chain effects. The four existing audit tables stay as-is for their domains; new loop writes go only through this. *Gate:* the event-sourcing test passes for a proposal end to end. *Prerequisite that already blocks:* apply the RLS lockdown that sits in HEAD (gate: EAS adoption). Without it, "no direct table writes" is a policy, not a fact.

**Stage 2. Mecky proposes.** The MCP gains one tool per action type; the handler refuses agent signatures on anything not whitelisted. *Gate:* an attempted `payout.release` from Mecky's key is rejected and the rejection is itself recorded.

**Stage 3. Execution and Result.** `IStagedEscrow` on Gnosis, funded by a Timelock-executed proposal from the Gemeinschaftskasse, evidence as content-addressed pointers, 2-of-N attester sign-off, staged release, refund path. The first real Röbel bounty from a passed proposal pays out in stages. *Gate:* the Result page renders from the record alone.

**Stage 4. Whitelist, validation, second town.** Turn on the agent whitelist; add schema validation on the read model (JSON Schema now; SHACL only if a second town needs RDF export); package the actions in the manifest so `netizen deploy` instantiates them. Triggers for heavier infrastructure, unchanged from v1: a second town adopts (RDF/OWL export), workflow reliability problems (durable execution), complex AI read access (a semantic layer).

**Standing rules that bind every stage.** Everything ships through the manifest and `netizen render`/`up` (no side services). Copy in the app stays advisory ("Meinungsbild," never a binding vote). Agent output carries Art. 50 labels. Raw addresses never appear in UI. Data minimization by default, per the court.

---

## 6. What this means for vision, strategy, and brand

**Vision.** Palantir proved that a decision-centric operational layer, not a data lake, is what organizations will pay for, and it proved it at a scale that makes the category undeniable. Our thesis was already "every organization runs on four contracts; we made them a protocol." Foundry's Ontology is the vocabulary that makes the thesis legible to people who run institutions: semantic layer (who and what), kinetic layer (what may change, by whom, leaving what trace). Adopt the vocabulary, publicly, and then say the one thing they cannot: ours is open, signed, forkable, and the human boundary is in the keys.

**Strategy.** Three consequences.
1. *The Execution stage is the wedge.* Everyone has deliberation tools; nobody closes the loop from vote to verifiable result. NSP-13 plus the escrow is the first thing a town can point at and say "this got built because of that vote, here is the trail." That is the Ortis demo and the Röbel proof for 2027.
2. *The FDE model is the anti-pattern to price against.* Palantir's revenue scales with embedded engineers; ours must scale with manifests. Every hour spent on a town-specific integration that does not end up as a manifest field or an action type is Palantir economics without Palantir margins. This sharpens STRATEGY §13's "sell operated outcomes": the outcome is operated by the node, not by a person on site.
3. *The 2027 NHS break clause and the German police cases are demand signals, not just cautionary tales.* Public bodies in the UK and Germany are actively looking for sovereign, inspectable alternatives to closed operational platforms. The Ortis Sign pilot and the pre-seeding doctrine should carry that framing in conversations with the Amt, without ever naming the vendor (see brand).

**Brand, by surface.**
- *Labs site and thesis (English, builder and funder audience):* name Foundry, credit the Action idea, state the difference in one line: "Palantir's best idea, in the open, for the people it is used on." Add a writing piece in the "What towns can learn from Ethereum governance" series (outline in §8). The word "ontology" is fine here.
- *Ortis and Amt surface (German, buyer audience):* never mention Palantir. In Germany the name means hessenDATA and a constitutional court defeat; invoking it in a Verwaltung conversation invites the wrong comparison and the wrong lawyers. Use "Vorgangsakte," "Entscheidungsprotokoll," "nachvollziehbar," "Meinungsbild." The standing rule against "Blockchain-Verwaltungsprojekt" applies with the same force to "Palantir für Kommunen."
- *Fundraising narrative:* "the open decision layer for communities" is a category with a public comparable. Use the comparable for category size and for the lock-in critique; never for feature parity.

**What must not cross over**, restated as tests rather than warnings: no object type exists that is not on a proposal's Result page or a money path (no twin of the town); no service runs outside the manifest (no operational dependency); no agent key holds a member credential (no config-toggle autonomy); no record of a person exists that a proposal did not need (the court's purpose limitation).

---

## 7. Open substitutes, decided rather than surveyed

v1's survey is good; here is the decision it implies for us.

| Layer | Decision | Why |
|---|---|---|
| Semantic model | Nostr heads with `a`-tag links, zod schemas in `@netizen-labs/protocol`; no graph database, no RDF now | Fourteen objects do not need a graph engine; the protocol package already is the schema registry; RDF export is a Stage 4 trigger |
| Action governance | NSP-13 plus one edge function, Postgres state in the read model | Event sourcing without a workflow engine; durable execution only if reliability forces it |
| Immutable log | kind 2100 and 2101 on the node relay, mirrored (NSP-9), and a periodic Merkle root of the loop's records anchored through the CommunityRegistry | The relay died on 2026-09-03 and the Mac export was the only copy; mirrors plus an onchain root make "immutable" true even if every relay goes |
| Money and votes | MACI, Timelock, Gemeinschaftskasse Safe, Circles, one new `IStagedEscrow` | All live but the escrow |
| Civic UX | Decidim's spaces-and-components model as the reference for the explorer's Vorhaben pages | Design source, not a dependency |
| Evidence | Content-addressed pointers (hash in the 32109 event, bytes in storage or IPFS) | Verifiable without trusting storage |

---

## 8. Companion post, outline (for `/writing`, Max reviews every line)

*Working title:* "Palantir's best idea, in the open."
1. What Foundry actually is: a data layer plus an action layer, and why the second matters.
2. The Action: typed, permissioned, validated, audited. AI can only ask.
3. Where it went wrong in public: hessenDATA and the court; the NHS numbers.
4. What a town needs instead: the same discipline, in keys not config, in the open.
5. What Röbel already runs: the record, the ballot box that needs three neighbors, the timelock.
6. The gap everyone shares: from vote to result. NSP-13 and the escrow.
7. The test: list the agent keys; show they own nothing.

---

## 9. Sources checked for v2

- Palantir docs: [Ontology MCP overview](https://www.palantir.com/docs/foundry/ontology-mcp/overview), [MCP tools and agent configuration](https://www.palantir.com/docs/foundry/ontology-mcp/mcp-tools-and-agent-configuration), [June 2026 announcements](https://www.palantir.com/docs/foundry/announcements/2026-06), [Ontology overview](https://www.palantir.com/docs/foundry/ontology/overview).
- BVerfG, judgment of 16 February 2023, 1 BvR 1547/19 and 1 BvR 2634/20: [English summary](https://www.bundesverfassungsgericht.de/SharedDocs/Entscheidungen/EN/2023/02/rs20230216_1bvr154719en.html), [Leitsätze](https://www.bundesverfassungsgericht.de/SharedDocs/Downloads/DE/2023/02/rs20230216_1bvr154719.pdf?__blob=publicationFile&v=2).
- NHS FDP, 2026: [Foxglove FOI](https://www.foxglove.org.uk/2026/06/16/nhs-trusts-palantir-fdp-tools-fewer-operations/), [Computer Weekly](https://www.computerweekly.com/news/366644346/NHS-trusts-operating-on-fewer-patients-with-Palantir-FDP-warns-Foxglove), [The Register on the review](https://www.theregister.com/public-sector/2026/06/15/palantirs-nhs-data-deal-called-in-for-a-second-opinion/5254908), [The Register on the statistics regulator](https://www.theregister.com/public-sector/2026/07/23/stats-watchdog-prescribes-stronger-caveats-for-nhs-palantir-claims/5276900), [Digital Health on the break clause](https://www.digitalhealth.net/2026/03/government-considers-use-of-break-clause-in-palantir-nhs-contract/).
- Internal: NSP-0 manifest spec, NSP-12 decision record spec, `packages/protocol/src/decisions.ts`, Supabase migrations (`workspace_actions`, audit tables, `rewards_tasks`, `muenzen_tips`), `docs/MACI_SHAMIR_OPERATIONS.md`, STRATEGY.md §8 and §13, the coordination protocol thesis, the 2026-09-06 mission-site spec.
