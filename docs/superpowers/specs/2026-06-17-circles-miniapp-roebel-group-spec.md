# Spec — Röbel Circles v2 Mini App (Hackathon hand-off)

> **For another agent.** Build a Circles v2 **Mini App** (runs inside Metri / the
> Circles app) for a **citizen-gated hometown group currency**: verified Röbel
> citizens convert their personal CRC into **RCRC ("Röbel-Taler")**, a Circles
> group token, while non-citizens are excluded. Date: 2026-06-17.
>
> Context repo (production app, NOT this Mini App): the Röbel monorepo. This Mini App
> is a **separate, standalone** project. Reuse only the on-chain CitizenNFT below.

## 0. Why a Mini App (and why it sidesteps the cold-start)
The production Röbel app uses **thirdweb smart accounts** that are NOT Circles humans,
so citizens can't get personal CRC → can't mint a collateral-backed group token (a hard
cold-start, since onboarding humans needs invites/CRC). A **Circles Mini App runs inside
Metri**, where **every user is already a Circles human with personal CRC**. So the
collateral model works natively — citizens just deposit their existing CRC → RCRC. No
invites, no onboarding cold-start. This is the clean home for the Circles-native version.

## 1. Core architecture
- **Chain:** Gnosis (100). **Protocol:** Circles v2.
- **Group:** a Circles **BaseGroup** named "Röbel" → its group token = **RCRC / Röbel-Taler**.
- **Access gate (the important part):** a **custom CitizenNFT membership condition** —
  only addresses holding the Röbel `CitizenNFT` can become members. Non-citizens can't join.
- **Mint mechanics:** the **STANDARD Base Mint Policy** (no custom policy needed). Members
  deposit personal CRC as collateral → receive RCRC; redeemable back to CRC.
- **Net:** membership condition = *who* (citizens only); standard mint policy = *how the
  token mints/burns/redeems*. Two separate mechanisms — gate access with the condition.

## 2. Key addresses (Gnosis, verified)
- Circles Hub v2: `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8`
- BaseGroupFactory: `0xD0B5Bd9962197BEaC4cbA24244ec3587f19Bd06d`
- Standard Base Mint Policy: `0xcCa27c26CF7BAC2a9928f42201d48220F0e3a549`
- Standard Treasury: `0x08F90aB73A515308f03A718257ff9887ED330C6e`
- Name Registry: `0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474`
- **Röbel CitizenNFT (Gnosis):** `0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4`
  — read method: `hasCitizenNFT(address) → bool` (soulbound; 15 holders today).
- circlesRpcUrl: `https://rpc.aboutcircles.com/`

## 3. Contract to build: `CitizenMembershipCondition` (interface CONFIRMED)
The exact interface is `aboutcircles/circles-groups`
`src/membership-conditions/IMembershipCondition.sol`:
```solidity
interface IMembershipCondition {
    function passesMembershipCondition(address avatar) external returns (bool);
}
```
Their `IsHumanCondition` (checks `hub.isHuman`) is the template. The Röbel version checks
the CitizenNFT instead — already written + compiling in the production repo at
`contracts/governor-contract/contracts/verification-system/CitizenMembershipCondition.sol`:
```solidity
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;
interface IMembershipCondition { function passesMembershipCondition(address avatar) external returns (bool); }
interface ICitizenNFT { function hasCitizenNFT(address account) external view returns (bool); }

contract CitizenMembershipCondition is IMembershipCondition {
    ICitizenNFT public immutable citizenNFT;
    constructor(address _citizenNFT) { require(_citizenNFT != address(0), "citizenNFT=0"); citizenNFT = ICitizenNFT(_citizenNFT); }
    function passesMembershipCondition(address avatar) external view returns (bool) {
        return citizenNFT.hasCitizenNFT(avatar);
    }
}
```
Deploy with `_citizenNFT = 0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4` (Gnosis CitizenNFT).
The BaseGroup contracts live in `aboutcircles/circles-groups` (`src/base-group/`,
`src/membership-conditions/`) — reference for the building agent.

## 4. Register the group (one-time, via Circles SDK `@aboutcircles/sdk`)
```ts
import { Sdk } from "@aboutcircles/sdk";
import { circlesConfig } from "@aboutcircles/sdk-core";
const sdk = new Sdk(circlesConfig[100], runner); // runner = the operator/owner Safe or EOA
const group = await sdk.register.asGroup(
  ownerAddress,          // group owner (a Röbel Safe)
  serviceAddress,        // service
  feeCollectionAddress,  // fee target (0 fee for pilot)
  [citizenConditionAddr],// initialConditions = [CitizenMembershipCondition] ← the gate
  "Roebel",              // name (≤19 chars)
  "RCRC",                // symbol
  { name: "Röbel-Taler", description: "Bürger-Gemeinschaftswährung Röbel/Müritz." },
);
```
- `initialConditions` is `address[]` — pass the deployed `CitizenMembershipCondition`.
- Conditions are mutable post-registration via `setMembershipCondition(addr,bool)`.
- The **mint policy is immutable** at registration → use the standard one (factory default).

## 5. User flow in the Mini App (all gasless inside Metri)
1. User opens the Röbel Mini App (in Metri). Their Circles human + personal CRC already exist.
2. App checks `CitizenNFT.hasCitizenNFT(user)` → if not a citizen, show "nur für verifizierte Bürger".
3. The group trusts the citizen (owner-curated `trustBatchWithConditions`, or the condition
   auto-passes citizens) so their CRC is acceptable collateral.
4. **Convert:** `avatar.groupToken.mint(roebelGroup, amount)` (SDK) — deposits the user's
   personal CRC → mints RCRC to them. Show "X CRC → X Röbel-Taler".
5. **Hold / send:** RCRC is a normal Circles group token — transfer between citizens, redeem
   back to CRC. Demurrage applies (standard Circles ~7%/yr).
6. Optional: weekly-earned chart, connections (`sdk.data.getAggregatedTrustRelations`),
   treasury view — mirror Metri's home.

## 6. Mini App framework
- Start from **`aboutcircles/embedded-miniapp-boilerplate`** (GitHub) — minimal Circles
  embedded miniapp. Add `@aboutcircles/sdk` + `@aboutcircles/sdk-core`.
- The miniapp gets a Circles `runner` (the user's Metri Safe) injected by the host — use it
  for `groupToken.mint`, balances, transfers.
- Read RCRC balance: Hub ERC1155 `balanceOf(user, uint256(roebelGroup))`; or `avatar.balances`.

## 7. Hackathon MVP scope
1. Deploy `CitizenMembershipCondition(CitizenNFT 0x6FF3…)` on Gnosis.
2. Register the "Roebel" BaseGroup with `initialConditions=[condition]`, standard policy.
3. Miniapp screens: citizen check → convert CRC↔RCRC → balance + send. Done = a citizen
   converts CRC to RCRC and sends it to another citizen, non-citizens blocked.

## 8. Answers to the open questions
- **Mint policy vs group access:** mint policy = token mint/burn/redeem rules; **group
  access = membership condition (separate).** Citizen-gating goes in the *condition*, not
  the policy. You do **not** need a custom mint policy for citizen-gating — standard policy + CitizenNFT condition suffices.
- **Do you already have a group?** Yes, a prior collateral group exists
  (`0xAc2CeCdBead594F97358a0d3132454f24F3E470c`, standard policy, **no** citizen condition).
  For the Mini App, register a **fresh** "Roebel" group **with** the CitizenNFT condition (the
  old one has no condition and its policy is immutable).
