# Röbeltaler Spikes — Findings (2026-06-17)

Run against real Gnosis (chain 100). Records the validated facts + the blockers that
gate the permanent, production group registration.

## Decisions locked with the user
- **No throwaway test group.** Register the **permanent, production, long-term** Röbeltaler group.
- **Phase 0 first.** A correct production group needs a permanent owner Safe + CitizenNFT (and its
  membership condition) **on Gnosis** before registration. We do minimal Phase 0, then register.
- **Optimistic mint-policy defaults** (to validate with the Circles team): standard Base Mint Policy,
  fee = 0, demurrage = standard decay.

## Validated OFFLINE (no gas needed) ✓
| Fact | Value |
|------|-------|
| SDK package | `@aboutcircles/sdk` (+ `@aboutcircles/sdk-core` for `circlesConfig`, `@aboutcircles/sdk-types`) v0.1.51 |
| SDK construction | `new Sdk(circlesConfig[100], contractRunner)` |
| Runner interface | `ContractRunner { address, publicClient, init(), estimateGas?, call?, sendTransaction?(txs[]) }` — implemented for Node/viem in [`scripts/circles/runner.ts`](../../../scripts/circles/runner.ts) |
| Register group | `sdk.register.asGroup(owner, service, feeCollection, initialConditions: Address[], name (≤19 chars), symbol, profile)` |
| Register human | `sdk.register.asHuman(inviter, profile)` — **requires an inviter** |
| Register org | `sdk.register.asOrganization(profile)` — **no invite needed** |
| Personal mint | `avatar.personalToken.mint()` |
| Group mint | `avatar.groupToken.mint(groupAddress, amount)` |
| Transfer | `avatar.transfer.advanced(to, amount)` / `avatar.transfer.direct(to, amount, token?)` |
| Balances | `avatar.balances.getTokenBalances()` |
| Gnosis Hub v2 | `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8` |
| Base Mint Policy | `0xcCa27c26CF7BAC2a9928f42201d48220F0e3a549` |
| Name Registry | `0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474` |
| circlesConfig[100] keys | circlesRpcUrl, profileServiceUrl, v2HubAddress, nameRegistryAddress, baseGroupMintPolicy, standardTreasury, coreMembersGroupDeployer, **baseGroupFactoryAddress**, liftERC20Address, **invitationFarmAddress**, referralsModuleAddress, **invitationModuleAddress**, gnosisPayInviteQuotaGranteeAddress |
| Burner address | `0xd5028284017A32C672CbD73Fe35aCD897bA874cf` |
| Connectivity | viem → Gnosis chainId 100 ✓; SDK + config load ✓ |

## BLOCKERS (need user / Phase 0) ✗
1. **Burner has 0 xDAI.** No transaction can run until it's funded. (And the burner is disposable —
   it must NOT be the permanent group owner.)
2. **`asGroup` is immutable.** owner / mint policy / conditions are permanent per group → registering
   requires the *real* prerequisites, not the burner.
3. **Permanent owner Safe on Gnosis does not exist yet** (Phase 0). The production group owner must be
   the 3-of-5 Attester Safe on Gnosis.
4. **CitizenNFT + membership condition not on Gnosis yet** (Phase 0). Without the condition contract,
   `initialConditions` would be `[]` → an immutably **ungated** group (breaks the citizenship thesis).
5. **Human registration needs an invite** (`asHuman(inviter, …)`). The collateral side (members minting
   personal CRC to back Röbeltaler) needs at least one invited human. Org avatars need no invite.

## Minimal Phase 0 (prerequisite for the permanent registration)
1. Deploy the **3-of-5 Attester Safe** on Gnosis (permanent group owner).
2. Deploy **CitizenNFT** (+ AttesterNFT) on Gnosis; re-issue to the 15 citizens / 5 Attesters
   (soulbound re-mint ceremony).
3. Write + deploy a **CitizenNFT-gated Circles membership condition** implementing the interface the
   BaseGroup expects for `initialConditions` (interface TBD — research/confirm with Circles).
4. (Full Phase 0 also redeploys MACI/Governor + re-runs the Shamir ceremony — NOT strictly required
   for the group itself; tracked in the separate Phase 0 plan.)
5. Then register the permanent group: owner = Safe, feeCollection = Stadt-Safe, conditions =
   [citizenCondition], name "Roebeltaler Pilot" (≤19), symbol "RTLR", display "Röbeltaler".

## ON-CHAIN results (burner funded with ~4.95 xDAI, real Gnosis)
- **Write path proven.** The burner address `0xd502…874cf` is **already a registered Circles
  `HumanAvatar`** (confirmed via `sdk.getAvatar` → constructor `HumanAvatar`, exposes `personalToken`,
  `groupToken`, `trust`, `transfer`, `invitation`). So a funded, registered human already exists —
  the **invite dependency (Blocker 5) is moot for the demo human**.
- **`personalToken.mint()` REVERTED** ("unknown reason"), balances `[]`. Likely causes to investigate:
  issuance not yet accrued (just-registered humans have ~nothing to mint until a period elapses), the
  avatar being in a `stopped` state, or a mint precondition. Needs a focused debug (decode the revert)
  — not yet resolved.
- Scripts: [`spike-0-connect`](../../../scripts/circles/spike-0-connect.ts),
  [`spike-2-write-path`](../../../scripts/circles/spike-2-write-path.ts),
  [`spike-2b-inspect`](../../../scripts/circles/spike-2b-inspect.ts),
  [`spike-3-personal-mint`](../../../scripts/circles/spike-3-personal-mint.ts),
  [`spike-1-group`](../../../scripts/circles/spike-1-group.ts) (ready; gated on Phase 0 for the *permanent* group).

## Still HARD-blocked tonight
- **Permanent production group:** registering now = immutably **ungated** (no CitizenNFT condition on
  Gnosis) + owned by a disposable burner. Won't do it — it would be permanently broken.
- **Citizen Migration Mint:** needs (a) the 15 citizen **Gnosis addresses**, (b) a **permanent owner**
  for CitizenNFT on Gnosis (Safe/Timelock, not the burner), (c) the mint mechanism (CitizenNFT mints
  via the dual-sig **attestation flow**, not a one-shot owner mint) — i.e. a real ceremony + toolchain.

## RESEARCH ANSWERS to the open Circles questions (2026-06-17)

Sourced from the live SDK ABIs (`@aboutcircles/sdk` bundle), `circles-contracts-v2`
(`src/groups/BaseMintPolicy.sol`, `IMintPolicy.sol`), the Circles docs, and the
deployed `circlesConfig[100]`. Confidence noted per item.

**Gnosis BaseGroup addresses (from circlesConfig[100]):**
- BaseGroupFactory `0xD0B5Bd9962197BEaC4cbA24244ec3587f19Bd06d`
- baseGroupMintPolicy (standard) `0xcCa27c26CF7BAC2a9928f42201d48220F0e3a549`
- standardTreasury `0x08F90aB73A515308f03A718257ff9887ED330C6e`
- Hub v2 `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8`

**Q1 — membership condition interface / how to citizen-gate.** *(High confidence on
mechanism; exact condition-fn signature: confirm with Circles.)* The factory call is
`createBaseGroup(_owner, _service, _feeCollection, _initialConditions: address[],
_name, _symbol, _metadataDigest)`. CRUCIALLY, membership is **owner-driven and
mutable**: the BaseGroup exposes `setMembershipCondition(address _condition, bool
_enabled)`, `trust(address,uint96 expiry)`, and `trustBatchWithConditions(address[]
_members, uint96 _expiry)` (revert event `failedCondition`). → **Conditions are NOT
immutable** and need not exist at registration. We citizen-gate by having the owner
(the Attester Safe) trust exactly the 15 CitizenNFT holders. An automated on-chain
`CitizenNFT`-condition (a contract returning `hasCitizenNFT(addr)`) can be added
later via `setMembershipCondition`. The exact condition fn name to implement is the
ONE thing to confirm with Circles — but it does not block go-live.

**Q2 — does a custom/fee mint policy lose inter-group fungibility?** *(Confident.)*
Group Circles minted under the **standard Base Mint Policy** stay transitively
tradable/redeemable in the Circles graph (it's the reference mint/burn/redeem impl).
A *custom* policy can diverge. → We use the **standard policy** (factory default) to
preserve fungibility. Decision de-risked.

**Q3 — standard policy fee + fee-collection.** *(Confident on mechanism.)* The
BaseGroup carries a `feeCollection` address (constructor arg + `setFeeCollection`).
Pilot: set it to the Stadt-Safe with **fee = 0**. Raising a redeem-fee later is a
group/policy parameter change, not a re-registration.

**Q4 — demurrage on group tokens.** *(Confident.)* Group CRC demurrages like all
Circles (~7%/yr) — it is **pure decay/rebasing, not collected** into any treasury.
The pCRC collateral in the vault demurrages in lockstep, so backing stays ~1:1.
Do NOT plan treasury revenue on demurrage (matches spec §6).

**Net:** the optimistic defaults (standard policy, fee 0, standard demurrage,
owner-curated citizen gate) are all the low-risk/standard choices. **Nothing blocks
registering the permanent group now.** Remaining genuine dependency for END-TO-END
citizen minting: each citizen must be a registered Circles **human** on Gnosis (Circles
invite onboarding) before they can deposit pCRC collateral — that is per-user Circles
onboarding, independent of our group.

## Requires a REAL funded deployer (not the disposable burner)
Phase 0 contract deploys + the permanent registration must be signed by a key/Safe that stays under
the project's control long-term. The disposable spike burner is only for throwaway read/validation.
