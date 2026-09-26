# v3 cutover — re-point checklist and safe order

Line numbers are from `feat/passkey-accounts` on 2026-09-26. Re-grep before editing:

```bash
rg -n -i "59aA26f4|C587F383|c4B9E45F|6663eDC8|5F5e499D|5b358A77|5850A045|3A08c86E|4686(7[0-9]{3}|0000)|46_850_000"
```

## The one rule that keeps production working

After the v3 bootstrap, **v3 and v2 hold exactly the same addresses.** Until the first
divergence, reading v2 or v3 gives the same answer, so any reader can be switched at any time.

Three things cause divergence:

1. **A `moveTo`.** The token leaves the legacy address, so v3 and v2 now disagree.
2. **A new attestation or revocation on v3.**
3. **A new attestation or revocation on v2.** v2 stays writable until it is frozen.

That gives the order:

1. **Bootstrap.**
2. **Freeze v2 writes.**
3. **Switch every reader to v3.**
4. **Switch the writers** (the app's attestation and vote flows) to v3.
5. **Only then** open `moveTo` to users.

Servers switch before clients, so no client can ever show a v3-only state that a server rejects.

## Phase A — on-chain, production untouched

| # | Step | Who |
|---|---|---|
| A0 | Run `GNOSIS_FORK=1 npx hardhat run scripts/v3-cutover/rehearse.cjs`; every assertion must pass | dev |
| A1 | Create the new Attester Safe: **at least 3-of-5**, owners = the attesters' passkey Safes, no EOA owners, no modules. D5. | Max |
| A2 | New Shamir ceremony: share keys wrapped under the passkey PRF (spec "New MACI keys"). Keep the pubkey X/Y. Details in **MACI** below. | Max + attesters |
| A3 | `01-deploy-identity.cjs` → writes `deployments/gnosis-v3.json` | burner deployer |
| A4 | `02-bootstrap-calldata.cjs` → the Safe signs and executes `02-bootstrap-part-*.json` in order | Safe (3/5) |
| A5 | `03-deploy-governance.cjs` with `COORDINATOR_PUBKEY_X/Y` from A2 | burner deployer |
| A6 | `04-circles-condition.cjs` deploys the condition and **writes** the Safe file. **Do not execute it yet.** | burner deployer |
| A7 | Sweep the burner and never reuse it (plan §4.4) | Max |

**Freeze v2 writes before Phase B.** Use a Safe tx from the old v2 owner `0x3A08…` (1-of-4 today):

- Call `CitizenNFTv2.setAttestationBands([0,65535,65535],[0,1,1])` and
  `AttesterNFTv2.setApprovalBand([0,65535,65535])`. With these bands no new v2 attestation can
  ever reach threshold.
- Requests store their threshold at creation. So first check that no v2 attestation request is
  `Pending`, or finish those requests.
- **Revocations stay possible on v2.** Mirror every revocation on v3 until finalize. Do not
  freeze revocation: a malicious citizen must stay removable.

**Then re-run 02.** It must print `delta: 0 attesters, 0 citizens`. If it does not, execute the
new part files first.

## Phase B — readers (servers first)

Plain address swaps. They are safe in any order inside this phase, **as long as nothing has
diverged**, which the freeze above guarantees.

| # | File:line | Constant | → v3 value |
|---|---|---|---|
| B1 | `apps/expo/supabase/functions/circles-invite/index.ts:16` | `CITIZEN_NFT` | `citizenNFT` (redeploy via Supabase MCP) |
| B2 | `apps/expo/supabase/functions/create-reward-event/index.ts:10` | `CITIZEN_NFT` | `citizenNFT` (redeploy via Supabase MCP) |
| B3 | `scripts/circles/fly-auto-invite/bot.mjs:12` | `CITIZEN_NFT` | `citizenNFT` |
| B3 | `scripts/circles/fly-auto-invite/bot.mjs:14` | `FROM_BLOCK` default `46867000` | `identityDeployBlock` |
| B3 | `scripts/circles/fly-auto-invite/fly.toml:10` | `FROM_BLOCK` | `identityDeployBlock` |
| B3 | `scripts/circles/auto-invite-bot.ts:19` | `CITIZEN_NFT` | dev copy, keep in sync |
| B4 | `apps/web/src/lib/server/verify-citizen.ts:25` | `CITIZEN_NFT_ADDRESS` | `citizenNFT` |
| B4 | `apps/web/src/lib/server/verify-citizen.ts:26` | `ATTESTER_NFT_ADDRESS` | `attesterNFT` |
| B5 | `apps/web/src/lib/shamir/signature-verification.ts:40` | `ATTESTER_NFT_ADDRESS` | `attesterNFT` (server attester gate for share-keys / key-generations; memory: bump on every rotation) |
| B6 | `apps/web/src/lib/passkey/sponsor-policy.ts:86` | `CITIZEN_NFT` | `citizenNFT`. **Owned by the passkey agent's area; coordinate, do not edit from here.** |
| B7 | `packages/protocol/examples/roebel.netizen.json:12-18` | `.contracts` | `citizenNft`, `attesterNft`, `governor`, `timelock`, `maci`, `safe` (**new Safe**), `gatekeeper` |
| B7 | `packages/protocol/examples/roebel.netizen.json:130` | second `safe` | Treasury/payTo. Check: likely stays the treasury Safe, not the Attester Safe |
| B7 | then `netizen render` | regenerates env for roebel-id, relay-sync, publisher | |
| B8 | `apps/roebel-id/.env.example:6-7` | `CITIZEN_NFT_ADDRESS`, `ATTESTER_NFT_ADDRESS` | set the new values as Fly secrets on roebel-id (`src/config.ts:212-213` requires them) |
| B9 | relay-sync env | `CITIZEN_NFT_ADDRESS` (`packages/relay-sync/src/cli.ts:30`, rendered by `packages/cli/src/render.ts:576`) | `citizenNFT` |
| B10 | publisher env | `PROPOSAL_GOVERNOR` (`packages/cli/src/render.ts:615`) | `maciAttesterGovernor` **after** the last v2 proposal is published |
| B11 | `contracts/governor-contract/deployments/roebel-registry-record.json:6-14` | `controller` / `citizenNft` / `attesterNft` / `governor` / `timelock` / `maci` / `safe` / `gatekeeper` | Then `register-existing-community.cjs` → the `setRecord` Safe tx. The record is controlled by `controller` (`0x3A08…` today), so the **old** Safe signs the record change that names the new one. |
| B12 | `packages/blockchain/src/index.ts:13-14,21-22,24-25,28` | `CONTRACTS.*` | Nothing imports it; it is a mirror, but the documented source of truth |
| B13 | `apps/mini-apps/roebel-data/src/lib/citizens-onchain.ts:15-16,20` | `CITIZEN_NFT_V2`, `ATTESTER_NFT_V2`, `DEPLOY_BLOCK` | v3 values and `identityDeployBlock` |
| B13 | `apps/mini-apps/roebel-data/src/lib/citizen-graph.ts:40` | `DEPLOY_BLOCK` | `identityDeployBlock` |
| B13 | `apps/mini-apps/roebel-data/src/lib/proposals.ts:134` | `MACI_CORE` | `maci`. Keep v2 for history: polls live per MACI. |
| B13 | `apps/mini-apps/roebel-data/src/lib/circles.ts:27` | `GROUP_OWNER` | only if the group owner changes (D3: later) |
| B13 | `apps/mini-apps/roebel-data/src/lib/treasury.ts:12` | `TREASURY_SAFE` | only if the treasury moves |
| B13 | `circles-roebel-mini-app/src/lib/{citizens-onchain,proposals,treasury,circles}.ts` | same | legacy copy (`npx vercel --prod`, not git-connected) |
| B14 | `scripts/circles/verify-status.ts:13` | `CITIZEN_NFT` | ops helper |
| B14 | `scripts/circles/{enumerate-citizens,enumerate-v2,register-roebel-group,register-roebeltaler-group}.ts` | `SAFE` | only if the Safe role moves |

**Then execute `04-circles-swap-condition.json`.** The group owner signs it; that is `0x3A08…`
today, read on-chain by 04.

- After this, the group only admits v3 citizens.
- The bot (B3) must already read v3 by now, otherwise it tries to add people the gate would
  admit anyway. That is harmless, but the logs get noisy.

## Phase C — clients (writers) and governance

Web deploys from `main` through Vercel. Expo constants are JS, so they ship **OTA**: preview
first, then production. Per memory, Max runs `eas update` himself.

| # | File:line | Constant | → v3 value |
|---|---|---|---|
| C1 | `apps/web/src/lib/contracts.ts:16-17` | `PRODUCTION_CITIZEN_NFT_ADDRESS` / `PRODUCTION_ATTESTER_NFT_ADDRESS` | NFTs |
| C1 | `apps/web/src/lib/contracts.ts:37-38` | `MACI_GOVERNOR_ADDRESS` / `MACI_ADDRESS` | governor, maci |
| C2 | `apps/web/src/lib/verification-contracts.ts:20` | `governor` fallback | governor |
| C3 | `apps/web/src/lib/maci-config.ts:20-21,24,31,35-36` | `MACI_INFRA.*` | NFTs, maci, gatekeeper, governor, timelock. Verifier, vkRegistry, factories and voiceCreditProxy (`:25-32`) are **unchanged** because 03 reuses them. |
| C3 | `apps/web/src/lib/maci-config.ts:113` | `ROTATION_HISTORY` | add a v3 entry and keep v2 as `LEGACY_*` so the admin pages can still list and tally v2 polls |
| C4 | `apps/web/src/lib/gnosis.ts:11-13` | `citizenNFTGnosisAddress`, `attesterNFTGnosisAddress`, `attesterSafeGnosisAddress` | NFTs, new Safe |
| C5 | `apps/web/src/lib/muenzen/constants.ts:55,58-59` | `ADDR.safe`, `ADDR.citizenNFT`, `ADDR.attesterNFT` | Check `ADDR.safe`: if it is the treasury or group-owner role, leave it |
| C6 | `apps/web/src/lib/citizen-registry.ts:22` | `DEPLOY_BLOCK = 46_850_000n` | `identityDeployBlock` |
| C6 | `apps/web/src/hooks/useSocialGraph.ts:44` | `FROM_BLOCK = 46867000n` | `identityDeployBlock` |
| C7 | `apps/web/src/components/proposals/ContractsInfoDialog.tsx:25,29,33,37` | UI list | governor, timelock, NFTs |
| C8 | `apps/web/scripts/gk-verify-transfer.mjs:30`, `gk-emergency-withdraw.mjs:43` | `SAFE` | only if the treasury role moves |
| C9 | `apps/expo/constants/thirdweb.ts:75-76` | `attesterNFTAddress`, `citizenNFTAddress` | NFTs |
| C9 | `apps/expo/constants/thirdweb.ts:81` | `governorContractAddress` | governor |
| C9 | `apps/expo/constants/thirdweb.ts:84` | `maciAddress` | maci. Verifier and vkRegistry at `:85-86` are unchanged. |
| C9 | `apps/expo/constants/thirdweb.ts:98` | `MACI_DEPLOY_BLOCK = 46867703n` | `maciDeployBlock - 100` (same convention) |
| C10 | `apps/expo/constants/gnosis.ts:17,19` | NFT fallbacks | NFTs |
| C10 | `apps/expo/constants/gnosis.ts:25-26` | `PRODUCTION_*` (staging detection) | NFTs |
| C10 | `apps/expo/constants/gnosis.ts:44` | `attesterSafeGnosisAddress` | new Safe |
| C11 | `apps/expo/constants/verification-contracts.ts:15-17` | NFTs + governor | Its `NEXT_PUBLIC_*` overrides are dead in Expo; the literal is what runs |
| C12 | `apps/expo/hooks/useAttesters.ts:31` | `fromBlock: 46867000n` | `identityDeployBlock` |
| C13 | EAS env / `.env.example` | `EXPO_PUBLIC_*_GNOSIS`, `EXPO_PUBLIC_GOVERNOR`, `EXPO_PUBLIC_MACI` | Set them, or leave them unset so the literals apply (check EAS env first, per memory `reference_ota_env_leak_local_env`) |
| C14 | coordinator Fly secrets `MACI_ADDRESS`, `GOVERNOR_ADDRESS` (`apps/coordinator/fly.toml:12-13`) | | **Only after the last v2 poll is tallied** (see MACI below) |
| C15 | Supabase `coordinator_key_generations` | row keyed by `governor_address` | The new ceremony's row for the **v3** governor (runbook §10.11 rule 3) |
| C16 | `deployments/gnosis-v2.json`, CLAUDE.md, `docs/CIRCLES_ROEBEL_MUENZEN_STATE.md` | | Mark v2 archived and v3 live |

**Leave these alone:**

- **`test/V3Bootstrap.fork.test.js:12-13`:** these must stay v2, because the test reads v2.
- **`scripts/test-env/lib.cjs:24-27`:** this is a prod-address denylist. Add the v3
  addresses; do not remove the v2 ones.
- **Test fixtures:** `packages/cli/test/fixtures/full-node.json`,
  `packages/cli/test/render.test.ts:66,432`, `packages/publisher/test/mappers.test.ts:621,630`,
  `packages/record-client/test/civic.test.ts`, and similar. Change them only if the tests
  should track the live set.
- **Base coincidences:** `apps/web/src/lib/maci-config.ts:51` (`LEGACY_BASE_MACI_INFRA.voiceCreditProxy`),
  `deployments/base.json:10,14` and `docs/MACI_E_GOVERNANCE.md:200-201`. They share bytes
  with v2 addresses by deployer nonce and are **not** v2.

## Phase D — open `moveTo` (spec Phase 3, per user, opt-in)

Only after Phase B and Phase C are live **in production** (OTA adopted). Before that, a moved
citizen looks like a non-citizen to any reader still on v2. Gate the UI on the app version.

- For the 10 counterfactual legacy accounts, the first op must include
  `AccountFactory.createAccount(adminEOA, "")`. The spec calls this "Undeployed accounts".
- The destination Safe needs a fallback handler that answers `onERC721Received`.
  `moveTo` uses `_safeMint`. Passkey Safes use the Safe4337Module as fallback handler, and the
  rehearsal proves that this works. **A bare Safe with no fallback handler would revert.**

## Phase E — close

1. Run `02-LATER-finalize-bootstrap.json` (preconditions are in the 02 header).
2. Run `closeMoveWindow()` on both NFTs (Safe tx).
3. Follow `05-ownership-to-timelock.md`.
4. v2: the v2 gatekeeper `0xc4B9…` is still owned by the deployer EOA `0xd502…`. Once v2
   polls are done, renounce it or leave it archived. Keep the v2 contracts readable for
   history.

## MACI implications

- **New MACI, new state tree, new polls.** Every citizen must **sign up again** on the v3
  MACI (plan §4.8). The token ids are new (v3 numbering), and the v3 gatekeeper starts empty.
  The app needs a one-time "Für Abstimmungen neu registrieren" prompt.
- **Open v2 polls finish on the v2 stack.**
  - Proposals created on the v2 Governor keep their v2 MACI poll.
  - The coordinator (`MACI_ADDRESS` / `GOVERNOR_ADDRESS` are single-valued on Fly) stays on v2
    until the last v2 poll is tallied and executed. Only then switch it (C14).
  - Stop creating new v2 proposals when the clients switch (C1/C9). Watch the tally grace
    period, which is 7 days today.
- **The Shamir re-share ceremony comes before the first v3 tally.**
  - The current share keys derive from thirdweb signatures, which passkeys cannot reproduce.
  - The live v2 Governor's `coordinatorPubKey()` is still `1775076…`, the **retired
    single-operator key** from runbook §10.11. 03 therefore refuses to copy it unless you pass
    the new ceremony key (`COORDINATOR_PUBKEY_X/Y`) or explicitly set
    `ACCEPT_LIVE_COORDINATOR_PUBKEY=yes`.
  - Passing the new key at deploy time is the only way to avoid a chicken-and-egg problem.
    A v3 Governor can only rotate its key through a proposal that was itself **tallied**
    with the old key.
- **Clients must read the key from the Poll** (runbook §10.10a). This is already the case
  since commit `4da83fd`. Never hardcode it.
- **The Supabase generation row is keyed by the governor address** (runbook §10.11 rule 3),
  so a new row is needed for the v3 Governor.
- **One ballot per citizen stays true across moves.** A moved citizen keeps the same token id,
  so the v3 gatekeeper rejects a second sign-up (`AlreadyRegistered`). The rehearsal proves
  this. The MACI key already registered by the old account keeps voting power. The client
  must keep that MACI key (random, PRF-wrapped; spec "New MACI keys") across the move.
