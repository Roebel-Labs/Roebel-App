# Step 5 (runbook, later): v3 NFT ownership → governance Timelock

**Not a script on purpose.** This runs weeks or months after the cutover, and it goes through a
citizen vote. Source: the migration spec, section "NFT ownership path (Max, 2026-09-26)".

## When

Run it only when **all** of these hold:

1. **Bootstrap is finalized.** `02-LATER-finalize-bootstrap.json` has been executed and
   `bootstrapFinalized()` returns `true` on both NFTs.
2. **The move window is closed.** Every citizen who wanted to move has moved, and
   `closeMoveWindow()` has been executed on both NFTs by the Safe. This is one-way: after it,
   nobody can move again, so announce the deadline in the app first.
3. **Governance v3 is live.** The v3 Governor has already carried at least one proposal
   end-to-end (vote, then Shamir tally, then `Succeeded`, then queue, then execute), using the
   new ceremony key. Transferring ownership to a Timelock that has never executed anything
   risks orphaning the NFTs.
4. **The Shamir federation for the v3 Governor works.** A Tally-Session for a v3 poll has
   collected 3 of 5 shares (MACI runbook §4 and §10).

## Why it cannot go wrong halfway

Both NFTs use `Ownable2Step`, which splits the handover into two parts:

- `transferOwnership(timelock)` only sets `pendingOwner`. The Safe **stays owner** until the
  Timelock calls `acceptOwnership()`.
- If the proposal fails, or the address was wrong, the Safe calls `transferOwnership(<right address>)`
  again. That overwrites `pendingOwner`, and nothing is lost.
- Owner powers are the same for either owner: band setters, `closeMoveWindow`, the handover
  itself, and bootstrap until it is finalized.

## Steps

### 5.1 Safe: propose the handover

This is one Transaction Builder batch from the new Attester Safe (at least 3 of 5 signatures).
Take the addresses from `deployments/gnosis-v3.json`.

| to | call | calldata |
|---|---|---|
| `addresses.attesterNFT` | `transferOwnership(addresses.timelock)` | `0xf2fde38b` + timelock left-padded to 32 bytes |
| `addresses.citizenNFT` | `transferOwnership(addresses.timelock)` | same |

Build the calldata with ethers, which is read-only:

```bash
node -e 'const {Interface}=require("ethers");const i=new Interface(["function transferOwnership(address)"]);console.log(i.encodeFunctionData("transferOwnership",[process.argv[1]]))' <timelock>
```

**Verify** that both of these hold: `pendingOwner() == timelock` and `owner() == Safe`.

### 5.2 Attester: governance proposal "Timelock übernimmt die Bürger- und Attester-NFTs"

Any AttesterNFTv3 holder can propose this on the **v3** Governor:

- `targets = [attesterNFT, citizenNFT]`
- `values = [0, 0]`
- `calldatas = [0x79ba5097, 0x79ba5097]` (this is `acceptOwnership()`)
- `description` = a German text explaining what changes. From now on, band changes need a
  citizen vote plus the Timelock delay.

This is a **real, executable** proposal: it has non-empty calldata, so the
`GovernorDisabledDeposit` trap for survey proposals (runbook §10.9) does not apply. Citizens
then vote in the MACI poll. After the deadline, the coordinator opens a Tally-Session, 3 of 5
Attesters submit their shares, and the tally lands on-chain.

### 5.3 Queue and execute

1. `governor.queue(targets, values, calldatas, keccak256(description))`.
2. Wait at least `timelockMinDelay`, which is 3600 s today (copied from the live v2 Timelock by 03).
3. `governor.execute(...)`. Anyone can execute, because the Timelock executor role is open,
   the same as on v2.
4. **Verify** all of these:
   - `owner() == timelock` on both NFTs
   - `pendingOwner() == 0x0`
   - `Safe` is no longer owner

### 5.4 Follow-ups

- **SignUpTokenGatekeeper:** its owner is the new Safe (set by 03). The only owner power is
  `setMaciInstance`. Choose one:
  - **Freeze it:** the Safe calls `renounceOwnership()`. The v3 MACI is final, so this is the
    recommended option.
  - **Move it to the Timelock:** `transferOwnership(timelock)`. This is one step, because the
    gatekeeper uses plain `Ownable`.
- **Circles group:** its owner stays whatever the Circles plan decides (spec D3: Circles
  migrates last). The group is **not** part of this step.
- Update `deployments/gnosis-v3.json` `status` and `owner`, `packages/blockchain`, and the
  CLAUDE.md "Gnosis Mainnet" section.
- From now on, the only way to change a threshold band is a governance proposal calling
  `setAttestationBands` / `setRevocationBands` / `setRejectionBands` (CitizenNFTv3) or
  `setApprovalBand` / `setRejectionBand` (AttesterNFTv3). By Max's decision, bands stay as in v2.
