# The Shamir Coordinator Ceremony — what it is, why it exists, and how it works

> Conceptual deep-dive accompanying the operational runbook at
> [`MACI_SHAMIR_OPERATIONS.md`](./MACI_SHAMIR_OPERATIONS.md). Read this when
> you want to *understand* what the system does. Read the runbook when you
> want to *operate* it.

---

## 0. The one-paragraph version

The MACI coordinator privkey is the master decryption key for every
anonymous vote in the system. Whoever holds it can read every ballot. In a
naive deployment the coordinator is a single server holding the key in an
env var — a single point of trust. The Shamir ceremony replaces that with
a **3-of-5 federation of AttesterNFT holders**. The privkey is generated in
a browser, mathematically split into 5 shares (any 3 reconstruct it, any 2
reveal nothing), each share is encrypted to a different Attester's wallet,
and the original key is wiped from memory. From then on, no single party
— not even the operator running the Fly machine — can decrypt votes.
Decryption only happens when 3 Attesters voluntarily and independently
submit their shares to a freshly-spawned reconstructor process, which
reassembles the key in RAM, tallies the poll, posts the result on-chain,
and dies. Between tallies, the key does not exist anywhere.

---

## 1. Why this is needed — the threat we removed

### 1.1 The MACI privacy promise

MACI (Minimal Anti-Collusion Infrastructure) is a protocol for collusion-
resistant secret-ballot voting on a public blockchain. Voters encrypt
their ballots to the **coordinator pubkey** before publishing them
on-chain. Anyone can see the encrypted ballot exists, but only the
coordinator can decrypt the votes inside.

The coordinator then runs a zero-knowledge proof showing they correctly
tallied the (decrypted) ballots, and posts only the aggregate result.
Individual votes are never revealed. The ZK proof guarantees the
coordinator can't lie about the result without forging a snark.

### 1.2 The leak in the basic design

The coordinator's `coordinatorPrivKey` (a Babyjubjub scalar) is the key
to *every ballot in every poll the coordinator runs*. In a naive
deployment that key is:

- generated on a workstation,
- pasted into an env var,
- stored on a single server (in our case Fly.io),
- handed to a single human (the operator).

That operator can:

- decrypt every ballot at any time, in private, with no audit trail,
- be coerced or compromised, transferring that ability to anyone,
- be subpoenaed,
- be impersonated by anyone who steals the env var.

For a civic-tech application — secret ballots for a town vote — this is
the wrong shape. The whole point of secret ballots is that *no one* can
correlate "who" with "what they chose," not even the people running the
voting system. A single-operator coordinator has that property only on
the operator's word.

### 1.3 What changes with Shamir

The Shamir split distributes the coordinator privkey across 5 wallets
such that:

- **Any 3 of them can decrypt** (the threshold needed for an actual tally).
- **Any 2 of them learn nothing** about the privkey — not "almost
  nothing," not "a hard problem to solve," but *information-theoretically
  nothing*. The shares of 2 wallets are statistically indistinguishable
  from random bytes.
- **No one** (not even the founder who runs the ceremony) holds all 5
  shares. The plaintext privkey exists in computer memory for at most
  ~30 seconds during generation and again for ~10 minutes during each
  tally — never written to disk, zeroed immediately after use.

This converts the trust assumption from "we trust one operator forever"
to "we trust that at least 3 of 5 named Attesters won't simultaneously
collude with the operator." For our 5 Attesters in different physical
locations, signing with different wallets, that's a much smaller and
much more auditable assumption.

---

## 2. Shamir Secret Sharing — the math, briefly

Designed by Adi Shamir in 1979. The core insight is high-school
algebra: **n points uniquely determine a polynomial of degree n-1**, and
fewer than n points give you no information about that polynomial.

### 2.1 The split (k-of-n)

To split a secret `s` into `n` shares such that any `k` can reconstruct
it:

1. Pick a finite field — for us, integers mod a large prime `p`.
2. Pick a random polynomial of degree `k-1` whose constant term is the
   secret:
   ```
   f(x) = s + a₁·x + a₂·x² + … + aₖ₋₁·x^(k-1)   (mod p)
   ```
   where `a₁, …, aₖ₋₁` are uniformly random in `[0, p)`.
3. Evaluate the polynomial at `n` non-zero points to get the `n` shares:
   ```
   share_i = (i, f(i))   for i = 1, 2, …, n
   ```
4. Distribute one share to each shareholder.

For a 3-of-5 split (our config): `k=3`, so `f(x) = s + a₁·x + a₂·x²` — a
quadratic. Five points on that parabola become the five shares.

### 2.2 The reconstruct

Given any `k` shares `(x₁, y₁), …, (xₖ, yₖ)`, Lagrange interpolation
recovers `f(x)` uniquely, and `f(0) = s` recovers the secret.

```
            k       y_j · ∏_{i≠j} (0 - x_i)
f(0) = ∑   ─────────────────────────────────
           j=1     ∏_{i≠j} (x_j - x_i)
```

In code (we use the `shamir-secret-sharing` library, which implements
this for us): you hand it 3 shares as byte arrays, it hands you back the
secret bytes.

### 2.3 Why fewer than k shares give zero information

This is the part people often miss. With only `k-1 = 2` shares you have
2 points on a parabola. There are *infinitely many* parabolas passing
through those 2 points — one for every possible value of the third
coefficient `a₂`. Equivalently, for *every possible value of the secret
s*, there exists some polynomial passing through your 2 shares whose
constant term is `s`. So your 2 shares are statistically consistent
with *any* secret. You cannot do better than guessing.

This is **information-theoretic security**, stronger than RSA / ECDSA's
*computational* security. There is no algorithm — quantum or classical
— that can extract the secret from `k-1` shares, ever. Math doesn't
care about Moore's law.

### 2.4 What we split

Specifically: the **32-byte Babyjubjub privkey scalar** of the MACI
coordinator. We use `shamir-secret-sharing`'s `split(secret, n, k)`
which gives us 5 byte arrays. Each is ~33 bytes (32 for the
field-element y-coordinate + 1 for the share index x-coordinate).

The split happens **in the founder's browser** during the
`/admin/dashboard/coordinator/generate-key` ceremony. The plaintext
privkey is alive in JavaScript memory for under a minute, then dropped
when the page navigates away.

---

## 3. The "ceremony" — what actually happens step by step

A "key generation ceremony" is a structured sequence with audit trails
for every step. Ours has three phases: **enrollment**, **generation**,
**activation**.

### Phase A — Attester enrollment (one-time per Attester)

URL: [`/admin/dashboard/coordinator/register-share-key`](../apps/web/src/app/admin/dashboard/coordinator/register-share-key/page.tsx)

Each of the 5 AttesterNFT holders does this exactly once with their
production wallet:

1. Connect wallet, page verifies the wallet holds an AttesterNFT on the
   current AttesterNFT contract (`hasAttesterNFT(address)`).
2. Click **Registrieren**. The wallet is asked to sign a constant string:
   ```
   SHARE_KEY_CHALLENGE = "Roebel-Shamir-Share-Key v1\n\
   Sign this message to derive your share-encryption key.\n\
   This message is identical for every Attester and every rotation —\n\
   your wallet's signature is what's unique."
   ```
3. The signature `sig` is a deterministic function of (private key, message).
   The browser then derives a **Curve25519 keypair** from it:
   ```js
   seed = SHA-256("Roebel-Curve25519-share-key-v1\0" || sig)
   keypair = nacl.box.keyPair.fromSecretKey(seed)
   ```
4. The Curve25519 **public** key goes to Supabase
   (`coordinator_share_keys.curve25519_pubkey`), tied to the wallet.
5. The Curve25519 **private** key never leaves the browser — and is
   never even persisted in the browser. It's regenerated on-demand
   from the same wallet signature any time the Attester needs to
   decrypt a share.

Why this design?
- **No new key material to back up.** The Attester only protects what
  they were already protecting: their wallet.
- **Re-derivable forever.** Lose your laptop? Sign in to any browser
  with the same wallet, the same Curve25519 key is reproduced.
- **Wallet-bound revocation.** Lose your wallet (and therefore your
  AttesterNFT) → automatically lose the ability to derive the share key.
  No separate revocation step.

Status page shows ✓ 5/5 when all five Attesters have enrolled. Until
then, the founder cannot run the generation ceremony.

### Phase B — Founder generation ceremony

URL: [`/admin/dashboard/coordinator/generate-key`](../apps/web/src/app/admin/dashboard/coordinator/generate-key/page.tsx)

This is the security-critical step. Everything happens **in the
founder's browser**. The server never sees the plaintext privkey.

1. **Pre-flight check.** Page fetches `/api/coordinator/state` and
   confirms 5/5 share keys are registered. Lists their wallet addresses
   + Curve25519 pubkeys.

2. **Keypair generation.**
   ```js
   const kp = new Keypair()  // from maci-domainobjs
   const macisk = kp.privKey.serialize()  // "macisk.<64-hex>" → 32 bytes
   const pubKey = kp.pubKey.asContractParam()  // { x: BigInt, y: BigInt }
   ```
   The 32-byte raw secret is held in a `Uint8Array` in browser RAM.

3. **Shamir split.**
   ```js
   const shares = await sssSplit(macisk_bytes, 5, 3)
   // shares: Uint8Array[5] — each share is ~33 bytes
   ```

4. **Per-Attester encryption.** For each Attester `i`:
   ```js
   share_ciphertext_i = nacl.box.sealed(shares[i], curve25519_pubkey_i)
   ```
   `nacl.box.sealed` is **NaCl's sealed-box** — anonymous encryption
   where only the recipient can decrypt. Even the sender (the
   founder's browser) cannot decrypt later. Each share is bound to
   exactly one Attester wallet.

5. **Persist + zero.** Browser POSTs to
   `/api/coordinator/key-generations`:
   - 1 `coordinator_key_generations` row: `(pubkey_x, pubkey_y,
     threshold=3, total_shares=5, created_by_wallet, …)`
   - 5 `coordinator_shares` rows: `(key_generation_id, wallet_address,
     share_index, encrypted_share)`
   Server inserts in a single transaction. Then the browser does:
   ```js
   macisk_bytes.fill(0)        // zero the secret
   shares.forEach(s => s.fill(0))  // zero the plaintext shares too
   ```
   At this moment the plaintext privkey exists nowhere in the
   universe — only on-chain `coordinatorPubKey` (which is the derived
   pubkey, useless for decryption) and 5 sealed ciphertexts.

6. **Rotation proposal.** Founder clicks **Proposal einreichen**. Wallet
   signs a Governor `propose()` tx with calldata:
   ```solidity
   governor.setCoordinatorPubKey((newPubKey.x, newPubKey.y))
   ```
   On confirmation, the generation row is PATCHed with `proposal_id`
   and `set_pubkey_tx_hash`.

That ends the founder's part. Voting + execution happens through the
normal governance UI like any other proposal.

### Phase C — On-chain activation

The rotation goes through the standard OZ Governor lifecycle:

1. **Voting** (1h test config — would be longer in production).
2. **MACI tally** of the rotation poll itself. The first rotation is
   tallied with the *old* (legacy) coordinator key because the new key
   isn't on-chain yet. Subsequent rotations are tallied with the
   then-current Shamir-split key.
3. **Queue** through the Timelock.
4. **Wait** the Timelock delay (1h test config).
5. **Execute.** This calls `setCoordinatorPubKey()` on the Governor,
   which atomically replaces `coordinatorPubKey()` with the new
   `(x, y)`.

The Vercel `/api/coordinator/chain-listener` cron polls every 5
minutes for executed-but-not-yet-activated generations and PATCHes
`activated_at = now()` on the row. From that timestamp onward, every
new MACI poll the Governor deploys is encrypted to the new pubkey.

**Crucial property:** old polls remain encrypted to the *old* pubkey.
Their decryption still requires the old privkey (which is either
COORDINATOR_PRIV on Fly during the transition window, or the previous
generation's Shamir shares). The system handles this transparently —
each Shamir generation row keeps its associated `coordinator_shares`
rows around indefinitely, so any tally of any historical poll can
reconstruct the right key from the right generation's shares.

---

## 4. The per-tally workflow — how a vote actually gets counted

This is the part where the "3 of 5" matters most. Every time an
anonymous poll ends, the system needs to **temporarily** reconstruct
the privkey to run the ZK tally — then discard it again.

```
Poll voting ends
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 1: Founder opens a tally session                         │
│   /admin/dashboard/coordinator → Tally-Sessions               │
│   → POST /api/coordinator/sessions { pollId }                 │
│   → Fly /sessions → spawns reconstructor child process        │
│   → reconstructor:                                            │
│     - generates ephemeral session keypair (Curve25519)        │
│     - signs session manifest with COORDINATOR_ETH_PRIV        │
│     - INSERTs coordinator_sessions row (state=open)           │
│     - listens on localhost:<port> for share submissions       │
│     - 4-hour timeout                                          │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Each Attester (3 of 5 needed) opens                   │
│   /admin/dashboard/coordinator/tally/<pollId>                 │
│                                                                │
│   Browser:                                                     │
│   2a. Fetches session row via /api/coordinator/sessions/by-poll│
│   2b. Verifies session manifest signature recovers to          │
│       MACI_INFRA.coordinator (the on-chain Governor.coordinator)│
│       — if mismatch, page shows red "Session-Manifest ungültig"│
│       and disables submission. This is the trust root.         │
│   2c. Wallet signs SHARE_KEY_CHALLENGE → re-derives Curve25519 │
│   2d. Decrypts own encrypted share via nacl.box.sealed.open    │
│   2e. Wallet signs submission proof:                           │
│       keccak256("Roebel DAO coordinator share submission v1\n"│
│                  || JSON({sessionPubkey, shareIndex, wallet})) │
│   2f. POSTs { share, signature } direct to Fly                 │
│       (NOT through Vercel — the plaintext share must not pass  │
│        through any other trust boundary)                       │
│                                                                │
│   Fly's healthcheck.js verifies signature (with ERC-1271       │
│   fallback for smart-account wallets), forwards to reconstructor│
│   on localhost. Reconstructor de-duplicates by (wallet,        │
│   shareIndex), counts unique submissions, updates              │
│   submitted_shares_count in DB.                                │
└──────────────────────────────────────────────────────────────┘
        │
        │ when 3 valid shares arrive
        ▼
┌──────────────────────────────────────────────────────────────┐
│ Step 3: Reconstructor reassembles + tallies                   │
│                                                                │
│   const macisk = sssCombine([share1, share2, share3])         │
│   // macisk is now in RAM, in this child process only          │
│                                                                │
│   await runFinalize({ pollId, coordinatorPrivKey: macisk,     │
│                       proofDirRoot: '/app/proofs' })          │
│   //   = mergeSignups (skip if already done)                  │
│   //   = mergeMessages (skip if already done)                 │
│   //   = genProofs    ~10 min on Fly                          │
│   //   = proveOnChain                                         │
│   //   = chunkedAddTallyResults                               │
│                                                                │
│   macisk.fill(0)              // zero the buffer              │
│   sessionRow.state = 'completed'                              │
│   audit: 'tally_landed' with the on-chain tx hash             │
│   process.exit(0)                                              │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
   Tally on-chain. Governor.state(proposalId) →
   Succeeded (if For > Against AND quorum met)
   or Defeated.
```

Properties this workflow gives us:

- The privkey is in RAM only inside the reconstructor child process,
  for ~10 minutes per tally.
- It is in **no other process** at any time. The healthcheck.js parent
  process doesn't see it. Supabase doesn't see it. Vercel doesn't see
  it. The web browsers don't see it (they only see their own share).
- Between tallies, the privkey **does not exist anywhere**.
- The COORDINATOR_ETH_PRIV on Fly is separate — it's only for
  signing Ethereum transactions (mergeSignups, addTallyResults).
  Compromising the ETH key lets an attacker submit *bad* transactions
  but does **not** let them decrypt votes.

---

## 5. The bidirectional trust model

It's worth being explicit about what each party trusts the others to do.

| Party | Trusts | For |
|---|---|---|
| Voter | Coordinator pubkey is the right one | Encrypts ballot — only that pubkey can decrypt |
| Voter | MACI on-chain contracts | Will run the verifier correctly on the tally proof |
| Voter | ≥3 Attesters won't collude | Otherwise individual votes decryptable |
| Attester | Founder ran a clean generation | Their share is for a key derived from real randomness, not chosen by founder |
| Attester | The on-chain coordinator EOA is correct | When verifying the session manifest — that's the trust root that proves "this session is legitimate, not a phishing attempt" |
| Founder | At least 3 Attesters will show up at tally time | Otherwise polls can be tallied "too late," delaying results |
| Founder | Fly machine integrity | For the duration of reconstruction (~10 min/tally), Fly's RAM is the live attack surface |
| All | Base L2 finality | Governor + MACI state |

Note what no one needs to trust:
- The Vercel server (it only proxies non-secret data and provides UI; it
  never sees a share in plaintext).
- The Supabase database (it only stores encrypted shares; possessing
  the database alone gives no decryption ability).
- The founder, post-ceremony (they hold no share, no plaintext key).
- Any single Attester acting alone.

---

## 6. The "first Shamir tally" moment (irreversible privacy closure)

There's a specific operational step that flips the system from
"trust-minimized in principle" to "trust-minimized in code." Until
that step happens, the legacy single-key path still exists on Fly:

```bash
fly secrets unset COORDINATOR_PRIV -a roebel-maci-coordinator
```

The recommended sequence is:

1. Run the ceremony (Phase B above) — pubkey rotates on-chain.
2. Wait for a NEW poll to be created (it'll be encrypted to the new
   Shamir-split key, since `Governor.coordinatorPubKey()` is now the
   new value).
3. Vote, end the voting period.
4. Run a full Shamir tally end-to-end — 3 Attesters submit shares,
   reconstructor reassembles, tally lands on-chain.
5. ONLY THEN run `fly secrets unset COORDINATOR_PRIV`.

The point of waiting until step 5 is verification. If something is
subtly broken in the Shamir path (a serialization mismatch, an
RPC quirk, a smart-account signature edge case), you want to discover
it while the legacy path is still available as a fallback. Once you
remove COORDINATOR_PRIV, going back requires generating a fresh
single-key on a workstation and rolling it out as a new rotation — at
which point you've reintroduced the original threat.

After `fly secrets unset`:
- The `scan-and-finalize.js` branch `useLegacy = !!process.env.COORDINATOR_PRIV`
  becomes permanently `false`.
- `finalize-poll.js` exits with `COORDINATOR_PRIV not set` on every
  invocation.
- Every tally from this point on **requires** 3-of-5 attester
  cooperation. There is no fallback.

That moment is when the system genuinely becomes a federation.

---

## 7. Future operating notes

### 7.1 Periodic rotation

Best practice is to run a new ceremony after each big poll, even if no
Attester is being swapped. Rationale: forward secrecy. If the
reconstructor's RAM is compromised mid-tally, only that one poll's
key is at risk — not the next poll's, because the next poll uses a
key that hasn't been generated yet.

The runbook covers the rotation flow (§3 in `MACI_SHAMIR_OPERATIONS.md`).
On-chain it's the same `setCoordinatorPubKey` action, gated by a
governance proposal.

### 7.2 Adding / removing Attesters

The 3-of-5 split is encoded purely in `coordinator_key_generations.threshold`
and `total_shares`. To go to 4-of-7 (or any other config):

1. New Attesters enroll at `/register-share-key` (any wallet holding
   an AttesterNFT can).
2. Founder runs a new ceremony — the generate-key page reads `THRESHOLD`
   and `TOTAL_SHARES` constants, change them and the rest follows.
3. Old polls remain decryptable only by the OLD Attester set (their
   shares are still in `coordinator_shares` rows tied to the previous
   `key_generation_id`).
4. Future polls use the new threshold.

### 7.3 Disaster recovery

Covered in `MACI_SHAMIR_OPERATIONS.md` §6. The TL;DR: as long as ≥3 of
the original 5 Attester wallets exist, the system recovers. Below 3,
the historical polls under that key are permanently undecryptable —
which is the correct cryptographic outcome for a true threshold scheme,
even if operationally painful. The mitigation is to rotate often
enough that any "permanently undecryptable" window is small.

---

## 8. Verifying the system end-to-end

After a Shamir tally has landed:

```bash
# 1. COORDINATOR_PRIV is gone:
fly secrets list -a roebel-maci-coordinator | grep -i coordinator_priv
# (empty)

# 2. Reconstructor not holding state between tallies:
curl https://roebel-maci-coordinator.fly.dev/status | jq .activeSession
# null

# 3. The latest session_completed audit row references a tallyFile, not a key:
# (inspect coordinator_audit table in Supabase)

# 4. Pubkey on-chain matches the latest activated generation:
# Governor.coordinatorPubKey() == latest_activated_generation.{pubkey_x, pubkey_y}

# 5. The verify script passes:
node apps/web/scripts/verify-shamir.mjs
# expect: 12/12 assertions pass
```

If all five hold, the privacy-from-coordinator gap is provably closed.

---

## See also

- [`MACI_SHAMIR_OPERATIONS.md`](./MACI_SHAMIR_OPERATIONS.md) — operational runbook (setup, per-tally workflow, disaster recovery)
- [`MACI_E_GOVERNANCE.md`](./MACI_E_GOVERNANCE.md) — broader governance architecture
- [`apps/coordinator/scripts/reconstructor.js`](../apps/coordinator/scripts/reconstructor.js) — the reconstructor child process
- [`apps/coordinator/scripts/lib/session-manifest.js`](../apps/coordinator/scripts/lib/session-manifest.js) — manifest signing + submission verification
- [`apps/web/src/lib/shamir/wallet-encryption.ts`](../apps/web/src/lib/shamir/wallet-encryption.ts) — share encryption / decryption in the browser
- [`apps/web/src/lib/shamir/tally-session.ts`](../apps/web/src/lib/shamir/tally-session.ts) — manifest verification in the tally page
- Adi Shamir, *How to Share a Secret*, CACM 22(11), 1979 — the original paper
