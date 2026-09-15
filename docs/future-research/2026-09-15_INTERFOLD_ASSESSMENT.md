# The Interfold (ex-Enclave) — integration assessment for Röbel / Netizen

**2026-09-15.** Deep research into https://www.theinterfold.com/ (Gnosis Guild's Encrypted
Execution Environment network, formerly *Enclave*) against three questions from Max:
(1) how could we use it, (2) can it run in the Expo app, (3) can someone build a
Kickstarter-style fundraiser with voting on it. Method: one research pass over
theinterfold.com, docs.theinterfold.com, blog.theinterfold.com, the `theinterfold/interfold`
and `theinterfold/crisp-aragon-plugin` repos (README, deployment manifests, SDK sources,
open issues), the npm registry, plus the Hermes, Expo, Chainlink, RISC Zero and Mopro
sources needed for the Expo answer; cross-read against the live MACI/Shamir stack
(`docs/MACI_E_GOVERNANCE.md`, `apps/expo/lib/maci.ts`). Claims carry a source; anything
marked *(inference)* or *(estimate)* is our reading, not an Interfold statement.

Companions: [MACI v3 decision](2026-07-31_MACI_V3_MIGRATION_DECISION.md),
[Conduit / coordinator-as-a-service](2026-07-31_CONDUIT_RAAS_STRATEGY.md),
[Logos assessment](2026-09-14_LOGOS_STACK_ASSESSMENT.md) (same reach rule),
[MACI e-governance architecture](../MACI_E_GOVERNANCE.md),
[Shamir operations](../MACI_SHAMIR_OPERATIONS.md), [ZK/sybil assessment](../SEMAPHORE_README.md).

---

## 0. Decision summary (BLUF)

The Interfold is the first production network that does what our Shamir 3-of-5 federation
only approximates: **a private vote (or any sum over secret inputs) tallied with nobody able
to decrypt an individual input, verified by proofs, with no coordinator at all.** It is on
Ethereum mainnet since August 2026 ("Network Alpha"), the SDK is TypeScript, the reference
app (CRISP) is exactly a secret-ballot voting system, and Vitalik publicly endorsed it. It
is also **browser-only, Ethereum-L1-only, hours-per-round, USDS-fee-per-round, and its
production ballot proof is currently heavier than what its own team considers
browser-provable.**

| Question | Verdict | Why / what to do |
|---|---|---|
| **How can we use it?** | **Not in the product path in 2026.** Keep it as the *named successor* of the Shamir coordinator in the MACI decision doc, with triggers (§7). | Everything it offers for us is a private tally without a coordinator. Our citizens vote from the Expo app, gasless, on Gnosis; Interfold wants a desktop browser, an L1 wallet with ETH, and Ethereum mainnet. The census (CitizenNFTv2) is ours either way. Nothing else in the stack (DMs, Münzen, feed, identity) touches it. |
| **Can it run in the Expo app?** | **No, not today; not soon.** The SDK is browser+Node (`@aztec/bb.js` + `noir_js` + WASM + Web Workers). A CRISP ballot proves **four UltraHonk circuits in the browser**, two of which are ~4M constraints each, "about twice the maximum target size for browser proving" (open issues #1736, #1827). Phones are further away than desktops. Delegating the proof to a server leaks the vote. | Read-only paths (E3 state, results) would work from React Native via viem *(inference)*. Encryption alone could run under Hermes' new WebAssembly (Feb 2026, interpreter, unproven in Expo 56). Proving needs either the chunked circuits Interfold is building plus a native UltraHonk module (Mopro/noir-rs path, ARM64), or a hosted page in our existing mini-app WebView **after** the circuits shrink. Re-check when #1736 closes. |
| **Can someone build a Kickstarter (+ voting) on it?** | **Yes, as a web dApp on Ethereum mainnet, and nobody has yet.** Interfold contributes exactly one thing: a verified public result over secret inputs. Escrow, money, identity, refunds, rewards and UX are the builder's. | Three honest designs (§6): sealed pledges with a public total; private participatory-budget / milestone votes (CRISP with a vector program); sealed reward auctions. Cost per round ≈ 16–330 USDS *(estimate)* plus one L1 transaction per participant; rounds take ≥ 12 h. Hidden pledge *amounts with real money* need a shielded pool (Interfold × Railgun is a livestream, not a product). |

**Reach rule (2026-09-14, Max) applies unchanged:** the Expo app is the only client citizens
use. A browser-only ballot has zero civic reach in Röbel. Interfold's own DAO votes from
laptops; a town does not.

**Net:** integrate nothing now. Record Interfold as the named alternative to the Shamir
federation in the MACI decision doc's trigger list, and re-check on three concrete signals
(§7): browser-sized ballot circuits, an L2 or paymaster path for voters, and routine
production E3s with a public operator set.

---

## 1. What The Interfold is in September 2026

- **Organisation and history.** Built by Gnosis Guild (Auryn Macmillan). Rebranded from
  *Enclave* in March 2026 ("the name Enclave suggested containment … what was built is
  coordination infrastructure"). Interfold DAO on Aragon OSx, Foundation board, FOLD token.
  Sources: https://blog.theinterfold.com/from-enclave-to-the-interfold/,
  https://docs.theinterfold.com/introduction ("previously known as Enclave"),
  https://docs.theinterfold.com/governance.
- **What it is.** "An open-source protocol that coordinates Encrypted Execution Environments
  (E3s) through a distributed network of ciphernodes." Cryptography: threshold BFV
  (Brakerski–Fan–Vercauteren) FHE from Gnosis Guild's `fhe.rs`, publicly verifiable DKG
  ("PV-TBFV", Noir circuits C0–C7 verified with Honk, two recursive proofs on-chain),
  GRECO-style proofs that a ciphertext is a valid encryption, compute providers running the
  FHE program inside a zkVM (RISC Zero via Boundless; SP1 listed). Sources:
  https://docs.theinterfold.com/cryptography, https://docs.theinterfold.com/architecture-overview,
  https://docs.theinterfold.com/write-secure-program.
- **What it is not.** Not a privacy coin, not storage, not a compute marketplace, not TEEs.
  It does not hold funds, does not know who a person is, and does not run continuously: an
  E3 is "an ephemeral, bounded execution surface created for one specific computation".
  Sources: https://blog.theinterfold.com/how-interfold-works/,
  https://docs.theinterfold.com/what-is-e3.
- **Status: Network Alpha on Ethereum mainnet (August 2026).** Core contracts at
  `Interfold 0x28cF63B459e6218C69EA97ea7D90541cf648c715`, `CiphernodeRegistry 0xC927…`,
  `BondingRegistry 0x0ec9…`, fee token USDS `0xdC035D45d973E3EC169d2276DDab16f1e407384F`,
  Chainlink VRF coordinator `0xD7f8…`; Sepolia is the only other network in the manifest.
  Committees "up to 19 ciphernodes with a threshold of 9" (mainnet thresholds by size:
  2/3, 5/9, 10/19); DKG "currently taking on the order of hours"; public ciphernode
  registration "coming soon"; ">512K FOLD bonded", "≈4.53M FOLD delegated"; governance
  "not live yet"; the first production CRISP E3 "forthcoming" (September update). Sources:
  `packages/interfold-contracts/deployed_contracts.json` and
  `deploy/protocol/mainnet-protocol.deployment.json` (repo, main, 2026-09-15),
  https://blog.theinterfold.com/network-alpha-mainnet/,
  https://blog.theinterfold.com/network-alpha-network-forming/,
  https://blog.theinterfold.com/interfold-community-update-september-2026/.
- **Token.** FOLD, 1.2 B supply, ERC-20 on Ethereum `0xE172e9B6cfBeeB5593bDcE3f077356FDb33af904`;
  two Uniswap CCA auctions (July: 523.94 ETH, 216 bidders; August: 24 M FOLD sold);
  transferable since `tge()`; used for ciphernode bonding (32,000 FOLD minimum), incentives
  and governance (12K FOLD to propose, 2 % quorum, >50 %, five-day window). Requestors pay
  in **USDS, not FOLD**. Sources: https://docs.theinterfold.com/tokenomics,
  https://docs.theinterfold.com/ciphernode-operators/registration,
  https://docs.theinterfold.com/requestor-guide, https://blog.theinterfold.com/fold-auction-results/.
- **Signals of seriousness.** Two Zenith audit reports in the repo (2026-07-02 token,
  2026-07-14 protocol); Vitalik on 2026-05-28: "It's basically what I've been shouting for
  nearly a decade for someone to do", 16 ETH bid in the first auction; Aragon partnership
  (CRISP plugin for OSx, testnet since 2026-06-30); Taiko partnership (no deployment);
  Ethereum Foundation demo announced for 2026-10-14; Railgun sealed-bid exploration
  (livestream 2026-09-15). Repo: 82 stars, LGPL-3.0, pushed daily; `@interfold/sdk`
  0.2.0 (2026-06-10) → 0.14.0 (2026-08-29), 18 releases in 11 weeks. Sources:
  `packages/interfold-contracts/audits/`, https://thedefiant.io/news/people/vitalik-buterin-endorses-interfold-privacy-protocol-voting-auctions-m4ldfh,
  https://blog.theinterfold.com/verifiable-secret-ballots-with-interfold-and-aragon/,
  https://registry.npmjs.org/@interfold/sdk.
- **Noise to ignore.** Upbit/Bithumb listings, price coverage, "interfoldboard.app".
  None of it changes what a builder can do.

---

## 2. The E3 lifecycle, cost and timing (mainnet parameters)

**Lifecycle** (https://docs.theinterfold.com/computation-flow):

1. **Request.** `request(E3RequestParams)` with committee size, input window, E3 program,
   param set; fee locked (USDS); Chainlink VRF seeds sortition.
2. **Committee.** Sortition among bonded ciphernodes (32,000 FOLD bond + ≥1 ticket of
   1,000 sUSDS shares); DKG produces the committee's shared BFV public key.
3. **Input window.** Each participant encrypts to the committee key **and proves the
   ciphertext is well-formed**, publishes a commitment via `publishInput`; ciphertext
   bytes go to **Avail** DA, anchored back via VectorX, then `finalizeInput()`.
4. **Compute.** A compute provider runs the FHE program (homomorphic addition is what the
   docs show) inside RISC Zero and posts `publishCiphertextOutput` with a proof.
5. **Decrypt.** ≥ threshold ciphernodes publish decryption shares; `publishPlaintextOutput`;
   result readable via `getE3(e3Id)` / `PlaintextOutputPublished`. Failures → `markE3Failed`,
   pull-based refunds (`claimRequesterRefund`); the 5 USDS randomness fee is never refunded.

**Timing** (mainnet config `deploy/protocol/mainnet-protocol.config.json` + docs):
VRF timeout 1 h, sortition submission 10 min, DKG window 6 h (requestor guide: "usually
5–20 minutes"), **protocol-minimum input window 11 h 10 min**, compute window 7 d,
decryption window 6 h, max E3 duration 30 d. CRISP's README: "Twelve hours covers the
current production defaults with margin." A round is therefore **half a day minimum, more
often a day**, before a result exists.

**Fee formula** (`contracts/lib/InterfoldPricing.sol`; margin 10 %, treasury 1.82 % of the
service fee, 5 USDS flat randomness fee):

```
proofsPerNode = 14 + 4·(n−1)
base = 0.1·n + 0.1·n·proofsPerNode + 0.01·n(n−1)/2 + 0.005·n·proofsPerNode
     + 0.00001·n·duration + 0.3·h + 0.01·h(h−1)/2 + 1
fee  = base · 1.10 + 5            (USDS; n = committee size, h = threshold)
```

*(estimate)* Using the published parameters and a 12 h vs 7 d billable duration:

| Committee (n / h) | 12 h round | 7 d round |
|---|---|---|
| 3 / 2 (protocol minimum) | ≈ 16 USDS | ≈ 35 USDS |
| 9 / 5 | ≈ 61 USDS | ≈ 117 USDS |
| 19 / 10 (Interfold DAO's own setting) | ≈ 212 USDS | ≈ 329 USDS |

The `duration` term in the contract is a weighted "billable duration" that adds DKG,
compute and decryption utilisation, so live quotes run higher; `sdk.getE3Quote()` is the
truth. The dominant term is key-generation proofs (`0.1 · n · proofsPerNode`), i.e. the
committee's own PV-DKG work, not the number of voters. **Per-participant cost is separate:**
one Ethereum L1 transaction with a Honk proof verification per ballot, paid from the
voter's own wallet (CRISP README: "the voter submits that commitment from their wallet and
can then leave"). We could not find a published gas figure *(uncertainty, §9)*.

**Chains.** Ethereum mainnet + Sepolia only. Gnosis is not on Chainlink VRF v2.5's
network list nor on RISC Zero's verifier-router list, Avail/VectorX anchors to Ethereum,
and the operator set is bonded on L1; "Layer 2 networks" appear only as a future home for
*bridged FOLD*. A Gnosis deployment would need the DAO, Chainlink, RISC Zero and Avail to
all extend *(inference)*. Sources: https://docs.chain.link/vrf/v2-5/supported-networks,
https://dev.risczero.com/api/blockchain-integration/contracts/verifier,
https://blog.theinterfold.com/interfold-community-update-september-2026/.

---

## 3. CRISP — what the reference voting app actually does

CRISP ("Coercion-Resistant Impartial Selection Protocol") is the reference E3 program and
the engine of the Aragon plugin and the Interfold DAO's own ballots. What matters for us
is the client requirement, read from `examples/CRISP` on `main` (2026-09-15):

- **Ballot = four sequential UltraHonk proofs in the browser** (`packages/crisp-sdk/src/vote.ts`):
  `user_data_encryption_ct0`, `user_data_encryption_ct1` (the ciphertext is a valid BFV
  encryption), `crisp` / `crisp_onchain` (ballot validity + eligibility: Merkle path in
  "census" mode, on-chain balance in "onchain" mode, ECDSA signature binds the slot), and
  `fold` / `fold_onchain` (recursive aggregation so the EVM verifies one proof).
  `@crisp-e3/sdk` 0.21.0 depends on `@aztec/bb.js` 5.1.0, `@noir-lang/noir_js`
  1.0.0-beta.26, `comlink`, `web-worker`; BFV encryption + witness generation run in a
  Web Worker because on the main thread it "freezes the browser".
- **Production preset is heavy.** Presets `insecure-512` (dev, Sepolia) and `secure-8192`
  (mainnet, N=8192, L=3); "'secure-8192' artifacts are more than an order of magnitude
  larger than the insecure-512 ones" and are inlined as JSON today. Issue #1736
  "L-BFV + chunking" (2026-07-21, open): the user encryption circuits are "approximately
  4M constraints, about twice the maximum target size for browser proving"; #1827
  (2026-08-18, open, assigned) tracks reducing them. The client warns "Large secure
  ballots can exceed a browser's storage quota". The generic `@interfold/sdk` helper
  `encryptNumberAndGenProof()` ships circuits "compiled for `INSECURE_THRESHOLD_512`";
  for the secure preset you "compile your own circuits".
- **Server + voter split.** The Rust coordination server verifies the Noir proof, stores
  the ciphertext, signs an availability attestation, publishes to Avail and later
  `finalizeInput` without the voter; the voter's wallet sends the on-chain commitment tx.
  The server is an `inputAvailabilitySigner` immutable in `CRISPProgram.sol`, i.e. a
  liveness dependency, not a privacy one.
- **Receipt-freeness.** Re-votes overwrite the slot ciphertext homomorphically
  ("new slot ciphertext = addend + ballot ciphertext"), and anyone may submit zero-valued
  **mask votes** so slot activity reveals nothing. Nobody, including the server, sees a
  plaintext ballot; only the aggregate is threshold-decrypted. Interfold's framing of MACI:
  "it requires a trusted coordinator who processes encrypted messages and publishes
  results", Auryn: "I trust that I'm honest, but I was always a bit skeptical that anyone
  else should trust that I was honest." Source:
  https://blog.theinterfold.com/the-accountability-trap-vitalik-millie-and-auryn-on-receipt-free-voting/.
- **Census is not solved by Interfold.** Eligibility = token balances at a snapshot block,
  a Merkle tree the round creator supplies, or the open `SelfRegistry` whose own comment
  says "never where the outcome carries value". The whitepaper's stated limitation is a
  "Corrupt Registry". Our CitizenNFTv2 would be a *better* census than anything CRISP
  ships *(inference)*.
- **Mainnet CRISP is deployed** (`CRISPProgram 0x847A22303639017bcDB7F7E49EEa4a4629c1169f`,
  `HonkVerifier 0x0FA7…`, `OnchainHonkVerifier 0x02eA…`, `Risc0BfvCiphertextVerifier 0x40a1…`,
  late August 2026 per release v0.12.1), the Aragon plugin's `.env.example` records the
  DAO's production parameters ("432000 seconds (5 days)", "Small, 19 members"), and
  dao.theinterfold.com still labels itself Sepolia. The first production CRISP E3 is
  "forthcoming" as of the September update.

---

## 4. The Expo question

### 4.1 What a client must do, versus what React Native gives us

| Client step | What the Interfold/CRISP client uses | In our Expo app (RN 0.85.3, Expo 56, Hermes V1, new arch) |
|---|---|---|
| Read E3 state / results / events | viem public client | Works in principle; viem already runs inside thirdweb v5 in the app *(inference, untested)* |
| Request an E3, approve fee | viem wallet client, USDS on Ethereum L1 | Our accounts are Gnosis 4337 smart accounts with a Gnosis paymaster; an L1 counterpart exists only if we fund L1 gas |
| BFV encrypt + commitments + Greco witness | `@interfold/wasm` 1.9 MB wasm-bindgen module (`bfv_encrypt_*`, `compute_ct_commitment`, `bfv_verifiable_encrypt_*`), in a Web Worker | Hermes gained WebAssembly in Feb 2026 (runtime load or `hermesc --wasm` AOT, executed by the bytecode interpreter; "what comes next is optimization, broader feature coverage, and hardening for production use"). Not documented in Expo 55/56 release notes; we did not verify it in the shipped binary. No Web Workers in RN. **Plausible experiment, unproven.** |
| Prove ciphertext validity + eligibility (4 UltraHonk proofs) | `@aztec/bb.js` (multithreaded WASM, SharedArrayBuffer, GBs of memory), `noir_js` | **No.** No workers, no SharedArrayBuffer, interpreter-executed WASM, phone memory. Even desktop browsers are over the team's own target for the production circuits (§3). |
| Sign + send `publishInput` on L1 | wagmi/viem wallet | Our wallet stack signs on Gnosis (chainId 100; the 8453 trap in memory shows how any second chain re-introduces signing-chain bugs) |

`@interfold/react` peers on `react ^18.2` and `wagmi ^2.14.16`; the app is React 19.2 on
thirdweb, so the hooks package is out regardless. The only "react-native" string in the
whole Interfold repo is a dappnode `package-lock.json`. No issue, doc or post mentions
mobile.

### 4.2 The four ways it could ever reach the phone

1. **Wait for the circuits to shrink, then prove natively.** Mopro (PSE) generates UniFFI
   bindings for Rust provers and has Noir/UltraHonk via `noir-rs` on ARM64 with a React
   Native package; a JWT circuit proves in 2.6 s on an iPhone 16 Pro (2025-05). That is
   the right shape (native module, ARM64 only, no simulator), but today's CRISP encryption
   circuits are ~4M constraints each, which is multi-GB proving memory *(inference)*.
   Trigger: #1736/#1827 closed with per-circuit sizes in the low hundreds of thousands.
   Sources: https://zkmopro.org/blog/noir-integraion/, https://zkmopro.org/docs/sdk/react-native/.
2. **Hosted ballot page inside the existing mini-app WebView.** We already run mini-apps in
   a WebView host; a CRISP page with COOP/COEP headers gets workers and SharedArrayBuffer.
   Blocked by the same circuit size on phone browsers (iOS WKWebView memory ceilings)
   *(inference)*; cheap to test once (1) lands. This is the fastest path if it works.
3. **Encrypt on device, prove elsewhere.** Not an option: the Greco witness contains the
   plaintext and the encryption randomness, so whoever proves sees the vote. That recreates
   the coordinator trust model with far more machinery.
4. **A different E3 program without per-input proofs.** The protocol lets an `IE3Program`
   define its own input validation, but an unproven ciphertext can poison a homomorphic
   sum (any voter can brick the tally). The proofs exist for that reason; a mobile-first
   program would need a different validity scheme. Research, not engineering.

### 4.3 Verdict

Not in 2026, not because React Native lacks a wrapper, but because the client-side proof
Interfold requires is larger than phones (and today even browsers) can carry. Read paths
and possibly encryption are feasible; the mandatory proof is not. Re-check when #1736 closes.

---

## 5. Against the live stack: MACI + Shamir federation vs Interfold + CRISP

| | Röbel today (MACI v2.5 on Gnosis) | Interfold + CRISP (Ethereum L1) |
|---|---|---|
| Who can decrypt a single ballot | The coordinator key, which since 2026-06-10 exists only when ≥3 of 5 Attesters reconstruct it in RAM for ~10 min | Nobody; only the aggregate, by ≥ threshold of a sortition committee of bonded strangers |
| Coercion resistance | Key-change / re-vote trick; holds against anyone except the coordinator | Mask votes + homomorphic re-votes; holds against everyone including operators |
| Who proves | Coordinator (Groth16, off-chain, per poll) | **Voter's browser** (4 UltraHonk proofs) + compute provider (RISC Zero) + committee (PV-DKG) |
| Voter cost | Gasless (4337 paymaster on Gnosis) | One L1 tx with proof verification, own ETH |
| Per-vote infrastructure cost | Fly machine + cron; ~0 marginal | 16–330 USDS per round *(estimate)* |
| Time to result | Minutes after poll end (once the 3 shares are in) | ≥ 12 h round, DKG hours, result within the 6 h decryption window |
| Census | CitizenNFTv2 (soulbound, attester-issued), gatekeeper on sign-up | Token snapshot / supplied Merkle tree / open registry; our NFT holders could be the Merkle census cross-chain *(inference)* |
| Liveness dependency | Coordinator machine + 3 Attesters | Committee threshold + a coordination server (availability signer) + Avail + Boundless |
| Client | Expo (pure-JS `maci-crypto` + quick-crypto) | Desktop browser |
| Maintenance | Nobody maintains MACI v2.5 or v3 (PSE disbanded 2026-06) | Active team, daily commits, audited, token-funded |

**What Interfold would replace:** the coordinator role entirely (`apps/coordinator`, the
Shamir ceremony, Fly, the reconstructor, the MACI Process/Tally circuits). **What it would
not replace:** CitizenNFTv2 + Attesters (census), the Governor/Timelock (execution), the
Expo voting UI, the proposal pipeline on Supabase/Irys. **What it would add:** an L1
dependency for every voter, a USDS budget per vote, a half-day-minimum round, and a
browser-only ballot.

For the MACI decision doc this is the missing "successor" row: the reason we stay on v2.5
is that migration cost is a rebuild and no maintained target exists. Interfold is a
maintained target with a strictly better trust model, and the same rebuild cost, and the
reach problem. The right move is to **name it as the trigger-based successor** rather than
to re-open the decision. For Netizen it is also the neutral "coordinator-as-a-service" the
Conduit doc imagined, run by someone else: a future community could rent a committee per
vote instead of holding a Shamir ceremony, if its members vote from laptops.

---

## 6. A Kickstarter on Interfold

**What Interfold contributes to a fundraiser: one verified public number (or vector)
computed over inputs nobody sees.** It does not hold money, does not do escrow or refunds,
does not know who a backer is, does not do rewards. A "Kickstarter on Interfold" is a
normal assurance-contract escrow on Ethereum plus an E3 wherever secrecy is worth a round
fee and a day of latency. Interfold's own use-case page lists governance, auctions, agent
coordination and compliance scoring; crowdfunding appears nowhere, so this would be new.

### 6.1 Three designs that are honest about what is private

1. **Sealed pledges, public total ("commit now, pay if it works").** Backers encrypt a
   pledge amount (`encryptNumber`), the E3 sums, the plaintext output is the total and
   the contract compares it to the goal. Individual amounts are never decrypted, by
   anyone, ever; the total is verifiable. Money is *not* in the E3: backers either
   (a) pay after success, with a fixed refundable deposit as a bond against
   non-payment, or (b) pre-fund a shielded pool. With plain on-chain escrow the amounts
   are public anyway and the E3 adds nothing. Interfold × Railgun (sealed-bid auctions
   with private settlement) is the path to (b); it is a livestream on 2026-09-15, not a
   product. Fits: donor-privacy cultures, matching campaigns where early totals bias
   behaviour.
2. **Private participatory budgeting / milestone release (the "voting" part).** Backers or
   citizens each submit an encrypted allocation vector over N projects
   (`encryptVector`; CRISP already does the yes/no case with a Merkle census); the
   program sums vectors; the output is per-project totals; the escrow pays winners, or
   releases tranche 2 only if the milestone vote passes. Linear tallies (points,
   one-person-one-vote, capped budgets) are exactly what BFV addition inside RISC Zero
   does today; **quadratic funding is not** (square roots are non-linear; would need a
   different FHE program and is out of scope of the documented ops). This is the
   strongest fit and the closest to what Röbel already calls a Bürgerhaushalt in the
   Circles feature vision (§4.9 there).
3. **Sealed reward auctions.** Limited reward tiers priced by sealed bids, clearing price
   published, settlement public. This is Interfold's headline auction case and Uniswap CCA
   territory; useful for a fundraiser only as a garnish.

### 6.2 What a builder has to ship (from the project template and CRISP)

`contracts/` (an `IE3Program` in Solidity with input validation + result decoding, plus
the escrow), `program/` (RISC Zero guest in Rust using `fhe-rs`: sum / vector sum),
Noir circuits for input validity and eligibility (reuse CRISP's or compile the secure
preset), a coordination server (relays ciphertexts to Avail, signs availability
attestations, triggers compute via Boundless with a funded prover key and Pinata for the
~40 MB program), a React + Vite client with WASM + workers, and USDS for every request.
The template's `pnpm dev:all` runs six services. Developer requirements: Node 22.10+,
pnpm 10.7+, Rust 1.91.1+, Foundry, Noir; a compute provider wants "16+ cores, 64 GB+
RAM" (CPU proving). *(estimate)* A competent two-person team with prior Noir/RISC Zero
exposure: 6–10 weeks to a Sepolia demo of design 2, a further 4–8 for mainnet hardening;
design 1 with real private money is research until the Railgun path is a library.
Sources: https://docs.theinterfold.com/project-template, https://docs.theinterfold.com/requirements,
https://docs.theinterfold.com/CRISP/setup, `examples/CRISP/Readme.md`.

### 6.3 Operating reality per campaign round

One E3 per tally: ≈ 16–330 USDS *(estimate, §2)*, ≥ 12 h before a result, one L1
transaction and a browser proof per backer, and a Boundless proving bill for the compute
step. For a campaign that tallies once at the deadline plus one milestone vote per tranche
that is cheap. For a live, continuously updating funding bar it is the wrong tool: the
bar would refresh once a day at best, and every refresh is a new E3 with a new committee.

### 6.4 For Röbel specifically

The Gemeinschaftskasse rails (Stripe, Monerium SEPA, on-chain to the transparent Safe) are
deliberately public, worded "Unterstützen", and the app's citizens are on Expo. Design 2
(private budget vote deciding what the Kasse funds) is the only piece with civic value,
and it is exactly the citizen-voting case that fails the reach rule in §4. Legal framing
stays as in `LEGAL_MASTERPLAN.md`: votes are a *Meinungsbild*; reward/donation
crowdfunding sits outside the EU crowdfunding regulation (ECSP applies to investment and
lending) but any pledge-with-bond design should be checked against Zahlungsdienste rules
before it touches money *(inference, not legal advice)*.

---

## 7. Recommended actions and watchlist

**Do now (cheap, no product change):**

1. Add one row to the MACI decision doc's trigger table: "Interfold/CRISP reaches
   phone-provable ballots and a voter path without L1 gas → re-evaluate replacing the
   Shamir coordinator." (This document is the reference; no code.)
2. Keep the CitizenNFTv2-as-Merkle-census idea in the ZK/sybil track: it is the one asset
   that transfers to any private-tally engine, Interfold included.
3. Nothing in `apps/expo`, `apps/web`, `apps/coordinator` or the contracts changes.

**Optional, only if Max wants a signal:** join the Interfold Telegram and ask two
questions in public: mobile proving plans after #1736, and L2/paymaster plans for voters.
Their answers will date this document.

**Watchlist with triggers (re-check no earlier than 2027-Q1, or when a trigger fires):**

| Watch | Trigger that changes the verdict |
|---|---|
| Ballot circuit size (#1736 "L-BFV + chunking", #1827) | Closed, with secure-preset user-encryption circuits small enough for a phone (native UltraHonk via Mopro-style bindings) or a WebView |
| Voter cost | An L2 deployment (Taiko is a partnership, not a chain in the manifest) or an official relayer/paymaster so a voter never needs L1 ETH |
| Network maturity | Public ciphernode registration open; first production CRISP E3s tallied; DKG minutes not hours; committees ≥ 19 routinely |
| Aragon plugin | Mainnet DAOs using it beyond Interfold itself; an audit of `crisp-aragon-plugin` |
| Private settlement | Interfold × Railgun as a documented library, not a demo (needed for sealed pledges with money) |
| SDK | Any `react-native` field, worker-free proving path, or `@interfold/sdk` docs beyond browser/Node |
| Hermes WebAssembly | Confirmed in a shipped Expo runtime with threads or a production-hardened interpreter; then `@interfold/wasm` encryption on device becomes a weekend test |

---

## 8. Repo context this was checked against

`docs/MACI_E_GOVERNANCE.md`, `docs/MACI_SHAMIR_OPERATIONS.md`,
`docs/future-research/2026-07-31_MACI_V3_MIGRATION_DECISION.md`,
`docs/future-research/2026-07-31_CONDUIT_RAAS_STRATEGY.md`,
`docs/future-research/2026-09-14_LOGOS_STACK_ASSESSMENT.md` (reach rule; its "Hermes has
no WASM" line now carries an erratum), `docs/CIRCLES_V2_FEATURE_VISION.md` §4.9,
`docs/MISSION_AND_GOALS.md` G2/G4, `apps/expo/lib/maci.ts`, `apps/expo/lib/donations.ts`,
`apps/expo/lib/governance-types.ts`, `apps/expo/package.json` (RN 0.85.3, Expo 56.0.21,
`maci-crypto` 2.5.0, `react-native-quick-crypto`, no WASM anywhere),
`apps/expo/app.config.ts` (new arch on; Hermes V1 is Expo 56's default).

## 9. Uncertainties

- Exact on-chain gas of a CRISP `publishInput` (Honk verification) on L1: no published
  figure; likely the largest per-voter cost item.
- Whether the ~4M-constraint figure in #1736 is the `secure-8192` preset or a newer
  "L-BFV" set; either way the team calls it 2× the browser target.
- Whether the WebAssembly implementation from the Feb 2026 Hermes post is compiled into
  the Hermes V1 that Expo 56 ships: not stated in Expo's SDK 55/56 notes; the public
  `facebook/hermes` `main`/`static_h` trees show no Wasm sources.
- Live fee quotes: our table applies the published formula with a naive duration; the
  contract's billable duration adds utilisation weights.
- Real DKG and decryption times on mainnet: "on the order of hours" (August) vs "usually
  5–20 minutes" (requestor guide); no measured production round is public yet.
- Governance: docs describe mainnet parameters, the DAO app footer says Sepolia, the
  September update says proposals are "being prepared". Treat governance as not yet live.
- Taiko: partnership post only; nothing in any deployment manifest.
